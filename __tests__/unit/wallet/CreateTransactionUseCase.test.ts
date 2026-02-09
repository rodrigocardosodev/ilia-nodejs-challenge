jest.mock("crypto", () => ({ randomUUID: () => "event-id" }));

import { CreateTransactionUseCase } from "../../../src/wallet/application/use-cases/CreateTransactionUseCase";
import { AppError } from "../../../src/shared/http/AppError";

describe("CreateTransactionUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("aplica transação e publica evento", async () => {
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockResolvedValue(undefined),
      updateSaga: jest.fn().mockResolvedValue(undefined),
      compensateTransaction: jest.fn().mockResolvedValue(undefined),
      applyTransaction: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date("2024-01-01"),
        balance: 100
      })
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    const result = await useCase.execute({
      walletId: "wallet-1",
      type: "credit",
      amount: 50,
      idempotencyKey: "key-12345"
    });

    expect(result.transactionId).toBe("tx-1");
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "wallet.transaction.created",
        payload: expect.objectContaining({
          eventId: "event-id",
          walletId: "wallet-1",
          transactionId: "tx-1",
          type: "credit",
          amount: 50,
          balance: 100
        })
      })
    );
  });

  it("retorna conflito quando saga já compensada", async () => {
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue({
        id: "saga-1",
        walletId: "wallet-1",
        idempotencyKey: "key-12345",
        transactionId: "tx-1",
        type: "credit",
        amount: 50,
        status: "compensated",
        step: "compensate",
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      applyTransaction: jest.fn()
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "CONFLICT",
        statusCode: 409
      })
    );
  });

  it("reusa saga completada", async () => {
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue({
        id: "saga-1",
        walletId: "wallet-1",
        idempotencyKey: "key-12345",
        transactionId: "tx-1",
        type: "credit",
        amount: 50,
        status: "completed",
        step: "publish_event",
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      applyTransaction: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date(),
        balance: 100
      })
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    const result = await useCase.execute({
      walletId: "wallet-1",
      type: "credit",
      amount: 50,
      idempotencyKey: "key-12345"
    });

    expect(result.transactionId).toBe("tx-1");
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockResolvedValue(undefined),
      updateSaga: jest.fn().mockResolvedValue(undefined),
      compensateTransaction: jest.fn().mockResolvedValue(undefined),
      applyTransaction: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);

    expect(logger.error).toHaveBeenCalled();
  });

  it("faz compensação quando publicar evento falha", async () => {
    const error = new Error("publish");
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockResolvedValue(undefined),
      updateSaga: jest.fn().mockResolvedValue(undefined),
      compensateTransaction: jest.fn().mockResolvedValue(undefined),
      applyTransaction: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date("2024-01-01"),
        balance: 100
      })
    };
    const eventPublisher = { publish: jest.fn().mockRejectedValue(error) };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);

    expect(walletRepository.compensateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-1",
        type: "debit",
        amount: 50,
        idempotencyKey: "key-12345:compensate"
      })
    );
  });

  it("marca saga como failed quando compensação falha", async () => {
    const publishError = new Error("publish");
    const compensationError = new Error("compensate");
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockResolvedValue(undefined),
      updateSaga: jest.fn().mockResolvedValue(undefined),
      compensateTransaction: jest.fn().mockRejectedValue(compensationError),
      applyTransaction: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date("2024-01-01"),
        balance: 100
      })
    };
    const eventPublisher = { publish: jest.fn().mockRejectedValue(publishError) };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(publishError);

    expect(walletRepository.updateSaga).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        step: "compensate"
      })
    );
  });

  it("retorna conflito quando saga está pendente", async () => {
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue({
        id: "saga-1",
        walletId: "wallet-1",
        idempotencyKey: "key-12345",
        transactionId: null,
        type: "credit",
        amount: 50,
        status: "pending",
        step: "apply_transaction",
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      applyTransaction: jest.fn()
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "CONFLICT",
        statusCode: 409
      })
    );
  });

  it("propaga erro quando createSaga falha", async () => {
    const error = new Error("saga");
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);
  });

  it("compensa quando updateSaga falha", async () => {
    const error = new Error("update");
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockResolvedValue(undefined),
      updateSaga: jest.fn().mockRejectedValue(error),
      compensateTransaction: jest.fn().mockResolvedValue(undefined),
      applyTransaction: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date("2024-01-01"),
        balance: 100
      })
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "credit",
        amount: 50,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);

    expect(walletRepository.compensateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-1",
        type: "debit",
        amount: 50
      })
    );
  });

  it("propaga erro de saldo insuficiente", async () => {
    const error = new AppError("INSUFFICIENT_FUNDS", 422, "Insufficient funds");
    const walletRepository = {
      findSagaByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createSaga: jest.fn().mockResolvedValue(undefined),
      updateSaga: jest.fn().mockResolvedValue(undefined),
      compensateTransaction: jest.fn().mockResolvedValue(undefined),
      applyTransaction: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new CreateTransactionUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        walletId: "wallet-1",
        type: "debit",
        amount: 5000,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);
  });
});
