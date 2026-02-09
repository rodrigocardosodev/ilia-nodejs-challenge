import { WalletRepository } from "../../domain/repositories/WalletRepository";
import { Logger } from "../../../shared/observability/logger";

export class EnsureWalletUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly logger: Logger
  ) {}

  async execute(walletId: string): Promise<void> {
    this.logger.info("Ensure wallet started", { walletId });
    try {
      await this.walletRepository.ensureWallet(walletId);
      this.logger.info("Ensure wallet completed", { walletId });
    } catch (error) {
      this.logger.error("Ensure wallet failed", { walletId, error: String(error) });
      throw error;
    }
  }
}
