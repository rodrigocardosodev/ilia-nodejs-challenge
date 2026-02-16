import { randomUUID } from "crypto";
import { WalletRepository } from "../../domain/repositories/WalletRepository";
import { EventPublisher } from "../ports/EventPublisher";
import { Logger } from "../../../shared/observability/logger";
import { AppError } from "../../../shared/http/AppError";

export type TransferBetweenUsersInput = {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  idempotencyKey: string;
};

export type TransferBetweenUsersOutput = {
  debitTransactionId: string;
  creditTransactionId: string;
  fromBalance: string;
  toBalance: string;
};

export class TransferBetweenUsersUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly logger: Logger
  ) {}

  async execute(input: TransferBetweenUsersInput): Promise<TransferBetweenUsersOutput> {
    if (input.fromWalletId === input.toWalletId) {
      throw new AppError("INVALID_INPUT", 400, "Invalid request");
    }
    this.logger.info("Transfer between users started", {
      fromWalletId: input.fromWalletId,
      toWalletId: input.toWalletId
    });

    try {
      const result = await this.walletRepository.transferBetweenUsers(input);

      await this.eventPublisher.publishMany([
        {
          name: "wallet.transaction.created",
          payload: {
            eventId: randomUUID(),
            occurredAt: new Date().toISOString(),
            walletId: input.fromWalletId,
            transactionId: result.debitTransactionId,
            type: "debit",
            amount: input.amount,
            balance: result.fromBalance
          }
        },
        {
          name: "wallet.transaction.created",
          payload: {
            eventId: randomUUID(),
            occurredAt: new Date().toISOString(),
            walletId: input.toWalletId,
            transactionId: result.creditTransactionId,
            type: "credit",
            amount: input.amount,
            balance: result.toBalance
          }
        }
      ]);

      this.logger.info("Transfer between users completed", {
        fromWalletId: input.fromWalletId,
        toWalletId: input.toWalletId,
        debitTransactionId: result.debitTransactionId,
        creditTransactionId: result.creditTransactionId
      });

      return result;
    } catch (error) {
      this.logger.error("Transfer between users failed", {
        fromWalletId: input.fromWalletId,
        toWalletId: input.toWalletId,
        error: String(error)
      });
      throw error;
    }
  }
}
