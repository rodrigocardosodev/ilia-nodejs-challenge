import { EnsureWalletUseCase } from "../../../src/wallet/application/use-cases/EnsureWalletUseCase";

describe("EnsureWalletUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("garante carteira", async () => {
    const walletRepository = { ensureWallet: jest.fn().mockResolvedValue(undefined) };
    const logger = makeLogger();
    const useCase = new EnsureWalletUseCase(walletRepository as any, logger as any);

    await useCase.execute("wallet-1");

    expect(walletRepository.ensureWallet).toHaveBeenCalledWith("wallet-1");
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const walletRepository = { ensureWallet: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();
    const useCase = new EnsureWalletUseCase(walletRepository as any, logger as any);

    await expect(useCase.execute("wallet-1")).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalled();
  });
});
