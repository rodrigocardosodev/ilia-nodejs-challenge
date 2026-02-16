import { Kafka, Consumer, Producer } from "kafkajs";
import jwt from "jsonwebtoken";
import { RecordWalletEventUseCase } from "../../application/use-cases/RecordWalletEventUseCase";
import { Metrics } from "../../../shared/observability/metrics";
import { Logger } from "../../../shared/observability/logger";
import { createTraceId, runWithTrace } from "../../../shared/observability/trace";
import {
  SchemaRegistryEventCodec,
  SchemaValidationError
} from "../../../shared/messaging/SchemaRegistryEventCodec";

export type UsersKafkaConsumerConfig = {
  brokers: string[];
  clientId: string;
  groupId: string;
  internalJwtKey: string;
  schemaRegistryUrl: string;
};

export class UsersKafkaConsumer {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly schemaCodec: SchemaRegistryEventCodec;
  private readonly maxRetries = 3;

  constructor(
    private readonly config: UsersKafkaConsumerConfig,
    private readonly recordWalletEventUseCase: RecordWalletEventUseCase,
    private readonly metrics: Metrics,
    private readonly logger: Logger
  ) {
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers
    });
    this.consumer = kafka.consumer({ groupId: config.groupId });
    this.producer = kafka.producer();
    this.schemaCodec = new SchemaRegistryEventCodec({ host: config.schemaRegistryUrl });
  }

  private async sendToDlq(
    value: Buffer,
    baseHeaders: Record<string, any>,
    attempt: number,
    errorMessage: string
  ): Promise<void> {
    const dlqToken = jwt.sign({ iss: this.config.clientId }, this.config.internalJwtKey, {
      expiresIn: "5m"
    });
    await this.producer.send({
      topic: "wallet.transactions.dlq",
      messages: [
        {
          value,
          headers: {
            ...baseHeaders,
            "x-internal-jwt": dlqToken,
            "x-retry-count": String(attempt),
            "x-error-message": errorMessage
          }
        }
      ]
    });
    this.metrics.recordKafkaDlq("wallet.transactions.dlq");
    this.metrics.recordKafkaError("wallet.transactions");
    this.logger.error("Kafka message sent to DLQ", { topic: "wallet.transactions" });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.producer.connect();
    await this.consumer.subscribe({
      topic: "wallet.transactions",
      fromBeginning: false
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const value = message.value ?? Buffer.from("");
        const baseHeaders = message.headers ?? {};
        const topic = "wallet.transactions";
        this.metrics.recordKafkaConsumed(topic);

        const header = baseHeaders["x-internal-jwt"];
        const token = header ? header.toString() : "";
        try {
          jwt.verify(token, this.config.internalJwtKey, { algorithms: ["HS256"] });
        } catch {
          await this.sendToDlq(value, baseHeaders, 1, "auth_failed");
          return;
        }

        const traceHeader = baseHeaders["x-trace-id"];
        const traceId = traceHeader ? traceHeader.toString() : createTraceId();
        const expectedEventNames = this.schemaCodec.getExpectedEventNamesByTopic(topic);

        let decodedPayload: {
          userId: string;
          transactionId: string;
          occurredAt: string;
        } | null = null;

        try {
          const decodedEvent = await this.schemaCodec.decode(value, expectedEventNames);
          const payload = decodedEvent.payload;
          const rawUserId = payload["walletId"];
          const rawTransactionId = payload["transactionId"];
          const rawOccurredAt = payload["occurredAt"];
          if (
            typeof rawUserId !== "string" ||
            typeof rawTransactionId !== "string" ||
            typeof rawOccurredAt !== "string"
          ) {
            await this.sendToDlq(value, baseHeaders, 1, "schema_validation_failed");
            return;
          }
          decodedPayload = {
            userId: rawUserId,
            transactionId: rawTransactionId,
            occurredAt: rawOccurredAt
          };
        } catch (error) {
          if (error instanceof SchemaValidationError) {
            await this.sendToDlq(value, baseHeaders, 1, "schema_validation_failed");
            return;
          }
          await this.sendToDlq(value, baseHeaders, 1, "decode_failed");
          return;
        }

        for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
          try {
            await runWithTrace(traceId, async () => {
              const userId = decodedPayload?.userId;
              const transactionId = decodedPayload?.transactionId;
              const occurredAt = decodedPayload?.occurredAt;
              if (
                typeof userId === "string" &&
                typeof transactionId === "string" &&
                typeof occurredAt === "string"
              ) {
                await this.recordWalletEventUseCase.execute(userId, transactionId, occurredAt);
              }
            });
            this.logger.info("Kafka message processed", { topic });
            return;
          } catch (error: any) {
            if (attempt < this.maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, attempt * 500));
              continue;
            }
            await this.sendToDlq(
              value,
              baseHeaders,
              attempt,
              String(error?.message ?? "processing_failed")
            );
            return;
          }
        }
      }
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }
}
