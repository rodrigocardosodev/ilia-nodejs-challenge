jest.mock("crypto", () => ({ randomUUID: () => "event-id" }));

import { TransferBetweenUsersUseCase } from "../../../src/wallet/application/use-cases/TransferBetweenUsersUseCase";
import { AppError } from "../../../src/shared/http/AppError";

describe("TransferBetweenUsersUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("transfere e publica eventos de débito e crédito", async () => {
    const walletRepository = {
      transferBetweenUsers: jest.fn().mockResolvedValue({
        debitTransactionId: "tx-debit",
        creditTransactionId: "tx-credit",
        fromBalance: "80.0000",
        toBalance: "120.0000"
      })
    };
    const eventPublisher = { publishMany: jest.fn().mockResolvedValue(undefined) };
    const logger = makeLogger();

    const useCase = new TransferBetweenUsersUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    const result = await useCase.execute({
      fromWalletId: "wallet-1",
      toWalletId: "wallet-2",
      amount: "20.0000",
      idempotencyKey: "key-12345"
    });

    expect(result.debitTransactionId).toBe("tx-debit");
    expect(eventPublisher.publishMany).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishMany).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "wallet.transaction.created",
        payload: expect.objectContaining({
          eventId: "event-id",
          walletId: "wallet-1",
          transactionId: "tx-debit",
          type: "debit",
          amount: "20.0000",
          balance: "80.0000"
        })
      }),
      expect.objectContaining({
        name: "wallet.transaction.created",
        payload: expect.objectContaining({
          eventId: "event-id",
          walletId: "wallet-2",
          transactionId: "tx-credit",
          type: "credit",
          amount: "20.0000",
          balance: "120.0000"
        })
      })
    ]);
  });

  it("bloqueia transferência para a mesma carteira", async () => {
    const walletRepository = {
      transferBetweenUsers: jest.fn()
    };
    const eventPublisher = { publishMany: jest.fn() };
    const logger = makeLogger();

    const useCase = new TransferBetweenUsersUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        fromWalletId: "wallet-1",
        toWalletId: "wallet-1",
        amount: "20.0000",
        idempotencyKey: "key-12345"
      })
    ).rejects.toEqual(new AppError("INVALID_INPUT", 400, "Invalid request"));

    expect(walletRepository.transferBetweenUsers).not.toHaveBeenCalled();
    expect(eventPublisher.publishMany).not.toHaveBeenCalled();
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const walletRepository = {
      transferBetweenUsers: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publishMany: jest.fn() };
    const logger = makeLogger();

    const useCase = new TransferBetweenUsersUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        fromWalletId: "wallet-1",
        toWalletId: "wallet-2",
        amount: "20.0000",
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);

    expect(logger.error).toHaveBeenCalled();
  });

  it("propaga erro de saldo insuficiente", async () => {
    const error = new AppError("INSUFFICIENT_FUNDS", 422, "Insufficient funds");
    const walletRepository = {
      transferBetweenUsers: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publishMany: jest.fn() };
    const logger = makeLogger();

    const useCase = new TransferBetweenUsersUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    await expect(
      useCase.execute({
        fromWalletId: "wallet-1",
        toWalletId: "wallet-2",
        amount: "20.0000",
        idempotencyKey: "key-12345"
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INSUFFICIENT_FUNDS",
        statusCode: 422
      })
    );
    expect(logger.error).toHaveBeenCalled();
    expect(eventPublisher.publishMany).not.toHaveBeenCalled();
  });
});
