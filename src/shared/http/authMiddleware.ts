import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./AppError";
import { Metrics } from "../observability/metrics";

export type AuthConfig = {
  jwtKey: string;
  metrics: Metrics;
};

export type AuthenticatedRequest = Request & {
  userId?: string;
};

export const authMiddleware =
  (config: AuthConfig) =>
  (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      config.metrics.recordAuthFailure("missing_token");
      next(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwtKey, { algorithms: ["HS256"] }) as jwt.JwtPayload;
      const userId = typeof payload.sub === "string" ? payload.sub : (payload.userId as string);
      if (!userId) {
        config.metrics.recordAuthFailure("missing_user");
        next(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
        return;
      }
      req.userId = userId;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        config.metrics.recordAuthFailure("token_expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        config.metrics.recordAuthFailure("token_malformed");
      } else {
        config.metrics.recordAuthFailure("invalid_token");
      }
      next(new AppError("UNAUTHORIZED", 401, "Unauthorized"));
    }
  };
