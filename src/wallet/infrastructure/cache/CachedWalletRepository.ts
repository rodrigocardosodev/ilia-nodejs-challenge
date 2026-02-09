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

export class CachedWalletRepository implements WalletRepository {
  constructor(
    private readonly redis: Redis,
    private readonly baseRepository: WalletRepository,
    private readonly metrics: Metrics,
    private readonly logger: Logger
  ) {}

  async ensureWallet(walletId: string): Promise<void> {
    await this.baseRepository.ensureWallet(walletId);
  }

  async getBalance(walletId: string): Promise<number> {
    const cacheKey = this.balanceKey(walletId);
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        this.metrics.recordCacheHit("wallet_balance");
        return Number(cached);
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
      await this.redis.set(cacheKey, balance.toString(), "EX", 60);
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
      await this.redis.set(this.balanceKey(input.walletId), result.balance.toString(), "EX", 60);
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
        result.fromBalance.toString(),
        "EX",
        60
      );
      await this.redis.set(
        this.balanceKey(input.toWalletId),
        result.toBalance.toString(),
        "EX",
        60
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
      const balance = await this.baseRepository.getBalance(input.walletId);
      await this.redis.set(this.balanceKey(input.walletId), balance.toString(), "EX", 60);
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
