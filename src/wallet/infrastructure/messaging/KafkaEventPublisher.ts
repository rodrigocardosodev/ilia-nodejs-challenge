import { Kafka, Producer } from "kafkajs";
import jwt from "jsonwebtoken";
import { EventPublisher, DomainEvent } from "../../application/ports/EventPublisher";
import { Metrics } from "../../../shared/observability/metrics";
import { createTraceId, getTraceId } from "../../../shared/observability/trace";
import { SchemaRegistryEventCodec } from "../../../shared/messaging/SchemaRegistryEventCodec";

export type KafkaPublisherConfig = {
  brokers: string[];
  clientId: string;
  internalJwt: string;
  schemaRegistryUrl: string;
};

export class KafkaEventPublisher implements EventPublisher {
  private readonly producer: Producer;
  private readonly schemaCodec: SchemaRegistryEventCodec;

  constructor(
    private readonly config: KafkaPublisherConfig,
    private readonly metrics: Metrics
  ) {
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers
    });
    this.producer = kafka.producer();
    this.schemaCodec = new SchemaRegistryEventCodec({ host: config.schemaRegistryUrl });
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
      const topic = this.schemaCodec.resolveTopic(event.name);
      const list = eventsByTopic.get(topic) ?? [];
      list.push(event);
      eventsByTopic.set(topic, list);
    }
    for (const [topic, topicEvents] of eventsByTopic.entries()) {
      try {
        const encodedEvents = await Promise.all(
          topicEvents.map(async (event) => this.schemaCodec.encode(event))
        );
        await this.producer.send({
          topic,
          messages: encodedEvents.map((value) => ({
            value,
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
}
