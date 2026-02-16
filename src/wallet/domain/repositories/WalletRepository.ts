import { TransactionType } from "../entities/Transaction";

export type ApplyTransactionInput = {
  walletId: string;
  type: TransactionType;
  amount: string;
  idempotencyKey: string;
};

export type ApplyTransactionResult = {
  transactionId: string;
  createdAt: Date;
  balance: string;
};

export type TransferBetweenUsersInput = {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  idempotencyKey: string;
};

export type TransferBetweenUsersResult = {
  debitTransactionId: string;
  creditTransactionId: string;
  fromBalance: string;
  toBalance: string;
};

export type TransactionRecord = {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: string;
  createdAt: Date;
};

export type SagaStatus = "pending" | "completed" | "compensated" | "failed";

export type SagaRecord = {
  id: string;
  walletId: string;
  idempotencyKey: string;
  transactionId: string | null;
  type: TransactionType;
  amount: string;
  status: SagaStatus;
  step: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSagaInput = {
  id: string;
  walletId: string;
  idempotencyKey: string;
  transactionId?: string;
  type: TransactionType;
  amount: string;
  status: SagaStatus;
  step: string;
};

export type UpdateSagaInput = {
  id: string;
  transactionId?: string;
  status: SagaStatus;
  step: string;
};

export type CompensateTransactionInput = {
  walletId: string;
  type: TransactionType;
  amount: string;
  idempotencyKey: string;
};

export interface WalletRepository {
  ensureWallet(walletId: string): Promise<void>;
  getBalance(walletId: string): Promise<string>;
  applyTransaction(input: ApplyTransactionInput): Promise<ApplyTransactionResult>;
  transferBetweenUsers(input: TransferBetweenUsersInput): Promise<TransferBetweenUsersResult>;
  listTransactions(walletId: string, type?: TransactionType): Promise<TransactionRecord[]>;
  createSaga(input: CreateSagaInput): Promise<void>;
  findSagaByIdempotencyKey(idempotencyKey: string): Promise<SagaRecord | null>;
  updateSaga(input: UpdateSagaInput): Promise<void>;
  compensateTransaction(input: CompensateTransactionInput): Promise<void>;
}
