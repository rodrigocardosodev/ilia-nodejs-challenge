import Redis from "ioredis";
import {
  ApplyTransactionInput,
  ApplyTransactionResult,
  TransactionRecord,
  TransferBetweenUsersInput,
  TransferBetweenUsersResult,
  WalletRepository
} from "../../domain/repositories/WalletRepository";
import { Metrics } from "../../../shared/observability/metrics";

export class CachedWalletRepository implements WalletRepository {
  constructor(
    private readonly redis: Redis,
    private readonly baseRepository: WalletRepository,
    private readonly metrics: Metrics
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
    } catch {}
    this.metrics.recordCacheMiss("wallet_balance");
    const balance = await this.baseRepository.getBalance(walletId);
    try {
      await this.redis.set(cacheKey, balance.toString(), "EX", 60);
    } catch {}
    return balance;
  }

  async applyTransaction(
    input: ApplyTransactionInput
  ): Promise<ApplyTransactionResult> {
    const result = await this.baseRepository.applyTransaction(input);
    try {
      await this.redis.set(
        this.balanceKey(input.walletId),
        result.balance.toString(),
        "EX",
        60
      );
    } catch {}
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
    } catch {}
    return result;
  }

  async listTransactions(
    walletId: string,
    type?: "credit" | "debit"
  ): Promise<TransactionRecord[]> {
    return this.baseRepository.listTransactions(walletId, type);
  }

  private balanceKey(walletId: string): string {
    return `wallet:balance:${walletId}`;
  }
}
