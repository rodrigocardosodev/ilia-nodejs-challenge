export interface WalletEventRepository {
  recordLatestTransaction(
    userId: string,
    transactionId: string,
    occurredAt: string
  ): Promise<void>;
}
