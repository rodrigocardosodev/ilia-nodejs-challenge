import jwt from "jsonwebtoken";
import { AppError } from "../../../src/shared/http/AppError";
import { asyncHandler } from "../../../src/shared/http/asyncHandler";
import { authMiddleware } from "../../../src/shared/http/authMiddleware";
import { createErrorMiddleware } from "../../../src/shared/http/errorMiddleware";
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

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("invalid_token");
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

      expect(metrics.recordAuthFailure).toHaveBeenCalledWith("invalid_token");
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
});
