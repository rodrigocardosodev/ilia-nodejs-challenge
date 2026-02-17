import { Kafka, Consumer, Producer, IHeaders } from "kafkajs";
import { Buffer } from "node:buffer";
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
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

export class UsersKafkaConsumer {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly schemaCodec: SchemaRegistryEventCodec;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly messageTopic = "wallet.transactions";
  private readonly dlqTopic = "wallet.transactions.dlq";

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
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 500;
  }

  private async sendToDlq(
    value: Buffer,
    baseHeaders: IHeaders,
    attempt: number,
    errorMessage: string
  ): Promise<void> {
    const dlqToken = jwt.sign({ iss: this.config.clientId }, this.config.internalJwtKey, {
      expiresIn: "5m"
    });
    await this.producer.send({
      topic: this.dlqTopic,
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
    this.metrics.recordKafkaDlq(this.dlqTopic);
    this.metrics.recordKafkaError(this.messageTopic);
    this.logger.error("Kafka message sent to DLQ", { topic: this.messageTopic });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.producer.connect();
    await this.consumer.subscribe({
      topic: this.messageTopic,
      fromBeginning: false
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const value = message.value ?? Buffer.from("");
        const baseHeaders = message.headers ?? {};
        const topic = this.messageTopic;
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
          const rawUserId = payload["userId"];
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
            if (!decodedPayload) {
              await this.sendToDlq(value, baseHeaders, attempt, "schema_validation_failed");
              return;
            }
            const { userId, transactionId, occurredAt } = decodedPayload;
            await runWithTrace(traceId, async () => {
              await this.recordWalletEventUseCase.execute(userId, transactionId, occurredAt);
            });
            this.logger.info("Kafka message processed", { topic });
            return;
          } catch (error: unknown) {
            if (attempt < this.maxRetries) {
              const delay = this.retryBaseDelayMs * 2 ** (attempt - 1);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
            await this.sendToDlq(value, baseHeaders, attempt, this.getErrorMessage(error));
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

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }
    return "processing_failed";
  }
}
