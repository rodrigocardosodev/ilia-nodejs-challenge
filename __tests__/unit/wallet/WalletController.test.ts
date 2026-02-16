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
        { userId: "wallet-1", body: { amount: "1.0000" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("bloqueia criação de transação sem usuário autenticado", async () => {
    const controller = makeController();

    await expect(
      controller.createTransaction(
        { userId: "", body: { type: "CREDIT", amount: "10.0000" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("bloqueia criação de transação sem userId no request", async () => {
    const controller = makeController();

    await expect(
      controller.createTransaction(
        { body: { type: "CREDIT", amount: "10.0000" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("valida amount zero na transação", async () => {
    const controller = makeController();

    await expect(
      controller.createTransaction(
        { userId: "wallet-1", body: { user_id: "wallet-1", type: "CREDIT", amount: "0.0000" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });

  it("cria transação com sucesso", async () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date(),
        balance: "100.0000"
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
        userId: "wallet-1",
        body: { user_id: "wallet-1", type: "CREDIT", amount: "10" },
        get: () => "idem-1"
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(201);
  });

  it("retorna 422 quando createTransaction não recebe Idempotency-Key", async () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-debit",
        createdAt: new Date(),
        balance: "90.0000"
      })
    };
    const controller = new WalletController(
      createTransactionUseCase as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any
    );

    await expect(
      controller.createTransaction(
        {
          userId: "wallet-1",
          body: { type: "DEBIT", amount: "10.0000" },
          get: () => undefined
        } as any,
        res() as any
      )
    ).rejects.toEqual(
      new AppError("IDEMPOTENCY_KEY_REQUIRED", 422, "Idempotency-Key header is required")
    );

    expect(createTransactionUseCase.execute).not.toHaveBeenCalled();
  });

  it("faz depósito", async () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-2",
        createdAt: new Date(),
        balance: "110.0000"
      })
    };
    const controller = new WalletController(
      createTransactionUseCase as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any
    );
    const response = res();

    await controller.deposit(
      { userId: "wallet-1", body: { amount: "10.0000" }, get: () => "idem-2" } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      id: "tx-2",
      user_id: "wallet-1",
      amount: "10.0000",
      type: "CREDIT"
    });
  });

  it("retorna 422 quando deposit não recebe Idempotency-Key", async () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-3",
        createdAt: new Date(),
        balance: "120.0000"
      })
    };
    const controller = new WalletController(
      createTransactionUseCase as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any
    );

    await expect(
      controller.deposit(
        { userId: "wallet-1", body: { amount: "20.0000" }, get: () => undefined } as any,
        res() as any
      )
    ).rejects.toEqual(
      new AppError("IDEMPOTENCY_KEY_REQUIRED", 422, "Idempotency-Key header is required")
    );

    expect(createTransactionUseCase.execute).not.toHaveBeenCalled();
  });

  it("bloqueia depósito sem usuário", async () => {
    const controller = makeController();

    await expect(
      controller.deposit({ userId: "" } as any, res() as any)
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("bloqueia depósito sem userId no request", async () => {
    const controller = makeController();

    await expect(
      controller.deposit({ body: { amount: "10.0000" } } as any, res() as any)
    ).rejects.toEqual(
      new AppError("UNAUTHORIZED", 401, "Unauthorized")
    );
  });

  it("valida body do depósito", async () => {
    const controller = makeController();

    await expect(
      controller.deposit(
        { userId: "wallet-1", body: { amount: "-1.0000" } } as any,
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
      { execute: jest.fn().mockResolvedValue("200.0000") } as any,
      { execute: jest.fn() } as any
    );
    const response = res();

    await controller.getBalance({ userId: "wallet-1" } as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ amount: "200.0000" });
  });

  it("bloqueia listagem sem usuário", async () => {
    const controller = makeController();

    await expect(
      controller.listTransactions({ userId: "" } as any, res() as any)
    ).rejects.toEqual(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
  });

  it("bloqueia listagem sem userId no request", async () => {
    const controller = makeController();

    await expect(controller.listTransactions({ query: {} } as any, res() as any)).rejects.toEqual(
      new AppError("UNAUTHORIZED", 401, "Unauthorized")
    );
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
          amount: "10.0000",
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
        amount: "10.0000"
      }
    ]);
  });

  it("lista transações filtrando por DEBIT e mapeando tipo de saída", async () => {
    const listTransactionsUseCase = {
      execute: jest.fn().mockResolvedValue([
        {
          id: "tx-2",
          walletId: "wallet-1",
          type: "debit",
          amount: "25.0000",
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
      { userId: "wallet-1", query: { type: "DEBIT" } } as any,
      response as any
    );

    expect(listTransactionsUseCase.execute).toHaveBeenCalledWith("wallet-1", "debit");
    expect(response.json).toHaveBeenCalledWith([
      {
        id: "tx-2",
        user_id: "wallet-1",
        type: "DEBIT",
        amount: "25.0000"
      }
    ]);
  });

  it("rejeita amount com mais de 4 casas", async () => {
    const controller = makeController();

    await expect(
      controller.createTransaction(
        { userId: "wallet-1", body: { type: "CREDIT", amount: "10.12345" } } as any,
        res() as any
      )
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));
  });
});
