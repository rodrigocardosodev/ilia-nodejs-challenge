import { RecordWalletEventUseCase } from "../../../src/users/application/use-cases/RecordWalletEventUseCase";

describe("RecordWalletEventUseCase", () => {
  it("registra última transação", async () => {
    const walletEventRepository = {
      recordLatestTransaction: jest.fn().mockResolvedValue(undefined)
    };
    const useCase = new RecordWalletEventUseCase(walletEventRepository as any);

    await useCase.execute("user-1", "tx-1", "2024-01-01T00:00:00.000Z");

    expect(walletEventRepository.recordLatestTransaction).toHaveBeenCalledWith(
      "user-1",
      "tx-1",
      "2024-01-01T00:00:00.000Z"
    );
  });
});
