const registerMock = jest.fn();
const encodeMock = jest.fn();
const decodeMock = jest.fn();

jest.mock("@kafkajs/confluent-schema-registry", () => ({
  SchemaRegistry: jest.fn().mockImplementation(() => ({
    register: registerMock,
    encode: encodeMock,
    decode: decodeMock
  }))
}));

import {
  SchemaRegistryEventCodec,
  SchemaValidationError
} from "../../../src/shared/messaging/SchemaRegistryEventCodec";

describe("SchemaRegistryEventCodec", () => {
  beforeEach(() => {
    registerMock.mockReset();
    encodeMock.mockReset();
    decodeMock.mockReset();
  });

  it("codifica evento suportado", async () => {
    registerMock.mockResolvedValue({ id: 12 });
    const encoded = Buffer.from("avro");
    encodeMock.mockResolvedValue(encoded);

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });
    const result = await codec.encode({
      name: "users.created",
      payload: {
        eventId: "evt-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        userId: "u1",
        name: "Ana Silva",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com"
      }
    });

    expect(result).toBe(encoded);
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(encodeMock).toHaveBeenCalledWith(12, expect.objectContaining({ name: "users.created" }));
  });

  it("reutiliza schema id em codificações subsequentes", async () => {
    registerMock.mockResolvedValue({ id: 55 });
    encodeMock.mockResolvedValue(Buffer.from("encoded"));

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });
    await codec.encode({
      name: "users.created",
      payload: {
        eventId: "evt-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        userId: "u1",
        name: "Ana Silva",
        firstName: "Ana",
        lastName: "Silva",
        email: "ana@example.com"
      }
    });
    await codec.encode({
      name: "users.created",
      payload: {
        eventId: "evt-2",
        occurredAt: "2026-01-01T00:00:00.000Z",
        userId: "u2",
        name: "Bia Souza",
        firstName: "Bia",
        lastName: "Souza",
        email: "bia@example.com"
      }
    });

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(encodeMock).toHaveBeenCalledTimes(2);
    expect(encodeMock).toHaveBeenNthCalledWith(2, 55, expect.objectContaining({ name: "users.created" }));
  });

  it("falha ao codificar evento não suportado", async () => {
    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });

    await expect(
      codec.encode({
        name: "users.deleted",
        payload: {}
      })
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("falha ao codificar quando avro encode falha", async () => {
    registerMock.mockResolvedValue({ id: 12 });
    encodeMock.mockRejectedValue(new Error("encode failed"));

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });

    await expect(
      codec.encode({
        name: "users.created",
        payload: {
          eventId: "evt-1",
          occurredAt: "2026-01-01T00:00:00.000Z",
          userId: "u1",
          name: "Ana Silva",
          firstName: "Ana",
          lastName: "Silva",
          email: "ana@example.com"
        }
      })
    ).rejects.toEqual(new SchemaValidationError("Failed to encode Kafka event users.created"));
  });

  it("decodifica evento esperado", async () => {
    decodeMock.mockResolvedValue({
      name: "wallet.transaction.created",
      payload: {
        eventId: "evt-2",
        occurredAt: "2026-01-01T00:00:00.000Z",
        walletId: "w1",
        transactionId: "tx-1",
        type: "credit",
        amount: "100.0000",
        balance: "300.0000"
      }
    });

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });
    const result = await codec.decode(Buffer.from("avro"), ["wallet.transaction.created"]);

    expect(result.name).toBe("wallet.transaction.created");
  });

  it("falha ao decodificar evento inesperado", async () => {
    decodeMock.mockResolvedValue({
      name: "users.created",
      payload: {}
    });

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });

    await expect(codec.decode(Buffer.from("avro"), ["wallet.transaction.created"])).rejects.toBeInstanceOf(
      SchemaValidationError
    );
  });

  it("falha ao decodificar shape inválido", async () => {
    decodeMock.mockResolvedValue(null);

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });

    await expect(codec.decode(Buffer.from("avro"), ["users.created"])).rejects.toEqual(
      new SchemaValidationError("Decoded Kafka event has invalid shape")
    );
  });

  it("falha ao decodificar erro interno do registry", async () => {
    decodeMock.mockRejectedValue(new Error("registry down"));

    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });

    await expect(codec.decode(Buffer.from("avro"), ["users.created"])).rejects.toEqual(
      new SchemaValidationError("Failed to decode Kafka event")
    );
  });

  it("resolve tópico e eventos esperados por tópico", () => {
    const codec = new SchemaRegistryEventCodec({ host: "http://schema-registry:8081" });

    expect(codec.resolveTopic("users.created")).toBe("users.created");
    expect(codec.getExpectedEventNamesByTopic("wallet.transactions")).toEqual([
      "wallet.transaction.created"
    ]);
    expect(codec.getExpectedEventNamesByTopic("unknown.topic")).toEqual([]);
  });
});
