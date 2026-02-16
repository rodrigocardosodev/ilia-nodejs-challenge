const consumerConnectMock = jest.fn();
const consumerSubscribeMock = jest.fn();
const consumerRunMock = jest.fn();
const consumerDisconnectMock = jest.fn();
const producerConnectMock = jest.fn();
const producerDisconnectMock = jest.fn();
const producerSendMock = jest.fn();
const verifyMock = jest.fn();
const signMock = jest.fn();
const decodeMock = jest.fn();
const getExpectedEventNamesByTopicMock = jest.fn();

jest.mock("kafkajs", () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    consumer: () => ({
      connect: consumerConnectMock,
      subscribe: consumerSubscribeMock,
      run: consumerRunMock,
      disconnect: consumerDisconnectMock
    }),
    producer: () => ({
      connect: producerConnectMock,
      send: producerSendMock,
      disconnect: producerDisconnectMock
    })
  }))
}));

jest.mock("jsonwebtoken", () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
  sign: (...args: unknown[]) => signMock(...args)
}));

jest.mock("../../../src/shared/messaging/SchemaRegistryEventCodec", () => {
  class MockSchemaValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SchemaValidationError";
    }
  }

  return {
    SchemaValidationError: MockSchemaValidationError,
    SchemaRegistryEventCodec: jest.fn().mockImplementation(() => ({
      getExpectedEventNamesByTopic: (...args: unknown[]) => getExpectedEventNamesByTopicMock(...args),
      decode: (...args: unknown[]) => decodeMock(...args)
    }))
  };
});

import { WalletKafkaConsumer } from "../../../src/wallet/infrastructure/messaging/WalletKafkaConsumer";
import { SchemaValidationError } from "../../../src/shared/messaging/SchemaRegistryEventCodec";

describe("WalletKafkaConsumer", () => {
  beforeEach(() => {
    consumerConnectMock.mockReset();
    consumerSubscribeMock.mockReset();
    consumerRunMock.mockReset();
    consumerDisconnectMock.mockReset();
    producerConnectMock.mockReset();
    producerDisconnectMock.mockReset();
    producerSendMock.mockReset();
    verifyMock.mockReset();
    signMock.mockReset();
    decodeMock.mockReset();
    getExpectedEventNamesByTopicMock.mockReset();
  });

  it("envia para DLQ quando schema é inválido", async () => {
    verifyMock.mockReturnValue(undefined);
    signMock.mockReturnValue("dlq-token");
    getExpectedEventNamesByTopicMock.mockReturnValue(["users.created"]);
    decodeMock.mockRejectedValue(new SchemaValidationError("invalid schema"));
    producerSendMock.mockResolvedValue(undefined);

    consumerRunMock.mockImplementation(async ({ eachMessage }) => {
      await eachMessage({
        message: {
          value: Buffer.from("invalid"),
          headers: {
            "x-internal-jwt": Buffer.from("internal-token"),
            "x-trace-id": Buffer.from("trace-1")
          }
        }
      });
    });

    const ensureWalletUseCase = { execute: jest.fn() };
    const metrics = {
      recordKafkaConsumed: jest.fn(),
      recordKafkaDlq: jest.fn(),
      recordKafkaError: jest.fn()
    };
    const logger = {
      info: jest.fn(),
      error: jest.fn()
    };

    const consumer = new WalletKafkaConsumer(
      {
        clientId: "wallet-consumer",
        brokers: ["localhost:9092"],
        groupId: "wallet-users",
        internalJwtKey: "internal",
        schemaRegistryUrl: "http://localhost:8081"
      },
      ensureWalletUseCase as any,
      metrics as any,
      logger as any
    );

    await consumer.start();

    expect(ensureWalletUseCase.execute).not.toHaveBeenCalled();
    expect(producerSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "users.created.dlq",
        messages: [
          expect.objectContaining({
            headers: expect.objectContaining({
              "x-error-message": "schema_validation_failed"
            })
          })
        ]
      })
    );
  });
});
