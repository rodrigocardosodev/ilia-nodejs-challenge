import { GetBalanceUseCase } from "../../../src/wallet/application/use-cases/GetBalanceUseCase";

describe("GetBalanceUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("retorna saldo", async () => {
    const walletRepository = { getBalance: jest.fn().mockResolvedValue(120) };
    const logger = makeLogger();
    const useCase = new GetBalanceUseCase(walletRepository as any, logger as any);

    const result = await useCase.execute("wallet-1");

    expect(result).toBe(120);
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const walletRepository = { getBalance: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();
    const useCase = new GetBalanceUseCase(walletRepository as any, logger as any);

    await expect(useCase.execute("wallet-1")).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalled();
  });
});
