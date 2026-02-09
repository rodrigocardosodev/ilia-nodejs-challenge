jest.mock("crypto", () => ({ randomUUID: () => "event-id" }));

import { TransferBetweenUsersUseCase } from "../../../src/wallet/application/use-cases/TransferBetweenUsersUseCase";

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
        fromBalance: 80,
        toBalance: 120
      })
    };
    const eventPublisher = { publish: jest.fn() };
    const logger = makeLogger();

    const useCase = new TransferBetweenUsersUseCase(
      walletRepository as any,
      eventPublisher as any,
      logger as any
    );

    const result = await useCase.execute({
      fromWalletId: "wallet-1",
      toWalletId: "wallet-2",
      amount: 20,
      idempotencyKey: "key-12345"
    });

    expect(result.debitTransactionId).toBe("tx-debit");
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    expect(eventPublisher.publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "wallet.transaction.created",
        payload: expect.objectContaining({
          eventId: "event-id",
          walletId: "wallet-1",
          transactionId: "tx-debit",
          type: "debit",
          amount: 20,
          balance: 80
        })
      })
    );
    expect(eventPublisher.publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "wallet.transaction.created",
        payload: expect.objectContaining({
          eventId: "event-id",
          walletId: "wallet-2",
          transactionId: "tx-credit",
          type: "credit",
          amount: 20,
          balance: 120
        })
      })
    );
  });

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const walletRepository = {
      transferBetweenUsers: jest.fn().mockRejectedValue(error)
    };
    const eventPublisher = { publish: jest.fn() };
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
        amount: 20,
        idempotencyKey: "key-12345"
      })
    ).rejects.toBe(error);

    expect(logger.error).toHaveBeenCalled();
  });
});
