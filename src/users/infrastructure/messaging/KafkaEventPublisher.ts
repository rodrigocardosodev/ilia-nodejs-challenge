import { Kafka, Producer } from "kafkajs";
import jwt from "jsonwebtoken";
import { EventPublisher, DomainEvent } from "../../application/ports/EventPublisher";
import { Metrics } from "../../../shared/observability/metrics";
import { createTraceId, getTraceId } from "../../../shared/observability/trace";

export type KafkaPublisherConfig = {
  brokers: string[];
  clientId: string;
  internalJwt: string;
};

export class KafkaEventPublisher implements EventPublisher {
  private readonly producer: Producer;

  constructor(
    private readonly config: KafkaPublisherConfig,
    private readonly metrics: Metrics
  ) {
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers
    });
    this.producer = kafka.producer();
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async publish(event: DomainEvent): Promise<void> {
    const topic = this.resolveTopic(event.name);
    const token = jwt.sign({ iss: this.config.clientId }, this.config.internalJwt, { expiresIn: "5m" });
    const traceId = getTraceId() ?? createTraceId();
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            value: JSON.stringify(event),
            headers: {
              "x-internal-jwt": token,
              "x-trace-id": traceId
            }
          }
        ]
      });
      this.metrics.recordKafkaProduced(topic);
    } catch {
      this.metrics.recordKafkaError(topic);
      throw new Error("Kafka publish failed");
    }
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  private resolveTopic(name: string): string {
    if (name === "users.created") {
      return "users.created";
    }
    return "users.events";
  }
}
