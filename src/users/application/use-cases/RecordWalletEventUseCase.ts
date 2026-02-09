import { WalletEventRepository } from "../ports/WalletEventRepository";

export class RecordWalletEventUseCase {
  constructor(private readonly walletEventRepository: WalletEventRepository) {}

  async execute(userId: string, transactionId: string, occurredAt: string) {
    await this.walletEventRepository.recordLatestTransaction(
      userId,
      transactionId,
      occurredAt
    );
  }
}
