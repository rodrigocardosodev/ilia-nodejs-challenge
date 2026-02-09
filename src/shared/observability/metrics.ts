import client, { Counter, Gauge, Histogram, Registry } from "prom-client";

export type Metrics = {
  registry: Registry;
  httpMiddleware: (req: any, res: any, next: any) => void;
  metricsHandler: (_req: any, res: any) => Promise<void>;
  recordAuthFailure: (reason: string) => void;
  recordDbQuery: (db: string, operation: string, durationSeconds: number) => void;
  recordCacheHit: (cache: string) => void;
  recordCacheMiss: (cache: string) => void;
  recordIdempotencyHit: () => void;
  recordIdempotencyMiss: () => void;
  recordKafkaProduced: (topic: string) => void;
  recordKafkaConsumed: (topic: string) => void;
  recordKafkaDlq: (topic: string) => void;
  recordKafkaError: (topic: string) => void;
  updatePgPool: (pool: { totalCount: number; idleCount: number; waitingCount: number }) => void;
  updateMongoState: (state: number, poolSize?: number) => void;
};

export const createMetrics = (service: string): Metrics => {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  client.collectDefaultMetrics({ register: registry });

  const httpDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["service", "method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry]
  });

  const httpRequests = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["service", "method", "route", "status_code"],
    registers: [registry]
  });

  const authFailures = new Counter({
    name: "auth_failures_total",
    help: "Total auth failures",
    labelNames: ["service", "reason"],
    registers: [registry]
  });

  const dbQueryDuration = new Histogram({
    name: "db_query_duration_seconds",
    help: "Database query duration in seconds",
    labelNames: ["service", "db", "operation"],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry]
  });

  const dbQueries = new Counter({
    name: "db_queries_total",
    help: "Total database queries",
    labelNames: ["service", "db", "operation"],
    registers: [registry]
  });

  const cacheHits = new Counter({
    name: "cache_hits_total",
    help: "Total cache hits",
    labelNames: ["service", "cache"],
    registers: [registry]
  });

  const cacheMisses = new Counter({
    name: "cache_misses_total",
    help: "Total cache misses",
    labelNames: ["service", "cache"],
    registers: [registry]
  });

  const idempotencyHits = new Counter({
    name: "idempotency_hits_total",
    help: "Total idempotency hits",
    labelNames: ["service"],
    registers: [registry]
  });

  const idempotencyMisses = new Counter({
    name: "idempotency_misses_total",
    help: "Total idempotency misses",
    labelNames: ["service"],
    registers: [registry]
  });

  const kafkaProduced = new Counter({
    name: "kafka_messages_produced_total",
    help: "Total Kafka messages produced",
    labelNames: ["service", "topic"],
    registers: [registry]
  });

  const kafkaConsumed = new Counter({
    name: "kafka_messages_consumed_total",
    help: "Total Kafka messages consumed",
    labelNames: ["service", "topic"],
    registers: [registry]
  });

  const kafkaDlq = new Counter({
    name: "kafka_messages_dlq_total",
    help: "Total Kafka messages sent to DLQ",
    labelNames: ["service", "topic"],
    registers: [registry]
  });

  const kafkaErrors = new Counter({
    name: "kafka_processing_errors_total",
    help: "Total Kafka processing errors",
    labelNames: ["service", "topic"],
    registers: [registry]
  });

  const pgPoolTotal = new Gauge({
    name: "pg_pool_total",
    help: "Postgres pool total clients",
    labelNames: ["service"],
    registers: [registry]
  });

  const pgPoolIdle = new Gauge({
    name: "pg_pool_idle",
    help: "Postgres pool idle clients",
    labelNames: ["service"],
    registers: [registry]
  });

  const pgPoolWaiting = new Gauge({
    name: "pg_pool_waiting",
    help: "Postgres pool waiting requests",
    labelNames: ["service"],
    registers: [registry]
  });

  const mongoState = new Gauge({
    name: "mongo_connection_state",
    help: "Mongo connection state",
    labelNames: ["service"],
    registers: [registry]
  });

  const mongoPool = new Gauge({
    name: "mongo_pool_size",
    help: "Mongo pool size",
    labelNames: ["service"],
    registers: [registry]
  });

  const httpMiddleware = (req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const route = req.route
        ? `${req.baseUrl ?? ""}${req.route.path ?? ""}`
        : (req.path ?? "unknown");
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      const labels = {
        service,
        method: req.method ?? "UNKNOWN",
        route,
        status_code: String(res.statusCode ?? 0)
      };
      httpDuration.observe(labels, durationSeconds);
      httpRequests.inc(labels);
    });
    next();
  };

  const metricsHandler = async (_req: any, res: any) => {
    res.setHeader("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  };

  return {
    registry,
    httpMiddleware,
    metricsHandler,
    recordAuthFailure: (reason) => authFailures.inc({ service, reason }),
    recordDbQuery: (db, operation, durationSeconds) => {
      dbQueryDuration.observe({ service, db, operation }, durationSeconds);
      dbQueries.inc({ service, db, operation });
    },
    recordCacheHit: (cache) => cacheHits.inc({ service, cache }),
    recordCacheMiss: (cache) => cacheMisses.inc({ service, cache }),
    recordIdempotencyHit: () => idempotencyHits.inc({ service }),
    recordIdempotencyMiss: () => idempotencyMisses.inc({ service }),
    recordKafkaProduced: (topic) => kafkaProduced.inc({ service, topic }),
    recordKafkaConsumed: (topic) => kafkaConsumed.inc({ service, topic }),
    recordKafkaDlq: (topic) => kafkaDlq.inc({ service, topic }),
    recordKafkaError: (topic) => kafkaErrors.inc({ service, topic }),
    updatePgPool: (pool) => {
      pgPoolTotal.set({ service }, pool.totalCount ?? 0);
      pgPoolIdle.set({ service }, pool.idleCount ?? 0);
      pgPoolWaiting.set({ service }, pool.waitingCount ?? 0);
    },
    updateMongoState: (state, poolSize) => {
      mongoState.set({ service }, state);
      if (typeof poolSize === "number") {
        mongoPool.set({ service }, poolSize);
      }
    }
  };
};
