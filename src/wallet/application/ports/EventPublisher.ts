export type DomainEvent = {
  name: string;
  payload: Record<string, unknown>;
};

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishMany(events: DomainEvent[]): Promise<void>;
}
