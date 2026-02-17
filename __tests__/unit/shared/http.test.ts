import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppError } from "../../../src/shared/http/AppError";
import { asyncHandler } from "../../../src/shared/http/asyncHandler";
import { authMiddleware } from "../../../src/shared/http/authMiddleware";
import { createErrorMiddleware } from "../../../src/shared/http/errorMiddleware";
import { buildHealthRoutes } from "../../../src/shared/http/healthRoutes";
import { requireIdempotencyKey } from "../../../src/shared/http/idempotencyKeyMiddleware";
import { createRateLimiters } from "../../../src/shared/http/rateLimitMiddleware";
import { requestLoggerMiddleware } from "../../../src/shared/http/requestLoggerMiddleware";
import { traceMiddleware } from "../../../src/shared/http/traceMiddleware";
import { runWithTrace } from "../../../src/shared/observability/trace";

describe("shared http", () => {
  describe("AppError", () => {
    it("exibe propriedades do erro", () => {
      const error = new AppError("NOT_FOUND", 404, "Not found");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Not found");
    });
  });

  describe("asyncHandler", () => {
    it("encaminha erro para next", async () => {
      const error = new Error("boom");
      const handler = asyncHandler(async () => {
        throw error;
      });
      const next = jest.fn();

      handler({} as any, {} as any, next);

      await new Promise((resolve) => setImmediate(resolve));
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("authMiddleware", () => {
    const makeMetrics = () => ({
      recordAuthFailure: jest.fn()
    });

    it("falha quando token ausente", () => {
      const metrics = makeMetrics();
      const middleware = authMiddleware({ jwtKey: "secret", metrics } as any);
      const next = jest.fn();
      const req = { headers: {} } as any;

      middleware(req, {} as any, next);

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("missing_token");
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "UNAUTHORIZED", statusCode: 401 })
      );
    });

    it("falha quando token inválido", () => {
      const metrics = makeMetrics();
      const middleware = authMiddleware({ jwtKey: "secret", metrics } as any);
      const next = jest.fn();
      const token = jwt.sign({ sub: "user-1" }, "wrong", { algorithm: "HS256" });
      const req = {
        headers: { authorization: `Bearer ${token}` }
      } as any;

      middleware(req, {} as any, next);

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("token_malformed");
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "UNAUTHORIZED", statusCode: 401 })
      );
    });

    it("falha quando token expirado", () => {
      const metrics = makeMetrics();
      const middleware = authMiddleware({ jwtKey: "secret", metrics } as any);
      const next = jest.fn();
      const token = jwt.sign(
        { sub: "user-1", exp: Math.floor(Date.now() / 1000) - 10 },
        "secret",
        { algorithm: "HS256" }
      );
      const req = {
        headers: { authorization: `Bearer ${token}` }
      } as any;

      middleware(req, {} as any, next);

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("token_expired");
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "UNAUTHORIZED", statusCode: 401 })
      );
    });

    it("falha quando Authorization não tem Bearer", () => {
      const metrics = makeMetrics();
      const middleware = authMiddleware({ jwtKey: "secret", metrics } as any);
      const next = jest.fn();
      const token = jwt.sign({ sub: "user-1" }, "secret", { algorithm: "HS256" });
      const req = {
        headers: { authorization: `Token ${token}` }
      } as any;

      middleware(req, {} as any, next);

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("missing_token");
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "UNAUTHORIZED", statusCode: 401 })
      );
    });

    it("falha quando payload não tem userId", () => {
      const metrics = makeMetrics();
      const middleware = authMiddleware({ jwtKey: "secret", metrics } as any);
      const next = jest.fn();
      const token = jwt.sign({}, "secret", { algorithm: "HS256" });
      const req = {
        headers: { authorization: `Bearer ${token}` }
      } as any;

      middleware(req, {} as any, next);

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("missing_user");
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: "UNAUTHORIZED", statusCode: 401 })
      );
    });

    it("define userId quando token válido", () => {
      const metrics = makeMetrics();
      const middleware = authMiddleware({ jwtKey: "secret", metrics } as any);
      const next = jest.fn();
      const token = jwt.sign({ sub: "user-1" }, "secret", { algorithm: "HS256" });
      const req = {
        headers: { authorization: `Bearer ${token}` }
      } as any;

      middleware(req, {} as any, next);

      expect(req.userId).toBe("user-1");
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("errorMiddleware", () => {
    it("responde com erro da aplicação", () => {
      const logger = { error: jest.fn() };
      const middleware = createErrorMiddleware(logger as any);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      runWithTrace("trace-1", () => {
        middleware(new AppError("FORBIDDEN", 403, "Forbidden"), {} as any, res, jest.fn());
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Forbidden",
          code: "FORBIDDEN",
          traceId: "trace-1"
        })
      );
    });

    it("responde com erro interno para erro desconhecido", () => {
      const logger = { error: jest.fn() };
      const middleware = createErrorMiddleware(logger as any);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      middleware(new Error("boom"), {} as any, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Internal server error",
          code: "INTERNAL"
        })
      );
    });

    it("aceita erro que não é instância de Error", () => {
      const logger = { error: jest.fn() };
      const middleware = createErrorMiddleware(logger as any);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      middleware("boom" as any, {} as any, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Internal server error",
          code: "INTERNAL"
        })
      );
    });
  });

  describe("requireIdempotencyKey", () => {
    it("retorna erro quando header está ausente", () => {
      const next = jest.fn();
      const req = {
        get: jest.fn().mockReturnValue(undefined)
      } as any;

      requireIdempotencyKey(req, {} as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "IDEMPOTENCY_KEY_REQUIRED",
          statusCode: 422
        })
      );
    });

    it("retorna erro quando header está vazio", () => {
      const next = jest.fn();
      const req = {
        get: jest.fn().mockReturnValue("   ")
      } as any;

      requireIdempotencyKey(req, {} as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "IDEMPOTENCY_KEY_REQUIRED",
          statusCode: 422
        })
      );
    });

    it("permite seguir quando header é válido", () => {
      const next = jest.fn();
      const req = {
        get: jest.fn().mockReturnValue("idem-123")
      } as any;

      requireIdempotencyKey(req, {} as any, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("rateLimitMiddleware", () => {
    it("bloqueia requests quando excede o limite de escrita", async () => {
      const logger = { error: jest.fn(), info: jest.fn() };
      const app = express();
      app.use(express.json());
      const rateLimiters = createRateLimiters({
        namespace: "test-unit-write",
        auth: { windowMs: 60_000, limit: 10 },
        write: { windowMs: 60_000, limit: 1 }
      });
      app.post("/write", rateLimiters.write, (_req, res) => {
        res.status(201).json({ ok: true });
      });
      app.use(createErrorMiddleware(logger as any));

      const first = await request(app).post("/write");
      const second = await request(app).post("/write");

      expect(first.status).toBe(201);
      expect(second.status).toBe(429);
      expect(second.body.code).toBe("TOO_MANY_REQUESTS");
    });

    it("não conta sucesso no limiter de auth", async () => {
      const logger = { error: jest.fn(), info: jest.fn() };
      const app = express();
      app.use(express.json());
      const rateLimiters = createRateLimiters({
        namespace: "test-unit-auth-success",
        auth: { windowMs: 60_000, limit: 1 },
        write: { windowMs: 60_000, limit: 10 }
      });
      app.post("/auth", rateLimiters.auth, (_req, res) => {
        res.status(200).json({ ok: true });
      });
      app.use(createErrorMiddleware(logger as any));

      const first = await request(app).post("/auth");
      const second = await request(app).post("/auth");

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it("conta falhas no limiter de auth e retorna 429 no excesso", async () => {
      const logger = { error: jest.fn(), info: jest.fn() };
      const app = express();
      app.use(express.json());
      const rateLimiters = createRateLimiters({
        namespace: "test-unit-auth-fail",
        auth: { windowMs: 60_000, limit: 1 },
        write: { windowMs: 60_000, limit: 10 }
      });
      app.post("/auth", rateLimiters.auth, (_req, _res, next) => {
        next(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
      });
      app.use(createErrorMiddleware(logger as any));

      const first = await request(app).post("/auth");
      const second = await request(app).post("/auth");

      expect(first.status).toBe(401);
      expect(second.status).toBe(429);
      expect(second.body.code).toBe("TOO_MANY_REQUESTS");
    });
  });

  describe("healthRoutes", () => {
    it("retorna 500 quando liveness falha", async () => {
      const app = express();
      const logger = { error: jest.fn() };
      app.use(
        buildHealthRoutes(
          async () => {
            throw new Error("liveness down");
          },
          async () => {}
        )
      );
      app.use(createErrorMiddleware(logger as any));

      const response = await request(app).get("/health");
      expect(response.status).toBe(500);
      expect(response.body.code).toBe("INTERNAL");
    });
  });

  describe("requestLoggerMiddleware", () => {
    it("registra requisição no finish", async () => {
      const app = express();
      const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
      app.use(requestLoggerMiddleware(logger as any));
      app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));

      await request(app).get("/ping");

      expect(logger.info).toHaveBeenCalledWith(
        "HTTP request",
        expect.objectContaining({
          method: "GET",
          route: "/ping",
          statusCode: 200
        })
      );
    });
  });

  describe("traceMiddleware", () => {
    it("gera trace id quando header recebido é inválido", () => {
      const req = { header: jest.fn().mockReturnValue("invalid trace id") } as any;
      const res = { setHeader: jest.fn() } as any;
      const next = jest.fn();

      traceMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("x-trace-id", expect.any(String));
      expect(next).toHaveBeenCalledWith();
      expect((res.setHeader as jest.Mock).mock.calls[0][1]).not.toBe("invalid trace id");
    });
  });
});
