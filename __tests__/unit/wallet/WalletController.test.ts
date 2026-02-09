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

  it("cria transação com sucesso", async () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date(),
        balance: 100
      })
    };
    const controller = new WalletController(
      createTransactionUseCase as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any
    );
    const response = res();

    await controller.createTransaction(
      {
        body: { user_id: "wallet-1", type: "CREDIT", amount: 10 },
        get: () => "idem-1"
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("faz depósito", async () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-2",
        createdAt: new Date(),
        balance: 110
      })
    };
    const controller = new WalletController(
      createTransactionUseCase as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any
    );
    const response = res();

    await controller.deposit(
      { userId: "wallet-1", body: { amount: 10 }, get: () => "idem-2" } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      id: "tx-2",
      user_id: "wallet-1",
      amount: 10,
      type: "CREDIT"
    });
  });

  it("bloqueia depósito sem usuário", async () => {
    const controller = makeController();

    await expect(
      controller.deposit({ userId: "" } as any, res() as any)
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("valida body do depósito", async () => {
    const controller = makeController();

    await expect(
      controller.deposit(
        { userId: "wallet-1", body: { amount: -1 } } as any,
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

  it("retorna saldo", async () => {
    const controller = new WalletController(
      { execute: jest.fn() } as any,
      { execute: jest.fn().mockResolvedValue(200) } as any,
      { execute: jest.fn() } as any
    );
    const response = res();

    await controller.getBalance({ userId: "wallet-1" } as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ amount: 200 });
  });

  it("bloqueia listagem sem usuário", async () => {
    const controller = makeController();

    await expect(
      controller.listTransactions({ userId: "" } as any, res() as any)
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("valida filtro inválido na listagem", async () => {
    const controller = makeController();

    await expect(
      controller.listTransactions(
        { userId: "wallet-1", query: { type: "INVALID" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("lista transações", async () => {
    const listTransactionsUseCase = {
      execute: jest.fn().mockResolvedValue([
        {
          id: "tx-1",
          walletId: "wallet-1",
          type: "credit",
          amount: 10,
          createdAt: new Date()
        }
      ])
    };
    const controller = new WalletController(
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any,
      listTransactionsUseCase as any
    );
    const response = res();

    await controller.listTransactions(
      { userId: "wallet-1", query: {} } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith([
      {
        id: "tx-1",
        user_id: "wallet-1",
        type: "CREDIT",
        amount: 10
      }
    ]);
  });
});
