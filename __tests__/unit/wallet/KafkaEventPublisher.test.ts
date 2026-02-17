const sendMock = jest.fn();
const resolveTopicMock = jest.fn();
const encodeMock = jest.fn();
const signMock = jest.fn();

jest.mock("kafkajs", () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: () => ({
      send: sendMock,
      connect: jest.fn(),
      disconnect: jest.fn()
    })
  }))
}));

jest.mock("jsonwebtoken", () => ({
  sign: (...args: unknown[]) => signMock(...args)
}));

jest.mock("../../../src/shared/messaging/SchemaRegistryEventCodec", () => ({
  SchemaRegistryEventCodec: jest.fn().mockImplementation(() => ({
    resolveTopic: (...args: unknown[]) => resolveTopicMock(...args),
    encode: (...args: unknown[]) => encodeMock(...args)
  }))
}));

import { KafkaEventPublisher } from "../../../src/wallet/infrastructure/messaging/KafkaEventPublisher";

describe("Wallet KafkaEventPublisher", () => {
  beforeEach(() => {
    sendMock.mockReset();
    resolveTopicMock.mockReset();
    encodeMock.mockReset();
    signMock.mockReset();
  });

  it("publica múltiplos eventos com payload avro", async () => {
    resolveTopicMock.mockReturnValue("wallet.transactions");
    encodeMock
      .mockResolvedValueOnce(Buffer.from("encoded-1"))
      .mockResolvedValueOnce(Buffer.from("encoded-2"));
    signMock.mockReturnValue("token");
    sendMock.mockResolvedValue(undefined);

    const metrics = {
      recordKafkaProduced: jest.fn(),
      recordKafkaError: jest.fn()
    };

    const publisher = new KafkaEventPublisher(
      {
        clientId: "wallet-service",
        brokers: ["localhost:9092"],
        internalJwt: "internal",
        schemaRegistryUrl: "http://localhost:8081"
      },
      metrics as any
    );

    await publisher.publishMany([
      {
        name: "wallet.transaction.created",
        payload: { eventId: "evt-1" }
      },
      {
        name: "wallet.transaction.created",
        payload: { eventId: "evt-2" }
      }
    ]);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "wallet.transactions",
        messages: [
          expect.objectContaining({ value: Buffer.from("encoded-1") }),
          expect.objectContaining({ value: Buffer.from("encoded-2") })
        ]
      })
    );
    expect(metrics.recordKafkaProduced).toHaveBeenCalledWith("wallet.transactions");
  });

  it("retorna erro com causa original quando publish falha", async () => {
    resolveTopicMock.mockReturnValue("wallet.transactions");
    encodeMock.mockResolvedValue(Buffer.from("encoded-1"));
    signMock.mockReturnValue("token");
    sendMock.mockRejectedValue(new Error("send failed"));

    const metrics = {
      recordKafkaProduced: jest.fn(),
      recordKafkaError: jest.fn()
    };

    const publisher = new KafkaEventPublisher(
      {
        clientId: "wallet-service",
        brokers: ["localhost:9092"],
        internalJwt: "internal",
        schemaRegistryUrl: "http://localhost:8081"
      },
      metrics as any
    );

    await expect(
      publisher.publishMany([
        {
          name: "wallet.transaction.created",
          payload: { eventId: "evt-1" }
        }
      ])
    ).rejects.toThrow("Kafka publish failed: send failed");
    expect(metrics.recordKafkaError).toHaveBeenCalledWith("wallet.transactions");
  });
});
