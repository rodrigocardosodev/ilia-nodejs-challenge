import { NextFunction, Request, Response } from "express";
import { AppError } from "./AppError";

export const requireIdempotencyKey = (req: Request, _res: Response, next: NextFunction): void => {
  const idempotencyKey = req.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    next(new AppError("IDEMPOTENCY_KEY_REQUIRED", 422, "Idempotency-Key header is required"));
    return;
  }
  next();
};
