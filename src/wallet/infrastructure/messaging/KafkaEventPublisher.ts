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
    await this.publishMany([event]);
  }

  async publishMany(events: DomainEvent[]): Promise<void> {
    const token = jwt.sign({ iss: this.config.clientId }, this.config.internalJwt, {
      expiresIn: "5m"
    });
    const traceId = getTraceId() ?? createTraceId();
    const eventsByTopic = new Map<string, DomainEvent[]>();
    for (const event of events) {
      const topic = this.resolveTopic(event.name);
      const list = eventsByTopic.get(topic) ?? [];
      list.push(event);
      eventsByTopic.set(topic, list);
    }
    for (const [topic, topicEvents] of eventsByTopic.entries()) {
      try {
        await this.producer.send({
          topic,
          messages: topicEvents.map((event) => ({
            value: JSON.stringify(event),
            headers: {
              "x-internal-jwt": token,
              "x-trace-id": traceId
            }
          }))
        });
        this.metrics.recordKafkaProduced(topic);
      } catch {
        this.metrics.recordKafkaError(topic);
        throw new Error("Kafka publish failed");
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  private resolveTopic(name: string): string {
    if (name === "wallet.transaction.created") {
      return "wallet.transactions";
    }
    return "wallet.events";
  }
}
