import { Kafka, Consumer, Producer } from "kafkajs";
import jwt from "jsonwebtoken";
import { EnsureWalletUseCase } from "../../application/use-cases/EnsureWalletUseCase";
import { Metrics } from "../../../shared/observability/metrics";
import { Logger } from "../../../shared/observability/logger";
import { createTraceId, runWithTrace } from "../../../shared/observability/trace";

export type WalletKafkaConsumerConfig = {
  brokers: string[];
  clientId: string;
  groupId: string;
  internalJwtKey: string;
};

export class WalletKafkaConsumer {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly maxRetries = 3;

  constructor(
    private readonly config: WalletKafkaConsumerConfig,
    private readonly ensureWalletUseCase: EnsureWalletUseCase,
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
      topic: "users.created.dlq",
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
    this.metrics.recordKafkaDlq("users.created.dlq");
    this.metrics.recordKafkaError("users.created");
    this.logger.error("Kafka message sent to DLQ", { topic: "users.created" });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.producer.connect();
    await this.consumer.subscribe({ topic: "users.created", fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const value = message.value ? message.value.toString() : "";
        const baseHeaders = message.headers ?? {};
        const topic = "users.created";
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
              const userId = payload?.payload?.userId;
              if (typeof userId === "string" && userId.length > 0) {
                await this.ensureWalletUseCase.execute(userId);
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
