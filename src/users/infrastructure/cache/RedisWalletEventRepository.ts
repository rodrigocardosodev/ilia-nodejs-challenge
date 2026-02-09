import Redis from "ioredis";
import { WalletEventRepository } from "../../application/ports/WalletEventRepository";

export class RedisWalletEventRepository implements WalletEventRepository {
  constructor(private readonly redis: Redis) {}

  async recordLatestTransaction(
    userId: string,
    transactionId: string,
    occurredAt: string
  ): Promise<void> {
    await this.redis.set(
      this.key(userId),
      JSON.stringify({ transactionId, occurredAt }),
      "EX",
      300
    );
  }

  private key(userId: string): string {
    return `users:last-wallet-tx:${userId}`;
  }
}
