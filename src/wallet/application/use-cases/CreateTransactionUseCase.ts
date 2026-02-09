import { randomUUID } from "crypto";
import { WalletRepository } from "../../domain/repositories/WalletRepository";
import { TransactionType } from "../../domain/entities/Transaction";
import { EventPublisher } from "../ports/EventPublisher";
import { Logger } from "../../../shared/observability/logger";
import { AppError } from "../../../shared/http/AppError";

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
      const existingSaga = await this.walletRepository.findSagaByIdempotencyKey(
        input.idempotencyKey
      );
      if (existingSaga) {
        if (existingSaga.status === "completed") {
          return await this.walletRepository.applyTransaction(input);
        }
        throw new AppError("CONFLICT", 409, "Transaction rolled back");
      }

      const sagaId = randomUUID();
      await this.walletRepository.createSaga({
        id: sagaId,
        walletId: input.walletId,
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        amount: input.amount,
        status: "pending",
        step: "apply_transaction"
      });

      let result: CreateTransactionOutput | null = null;
      try {
        result = await this.walletRepository.applyTransaction(input);
        await this.walletRepository.updateSaga({
          id: sagaId,
          transactionId: result.transactionId,
          status: "pending",
          step: "publish_event"
        });

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

        await this.walletRepository.updateSaga({
          id: sagaId,
          transactionId: result.transactionId,
          status: "completed",
          step: "publish_event"
        });

        this.logger.info("Create transaction completed", {
          walletId: input.walletId,
          transactionId: result.transactionId
        });

        return result;
      } catch (error) {
        if (result) {
          const compensationType = input.type === "credit" ? "debit" : "credit";
          const compensationKey = `${input.idempotencyKey}:compensate`;
          try {
            await this.walletRepository.compensateTransaction({
              walletId: input.walletId,
              type: compensationType,
              amount: input.amount,
              idempotencyKey: compensationKey
            });
            await this.walletRepository.updateSaga({
              id: sagaId,
              transactionId: result.transactionId,
              status: "compensated",
              step: "compensate"
            });
          } catch (compensationError) {
            await this.walletRepository.updateSaga({
              id: sagaId,
              transactionId: result.transactionId,
              status: "failed",
              step: "compensate"
            });
            this.logger.error("Transaction compensation failed", {
              walletId: input.walletId,
              transactionId: result.transactionId,
              error: String(compensationError)
            });
          }
        }
        throw error;
      }
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
