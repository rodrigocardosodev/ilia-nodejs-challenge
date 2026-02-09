import { ListTransactionsUseCase } from "../../../src/wallet/application/use-cases/ListTransactionsUseCase";

describe("ListTransactionsUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("retorna lista de transações", async () => {
    const list = [
      {
        id: "tx-1",
        walletId: "wallet-1",
        type: "credit",
        amount: 10,
        createdAt: new Date()
      }
    ];
    const walletRepository = { listTransactions: jest.fn().mockResolvedValue(list) };
    const logger = makeLogger();
    const useCase = new ListTransactionsUseCase(
      walletRepository as any,
      logger as any
    );

    const result = await useCase.execute("wallet-1", "credit");

    expect(result).toBe(list);
    expect(walletRepository.listTransactions).toHaveBeenCalledWith("wallet-1", "credit");
  });

  it("propaga erro do repositório", async () => {
    const error = new Error("db");
    const walletRepository = { listTransactions: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();
    const useCase = new ListTransactionsUseCase(
      walletRepository as any,
      logger as any
    );

    await expect(useCase.execute("wallet-1")).rejects.toBe(error);
  });
});
