import { Kafka, Consumer, Producer } from "kafkajs";
import jwt from "jsonwebtoken";
import { RecordWalletEventUseCase } from "../../application/use-cases/RecordWalletEventUseCase";
import { Metrics } from "../../../shared/observability/metrics";
import { Logger } from "../../../shared/observability/logger";
import { createTraceId, runWithTrace } from "../../../shared/observability/trace";

export type UsersKafkaConsumerConfig = {
  brokers: string[];
  clientId: string;
  groupId: string;
  internalJwtKey: string;
};

export class UsersKafkaConsumer {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
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
  }

  private async sendToDlq(
    value: string,
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
        const value = message.value ? message.value.toString() : "";
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

        for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
          try {
            await runWithTrace(traceId, async () => {
              const payload = value ? JSON.parse(value) : null;
              const userId = payload?.payload?.walletId;
              const transactionId = payload?.payload?.transactionId;
              const occurredAt = payload?.payload?.occurredAt;
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
