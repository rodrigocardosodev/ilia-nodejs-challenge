import Redis from "ioredis";
import {
  ApplyTransactionInput,
  ApplyTransactionResult,
  CompensateTransactionInput,
  CreateSagaInput,
  SagaRecord,
  UpdateSagaInput,
  TransactionRecord,
  TransferBetweenUsersInput,
  TransferBetweenUsersResult,
  WalletRepository
} from "../../domain/repositories/WalletRepository";
import { Metrics } from "../../../shared/observability/metrics";
import { Logger } from "../../../shared/observability/logger";
import { normalizeMoney } from "../../../shared/money";

export class CachedWalletRepository implements WalletRepository {
  private readonly ttlSeconds = 60;

  constructor(
    private readonly redis: Redis,
    private readonly baseRepository: WalletRepository,
    private readonly metrics: Metrics,
    private readonly logger: Logger
  ) {}

  async ensureWallet(walletId: string): Promise<void> {
    await this.baseRepository.ensureWallet(walletId);
  }

  async getBalance(walletId: string): Promise<string> {
    const cacheKey = this.balanceKey(walletId);
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        this.metrics.recordCacheHit("wallet_balance");
        return normalizeMoney(cached);
      }
    } catch (error) {
      this.logger.warn("Failed to read wallet balance cache", {
        walletId,
        error: String(error)
      });
    }
    this.metrics.recordCacheMiss("wallet_balance");
    const balance = await this.baseRepository.getBalance(walletId);
    try {
      await this.redis.set(cacheKey, normalizeMoney(balance), "EX", this.ttlSeconds);
    } catch (error) {
      this.logger.warn("Failed to update wallet balance cache", {
        walletId,
        error: String(error)
      });
    }
    return balance;
  }

  async applyTransaction(input: ApplyTransactionInput): Promise<ApplyTransactionResult> {
    const result = await this.baseRepository.applyTransaction(input);
    try {
      await this.redis.set(
        this.balanceKey(input.walletId),
        normalizeMoney(result.balance),
        "EX",
        this.ttlSeconds
      );
    } catch (error) {
      this.logger.warn("Failed to update wallet balance cache after transaction", {
        walletId: input.walletId,
        error: String(error)
      });
    }
    return result;
  }

  async transferBetweenUsers(
    input: TransferBetweenUsersInput
  ): Promise<TransferBetweenUsersResult> {
    const result = await this.baseRepository.transferBetweenUsers(input);
    try {
      await this.redis.set(
        this.balanceKey(input.fromWalletId),
        normalizeMoney(result.fromBalance),
        "EX",
        this.ttlSeconds
      );
      await this.redis.set(
        this.balanceKey(input.toWalletId),
        normalizeMoney(result.toBalance),
        "EX",
        this.ttlSeconds
      );
    } catch (error) {
      this.logger.warn("Failed to update wallet balance cache after transfer", {
        fromWalletId: input.fromWalletId,
        toWalletId: input.toWalletId,
        error: String(error)
      });
    }
    return result;
  }

  async listTransactions(
    walletId: string,
    type?: "credit" | "debit"
  ): Promise<TransactionRecord[]> {
    return this.baseRepository.listTransactions(walletId, type);
  }

  async createSaga(input: CreateSagaInput): Promise<void> {
    await this.baseRepository.createSaga(input);
  }

  async findSagaByIdempotencyKey(idempotencyKey: string): Promise<SagaRecord | null> {
    return this.baseRepository.findSagaByIdempotencyKey(idempotencyKey);
  }

  async updateSaga(input: UpdateSagaInput): Promise<void> {
    await this.baseRepository.updateSaga(input);
  }

  async compensateTransaction(input: CompensateTransactionInput): Promise<void> {
    await this.baseRepository.compensateTransaction(input);
    try {
      await this.redis.del(this.balanceKey(input.walletId));
      const balance = await this.baseRepository.getBalance(input.walletId);
      await this.redis.set(
        this.balanceKey(input.walletId),
        normalizeMoney(balance),
        "EX",
        this.ttlSeconds
      );
    } catch (error) {
      this.logger.warn("Failed to update wallet balance cache after compensation", {
        walletId: input.walletId,
        error: String(error)
      });
    }
  }

  private balanceKey(walletId: string): string {
    return `wallet:balance:${walletId}`;
  }
}
