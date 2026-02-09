jest.mock("crypto", () => ({ randomUUID: () => "event-id" }));

import { CreateTransactionUseCase } from "../../../src/wallet/application/use-cases/CreateTransactionUseCase";

describe("CreateTransactionUseCase", () => {
  const makeLogger = () => ({
    info: jest.fn(),
    error: jest.fn()
  });

  it("aplica transação e publica evento", async () => {
    const walletRepository = {
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

  it("propaga erro quando repositório falha", async () => {
    const error = new Error("db");
    const walletRepository = {
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
});
