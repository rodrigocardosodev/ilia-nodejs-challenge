import express from "express";
import dotenv from "dotenv";
import Redis from "ioredis";
import { connectMongo } from "./infrastructure/db/mongoose";
import { UserMongoRepository } from "./infrastructure/db/UserMongoRepository";
import { CachedUserRepository } from "./infrastructure/cache/CachedUserRepository";
import { KafkaEventPublisher } from "./infrastructure/messaging/KafkaEventPublisher";
import { UsersKafkaConsumer } from "./infrastructure/messaging/UsersKafkaConsumer";
import { RegisterUserUseCase } from "./application/use-cases/RegisterUserUseCase";
import { AuthenticateUserUseCase } from "./application/use-cases/AuthenticateUserUseCase"; // New
import { GetUserUseCase } from "./application/use-cases/GetUserUseCase";
import { ListUsersUseCase } from "./application/use-cases/ListUsersUseCase";
import { UpdateUserUseCase } from "./application/use-cases/UpdateUserUseCase";
import { DeleteUserUseCase } from "./application/use-cases/DeleteUserUseCase";
import { UsersController } from "./interfaces/http/UsersController";
import { BcryptPasswordHasher } from "./infrastructure/security/BcryptPasswordHasher"; // New
import { buildUsersRoutes } from "./interfaces/http/routes";
import { RedisWalletEventRepository } from "./infrastructure/cache/RedisWalletEventRepository";
import { RecordWalletEventUseCase } from "./application/use-cases/RecordWalletEventUseCase";
import { createErrorMiddleware } from "../shared/http/errorMiddleware";
import { buildHealthRoutes } from "../shared/http/healthRoutes";
import mongoose from "mongoose";
import { traceMiddleware } from "../shared/http/traceMiddleware";
import { createLogger } from "../shared/observability/logger";
import { createMetrics } from "../shared/observability/metrics";
import { requestLoggerMiddleware } from "../shared/http/requestLoggerMiddleware";

dotenv.config();

const port = Number(process.env.PORT ?? 3002);
const jwtKey = process.env.JWT_PRIVATE_KEY ?? "ILIACHALLENGE";
const internalJwtKey = process.env.INTERNAL_JWT_PRIVATE_KEY ?? "ILIACHALLENGE_INTERNAL";

const mongoUri = process.env.MONGO_URI ?? "mongodb://localhost:27017/users";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const logger = createLogger("users");
const metrics = createMetrics("users");

const kafkaBrokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const kafkaPublisher = new KafkaEventPublisher(
  {
    clientId: "users-service",
    brokers: kafkaBrokers,
    internalJwt: internalJwtKey
  },
  metrics
);

const userRepository = new CachedUserRepository(
  redis,
  new UserMongoRepository(metrics),
  metrics,
  logger
);

const passwordHasher = new BcryptPasswordHasher(); // New

const registerUserUseCase = new RegisterUserUseCase(
  userRepository,
  kafkaPublisher,
  passwordHasher,
  logger
);
const authenticateUserUseCase = new AuthenticateUserUseCase(userRepository, passwordHasher, logger); // New
const getUserUseCase = new GetUserUseCase(userRepository, logger);
const listUsersUseCase = new ListUsersUseCase(userRepository, logger);
const updateUserUseCase = new UpdateUserUseCase(userRepository, passwordHasher, logger);
const deleteUserUseCase = new DeleteUserUseCase(userRepository, logger);

const walletEventRepository = new RedisWalletEventRepository(redis);
const recordWalletEventUseCase = new RecordWalletEventUseCase(walletEventRepository);

const usersConsumer = new UsersKafkaConsumer(
  {
    clientId: "users-consumer",
    brokers: kafkaBrokers,
    groupId: "users-wallet",
    internalJwtKey
  },
  recordWalletEventUseCase,
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
      if (mongoose.connection.readyState !== 1) {
        throw new Error("Mongo not ready");
      }
      await redis.ping();
    }
  )
);
app.use(
  "/",
  buildUsersRoutes(
    new UsersController(
      registerUserUseCase,
      getUserUseCase,
      authenticateUserUseCase, // New
      listUsersUseCase,
      updateUserUseCase,
      deleteUserUseCase,
      jwtKey // New
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
  await connectMongo({ uri: mongoUri });
  await kafkaPublisher.connect();
  await usersConsumer.start();
  const metricsInterval = setInterval(() => {
    const state = mongoose.connection.readyState;
    const poolSize = (mongoose.connection.getClient() as any)?.topology?.s?.poolSize ?? undefined;
    metrics.updateMongoState(state, poolSize);
  }, 10000);

  const server = http.createServer(app);
  server.listen(port, () => {
    logger.info("Users service running", { port });
  });

  const shutdown = async () => {
    logger.info("Shutting down users service");
    clearInterval(metricsInterval);
    server.close();
    await usersConsumer.stop();
    await kafkaPublisher.disconnect();
    await mongoose.disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

start().catch((error) => {
  logger.error("Failed to start users service", { error: String(error) });
  process.exit(1);
});
