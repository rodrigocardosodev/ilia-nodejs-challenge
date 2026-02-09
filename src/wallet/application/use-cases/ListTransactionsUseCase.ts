import { TransactionType } from "../../domain/entities/Transaction";
import { WalletRepository } from "../../domain/repositories/WalletRepository";
import { Logger } from "../../../shared/observability/logger";

export class ListTransactionsUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly logger: Logger
  ) {}

  async execute(walletId: string, type?: TransactionType) {
    this.logger.info("List transactions started", { walletId, type });
    try {
      const transactions = await this.walletRepository.listTransactions(
        walletId,
        type
      );
      this.logger.info("List transactions completed", {
        walletId,
        count: transactions.length
      });
      return transactions;
    } catch (error) {
      this.logger.error("List transactions failed", {
        walletId,
        error: String(error)
      });
      throw error;
    }
  }
}
