import { SchemaRegistry } from "@kafkajs/confluent-schema-registry";
import {
  eventSchemaDefinitions,
  supportedEventNames,
  SupportedEventName,
  topicToEventNames
} from "./eventSchemas";

export type DomainEvent = {
  name: string;
  payload: Record<string, unknown>;
};

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export type SchemaRegistryEventCodecConfig = {
  host: string;
};

export class SchemaRegistryEventCodec {
  private readonly schemaRegistry: SchemaRegistry;
  private readonly schemaIdsByEventName = new Map<SupportedEventName, number>();

  constructor(config: SchemaRegistryEventCodecConfig) {
    this.schemaRegistry = new SchemaRegistry({ host: config.host });
  }

  resolveTopic(eventName: string): string {
    const definition = this.getDefinitionForEventName(eventName);
    return definition.topic;
  }

  getExpectedEventNamesByTopic(topic: string): SupportedEventName[] {
    return topicToEventNames[topic] ?? [];
  }

  async encode(event: DomainEvent): Promise<Buffer> {
    const eventName = this.assertSupportedEventName(event.name);
    const schemaId = await this.getOrRegisterSchemaId(eventName);
    try {
      return await this.schemaRegistry.encode(schemaId, event);
    } catch {
      throw new SchemaValidationError(`Failed to encode Kafka event ${event.name}`);
    }
  }

  async decode(buffer: Buffer, expectedEventNames: SupportedEventName[]): Promise<DomainEvent> {
    try {
      const decoded = await this.schemaRegistry.decode(buffer);
      if (
        !decoded ||
        typeof decoded !== "object" ||
        typeof (decoded as DomainEvent).name !== "string" ||
        typeof (decoded as DomainEvent).payload !== "object" ||
        (decoded as DomainEvent).payload === null
      ) {
        throw new SchemaValidationError("Decoded Kafka event has invalid shape");
      }
      const event = decoded as DomainEvent;
      if (!expectedEventNames.includes(event.name as SupportedEventName)) {
        throw new SchemaValidationError(`Unexpected Kafka event ${event.name}`);
      }
      return event;
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw error;
      }
      throw new SchemaValidationError("Failed to decode Kafka event");
    }
  }

  private async getOrRegisterSchemaId(eventName: SupportedEventName): Promise<number> {
    const existing = this.schemaIdsByEventName.get(eventName);
    if (existing) {
      return existing;
    }

    const definition = eventSchemaDefinitions[eventName];
    const registered = await this.schemaRegistry.register(definition.schema, {
      subject: definition.subject
    });
    this.schemaIdsByEventName.set(eventName, registered.id);
    return registered.id;
  }

  private getDefinitionForEventName(eventName: string) {
    const supportedEventName = this.assertSupportedEventName(eventName);
    return eventSchemaDefinitions[supportedEventName];
  }

  private assertSupportedEventName(eventName: string): SupportedEventName {
    if (!supportedEventNames.includes(eventName as SupportedEventName)) {
      throw new SchemaValidationError(`Unsupported Kafka event ${eventName}`);
    }
    return eventName as SupportedEventName;
  }
}
