import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { WalletController } from "../../src/wallet/interfaces/http/WalletController";
import { buildWalletRoutes } from "../../src/wallet/interfaces/http/routes";
import { createErrorMiddleware } from "../../src/shared/http/errorMiddleware";
import { createRateLimiters, RouteRateLimiters } from "../../src/shared/http/rateLimitMiddleware";
import { AppError } from "../../src/shared/http/AppError";

describe("wallet routes", () => {
  const jwtKey = "secret";
  const metrics = { recordAuthFailure: jest.fn() };
  const logger = { error: jest.fn(), info: jest.fn() };

  const buildApp = (
    rateLimiters?: Partial<RouteRateLimiters>,
    createTransactionUseCase?: { execute: jest.Mock }
  ) => {
    const transactionUseCase =
      createTransactionUseCase ??
      ({
        execute: jest.fn().mockResolvedValue({
          transactionId: "tx-1",
          createdAt: new Date(),
          balance: "100.0000"
        })
      } as { execute: jest.Mock });
    const getBalanceUseCase = { execute: jest.fn().mockResolvedValue("100.0000") };
    const listTransactionsUseCase = { execute: jest.fn().mockResolvedValue([]) };

    const controller = new WalletController(
      transactionUseCase as any,
      getBalanceUseCase as any,
      listTransactionsUseCase as any
    );

    const app = express();
    app.use(express.json());
    app.use("/", buildWalletRoutes(controller, { jwtKey, metrics } as any, rateLimiters));
    app.use(createErrorMiddleware(logger as any));
    return app;
  };

  const token = () => jwt.sign({ sub: "wallet-1" }, jwtKey, { algorithm: "HS256" });

  it("bloqueia acesso sem token", async () => {
    const app = buildApp();

    const response = await request(app).get("/balance");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("valida body de transação", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", "idem-invalid-body")
      .send({ amount: "10.0000" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_INPUT");
  });

  it("cria crédito com usuário igual ao token", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", "idem-credit")
      .send({ user_id: "wallet-1", type: "CREDIT", amount: "10.0000" });

    expect(response.status).toBe(201);
    expect(response.body.type).toBe("CREDIT");
  });

  it("cria débito com transferência", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", "idem-debit")
      .send({ user_id: "wallet-2", type: "DEBIT", amount: "10.0000" });

    expect(response.status).toBe(201);
    expect(response.body.type).toBe("DEBIT");
  });

  it("retorna 422 quando Idempotency-Key está ausente na transação", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ type: "CREDIT", amount: "10.0000" });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("retorna saldo", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/balance")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.amount).toBe("100.0000");
  });

  it("aplica rate limit no /transactions quando excede limite de escrita", async () => {
    const app = buildApp(
      createRateLimiters({
        namespace: "test-wallet-write",
        auth: { windowMs: 60_000, limit: 10 },
        write: { windowMs: 60_000, limit: 1 }
      })
    );

    const first = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", "idem-1")
      .send({ user_id: "wallet-1", type: "CREDIT", amount: "10.0000" });
    const second = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", "idem-2")
      .send({ user_id: "wallet-1", type: "CREDIT", amount: "10.0000" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("retorna 422 quando não há saldo para débito", async () => {
    const app = buildApp(undefined, {
      execute: jest
        .fn()
        .mockRejectedValue(new AppError("INSUFFICIENT_FUNDS", 422, "Insufficient funds"))
    });

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", "idem-insufficient")
      .send({ user_id: "wallet-1", type: "DEBIT", amount: "9999.0000" });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("INSUFFICIENT_FUNDS");
  });
});
