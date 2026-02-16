export type SupportedEventName = "users.created" | "wallet.transaction.created";

type EventSchemaDefinition = {
  topic: string;
  subject: string;
  schema: {
    type: "record";
    name: string;
    namespace: string;
    fields: unknown[];
  };
};

export const eventSchemaDefinitions: Record<SupportedEventName, EventSchemaDefinition> = {
  "users.created": {
    topic: "users.created",
    subject: "users.created-value",
    schema: {
      type: "record",
      name: "UsersCreatedEvent",
      namespace: "ilia.events",
      fields: [
        {
          name: "name",
          type: "string"
        },
        {
          name: "payload",
          type: {
            type: "record",
            name: "UsersCreatedPayload",
            fields: [
              { name: "eventId", type: "string" },
              { name: "occurredAt", type: "string" },
              { name: "userId", type: "string" },
              { name: "name", type: "string" },
              { name: "firstName", type: "string" },
              { name: "lastName", type: "string" },
              { name: "email", type: "string" }
            ]
          }
        }
      ]
    }
  },
  "wallet.transaction.created": {
    topic: "wallet.transactions",
    subject: "wallet.transactions-value",
    schema: {
      type: "record",
      name: "WalletTransactionCreatedEvent",
      namespace: "ilia.events",
      fields: [
        {
          name: "name",
          type: "string"
        },
        {
          name: "payload",
          type: {
            type: "record",
            name: "WalletTransactionCreatedPayload",
            fields: [
              { name: "eventId", type: "string" },
              { name: "occurredAt", type: "string" },
              { name: "walletId", type: "string" },
              { name: "transactionId", type: "string" },
              {
                name: "type",
                type: {
                  type: "enum",
                  name: "WalletTransactionType",
                  symbols: ["credit", "debit"]
                }
              },
              { name: "amount", type: "string" },
              { name: "balance", type: "string" }
            ]
          }
        }
      ]
    }
  }
};

export const supportedEventNames = Object.keys(eventSchemaDefinitions) as SupportedEventName[];

export const supportedTopicNames = Array.from(
  new Set(Object.values(eventSchemaDefinitions).map((item) => item.topic))
);

export const topicToEventNames = Object.entries(eventSchemaDefinitions).reduce(
  (acc, [eventName, definition]) => {
    const list = acc[definition.topic] ?? [];
    list.push(eventName as SupportedEventName);
    acc[definition.topic] = list;
    return acc;
  },
  {} as Record<string, SupportedEventName[]>
);
