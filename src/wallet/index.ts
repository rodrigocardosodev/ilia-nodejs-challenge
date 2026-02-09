import express from "express";
import dotenv from "dotenv";
import Redis from "ioredis";
import { createPool } from "./infrastructure/db/postgres";
import { WalletPostgresRepository } from "./infrastructure/db/WalletPostgresRepository";
import { CachedWalletRepository } from "./infrastructure/cache/CachedWalletRepository";
import { KafkaEventPublisher } from "./infrastructure/messaging/KafkaEventPublisher";
import { WalletKafkaConsumer } from "./infrastructure/messaging/WalletKafkaConsumer";
import { CreateTransactionUseCase } from "./application/use-cases/CreateTransactionUseCase";
import { GetBalanceUseCase } from "./application/use-cases/GetBalanceUseCase";
import { EnsureWalletUseCase } from "./application/use-cases/EnsureWalletUseCase";
import { ListTransactionsUseCase } from "./application/use-cases/ListTransactionsUseCase";
import { WalletController } from "./interfaces/http/WalletController";
import { buildWalletRoutes } from "./interfaces/http/routes";
import { createErrorMiddleware } from "../shared/http/errorMiddleware";
import { buildHealthRoutes } from "../shared/http/healthRoutes";
import { traceMiddleware } from "../shared/http/traceMiddleware";
import { createLogger } from "../shared/observability/logger";
import { createMetrics } from "../shared/observability/metrics";
import { requestLoggerMiddleware } from "../shared/http/requestLoggerMiddleware";

dotenv.config();

const port = Number(process.env.PORT ?? 3001);
const jwtKey = process.env.JWT_PRIVATE_KEY ?? "ILIACHALLENGE";
const internalJwtKey =
  process.env.INTERNAL_JWT_PRIVATE_KEY ?? "ILIACHALLENGE_INTERNAL";

const pool = createPool({
  host: process.env.PG_HOST ?? "localhost",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "wallet",
  password: process.env.PG_PASSWORD ?? "wallet",
  database: process.env.PG_DATABASE ?? "wallet"
});

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const logger = createLogger("wallet");
const metrics = createMetrics("wallet");

const kafkaBrokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const kafkaPublisher = new KafkaEventPublisher(
  {
    clientId: "wallet-service",
    brokers: kafkaBrokers,
    internalJwt: internalJwtKey
  },
  metrics
);

const walletRepository = new CachedWalletRepository(
  redis,
  new WalletPostgresRepository(pool, metrics),
  metrics
);

const createTransactionUseCase = new CreateTransactionUseCase(
  walletRepository,
  kafkaPublisher,
  logger
);
const getBalanceUseCase = new GetBalanceUseCase(walletRepository, logger);
const listTransactionsUseCase = new ListTransactionsUseCase(walletRepository, logger);
const ensureWalletUseCase = new EnsureWalletUseCase(walletRepository, logger);

const walletConsumer = new WalletKafkaConsumer(
  {
    clientId: "wallet-consumer",
    brokers: kafkaBrokers,
    groupId: "wallet-users",
    internalJwtKey
  },
  ensureWalletUseCase,
  metrics,
  logger
);

const app = express();
app.use(express.json());
app.use(traceMiddleware);
app.use(metrics.httpMiddleware);
app.use(requestLoggerMiddleware(logger));
app.get("/metrics", metrics.metricsHandler);
app.use(
  "/",
  buildHealthRoutes(
    async () => {},
    async () => {
      await pool.query("SELECT 1");
      await redis.ping();
    }
  )
);
app.use(
  "/",
  buildWalletRoutes(
    new WalletController(
      createTransactionUseCase,
      getBalanceUseCase,
      listTransactionsUseCase
    ),
    {
      jwtKey,
      metrics
    }
  )
);
app.use(createErrorMiddleware(logger));

import http from "http";

const start = async (): Promise<void> => {
  await kafkaPublisher.connect();
  await walletConsumer.start();
  const metricsInterval = setInterval(() => {
    metrics.updatePgPool(pool);
  }, 10000);

  const server = http.createServer(app);
  server.listen(port, () => {
    logger.info("Wallet service running", { port });
  });

  const shutdown = async () => {
    logger.info("Shutting down wallet service");
    clearInterval(metricsInterval);
    server.close();
    await walletConsumer.stop();
    await kafkaPublisher.disconnect();
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

start().catch((error) => {
  logger.error("Failed to start wallet service", { error: String(error) });
  process.exit(1);
});
