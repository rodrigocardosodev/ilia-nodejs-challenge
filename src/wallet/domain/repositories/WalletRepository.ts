import { TransactionType } from "../entities/Transaction";

export type ApplyTransactionInput = {
  walletId: string;
  type: TransactionType;
  amount: number;
  idempotencyKey: string;
};

export type ApplyTransactionResult = {
  transactionId: string;
  createdAt: Date;
  balance: number;
};

export type TransferBetweenUsersInput = {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  idempotencyKey: string;
};

export type TransferBetweenUsersResult = {
  debitTransactionId: string;
  creditTransactionId: string;
  fromBalance: number;
  toBalance: number;
};

export type TransactionRecord = {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  createdAt: Date;
};

export interface WalletRepository {
  ensureWallet(walletId: string): Promise<void>;
  getBalance(walletId: string): Promise<number>;
  applyTransaction(input: ApplyTransactionInput): Promise<ApplyTransactionResult>;
  transferBetweenUsers(
    input: TransferBetweenUsersInput
  ): Promise<TransferBetweenUsersResult>;
  listTransactions(
    walletId: string,
    type?: TransactionType
  ): Promise<TransactionRecord[]>;
}
