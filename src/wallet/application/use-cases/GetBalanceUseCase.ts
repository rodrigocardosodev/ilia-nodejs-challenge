import { WalletRepository } from "../../domain/repositories/WalletRepository";
import { Logger } from "../../../shared/observability/logger";

export class GetBalanceUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly logger: Logger
  ) {}

  async execute(walletId: string): Promise<number> {
    this.logger.info("Get balance started", { walletId });
    try {
      const balance = await this.walletRepository.getBalance(walletId);
      this.logger.info("Get balance completed", { walletId });
      return balance;
    } catch (error) {
      this.logger.error("Get balance failed", { walletId, error: String(error) });
      throw error;
    }
  }
}
