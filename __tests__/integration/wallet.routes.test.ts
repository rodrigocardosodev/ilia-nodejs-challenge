import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { WalletController } from "../../src/wallet/interfaces/http/WalletController";
import { buildWalletRoutes } from "../../src/wallet/interfaces/http/routes";
import { createErrorMiddleware } from "../../src/shared/http/errorMiddleware";

describe("wallet routes", () => {
  const jwtKey = "secret";
  const metrics = { recordAuthFailure: jest.fn() };
  const logger = { error: jest.fn(), info: jest.fn() };

  const buildApp = () => {
    const createTransactionUseCase = {
      execute: jest.fn().mockResolvedValue({
        transactionId: "tx-1",
        createdAt: new Date(),
        balance: "100.0000"
      })
    };
    const getBalanceUseCase = { execute: jest.fn().mockResolvedValue("100.0000") };
    const listTransactionsUseCase = { execute: jest.fn().mockResolvedValue([]) };

    const controller = new WalletController(
      createTransactionUseCase as any,
      getBalanceUseCase as any,
      listTransactionsUseCase as any
    );

    const app = express();
    app.use(express.json());
    app.use("/", buildWalletRoutes(controller, { jwtKey, metrics } as any));
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
});
