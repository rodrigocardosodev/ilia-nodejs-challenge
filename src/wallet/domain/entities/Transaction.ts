export type TransactionId = string;
export type TransactionType = "credit" | "debit";

export class Transaction {
  constructor(
    public readonly id: TransactionId,
    public readonly walletId: string,
    public readonly type: TransactionType,
    public readonly amount: string,
    public readonly idempotencyKey: string,
    public readonly createdAt: Date
  ) {}
}
