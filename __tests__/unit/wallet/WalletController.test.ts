import { WalletController } from "../../../src/wallet/interfaces/http/WalletController";
import { AppError } from "../../../src/shared/http/AppError";

describe("WalletController", () => {
  const makeController = () => {
    const createTransactionUseCase = { execute: jest.fn() };
    const getBalanceUseCase = { execute: jest.fn() };
    const listTransactionsUseCase = { execute: jest.fn() };
    return new WalletController(
      createTransactionUseCase as any,
      getBalanceUseCase as any,
      listTransactionsUseCase as any
    );
  };

  const res = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  it("valida body de transação", async () => {
    const controller = makeController();

    await expect(
      controller.createTransaction(
        { body: { amount: 1 } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("bloqueia saldo sem usuário", async () => {
    const controller = makeController();

    await expect(
      controller.getBalance({ userId: "" } as any, res() as any)
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("bloqueia listagem sem usuário", async () => {
    const controller = makeController();

    await expect(
      controller.listTransactions({ userId: "" } as any, res() as any)
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });
});
