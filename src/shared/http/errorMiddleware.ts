import { NextFunction, Request, Response } from "express";
import { AppError } from "./AppError";
import { Logger } from "../observability/logger";
import { getTraceId } from "../observability/trace";

const resolveError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError("INTERNAL", 500, "Internal server error");
};

export const createErrorMiddleware =
  (logger: Logger) =>
  (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const resolved = resolveError(error);
    const originalMessage = error instanceof Error ? error.message : String(error);
    const originalStack = error instanceof Error ? error.stack : undefined;
    logger.error("Request failed", {
      code: resolved.code,
      statusCode: resolved.statusCode,
      originalMessage,
      stack: originalStack
    });
    const traceId = getTraceId();
    res.status(resolved.statusCode).json({
      error: resolved.message,
      code: resolved.code,
      traceId
    });
  };
