const sendMock = jest.fn();
const connectMock = jest.fn();
const disconnectMock = jest.fn();
const resolveTopicMock = jest.fn();
const encodeMock = jest.fn();
const signMock = jest.fn();

jest.mock("kafkajs", () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: () => ({
      send: sendMock,
      connect: connectMock,
      disconnect: disconnectMock
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

import { KafkaEventPublisher } from "../../../src/users/infrastructure/messaging/KafkaEventPublisher";

describe("Users KafkaEventPublisher", () => {
  beforeEach(() => {
    sendMock.mockReset();
    connectMock.mockReset();
    disconnectMock.mockReset();
    resolveTopicMock.mockReset();
    encodeMock.mockReset();
    signMock.mockReset();
  });

  it("publica evento codificado em avro", async () => {
    resolveTopicMock.mockReturnValue("users.created");
    encodeMock.mockResolvedValue(Buffer.from("encoded"));
    signMock.mockReturnValue("token");
    sendMock.mockResolvedValue(undefined);

    const metrics = {
      recordKafkaProduced: jest.fn(),
      recordKafkaError: jest.fn()
    };

    const publisher = new KafkaEventPublisher(
      {
        clientId: "users-service",
        brokers: ["localhost:9092"],
        internalJwt: "internal",
        schemaRegistryUrl: "http://localhost:8081"
      },
      metrics as any
    );

    await publisher.publish({
      name: "users.created",
      payload: {
        eventId: "evt-1"
      }
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "users.created",
        messages: [
          expect.objectContaining({
            value: Buffer.from("encoded")
          })
        ]
      })
    );
    expect(metrics.recordKafkaProduced).toHaveBeenCalledWith("users.created");
  });

  it("registra erro quando falha no envio", async () => {
    resolveTopicMock.mockReturnValue("users.created");
    encodeMock.mockResolvedValue(Buffer.from("encoded"));
    signMock.mockReturnValue("token");
    sendMock.mockRejectedValue(new Error("send failed"));

    const metrics = {
      recordKafkaProduced: jest.fn(),
      recordKafkaError: jest.fn()
    };

    const publisher = new KafkaEventPublisher(
      {
        clientId: "users-service",
        brokers: ["localhost:9092"],
        internalJwt: "internal",
        schemaRegistryUrl: "http://localhost:8081"
      },
      metrics as any
    );

    await expect(
      publisher.publish({
        name: "users.created",
        payload: {
          eventId: "evt-1"
        }
      })
    ).rejects.toEqual(new Error("Kafka publish failed"));

    expect(metrics.recordKafkaError).toHaveBeenCalledWith("users.created");
  });
});
