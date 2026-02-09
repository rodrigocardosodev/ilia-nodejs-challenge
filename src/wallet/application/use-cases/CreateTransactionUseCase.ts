import { randomUUID } from "crypto";
import { WalletRepository } from "../../domain/repositories/WalletRepository";
import { TransactionType } from "../../domain/entities/Transaction";
import { EventPublisher } from "../ports/EventPublisher";
import { Logger } from "../../../shared/observability/logger";

export type CreateTransactionInput = {
  walletId: string;
  type: TransactionType;
  amount: number;
  idempotencyKey: string;
};

export type CreateTransactionOutput = {
  transactionId: string;
  createdAt: Date;
  balance: number;
};

export class CreateTransactionUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly logger: Logger
  ) {}

  async execute(input: CreateTransactionInput): Promise<CreateTransactionOutput> {
    this.logger.info("Create transaction started", {
      walletId: input.walletId,
      type: input.type
    });

    try {
      const result = await this.walletRepository.applyTransaction(input);

      await this.eventPublisher.publish({
        name: "wallet.transaction.created",
        payload: {
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          walletId: input.walletId,
          transactionId: result.transactionId,
          type: input.type,
          amount: input.amount,
          balance: result.balance
        }
      });

      this.logger.info("Create transaction completed", {
        walletId: input.walletId,
        transactionId: result.transactionId
      });

      return result;
    } catch (error) {
      this.logger.error("Create transaction failed", {
        walletId: input.walletId,
        type: input.type,
        error: String(error)
      });
      throw error;
    }
  }
}
