import { Router } from "express";
import { WalletController } from "./WalletController";
import { AuthConfig, authMiddleware } from "../../../shared/http/authMiddleware";
import { asyncHandler } from "../../../shared/http/asyncHandler";
import { requireIdempotencyKey } from "../../../shared/http/idempotencyKeyMiddleware";

export const buildWalletRoutes = (controller: WalletController, authConfig: AuthConfig): Router => {
  const router = Router();
  router.use(authMiddleware(authConfig));
  router.post("/transactions", requireIdempotencyKey, asyncHandler(controller.createTransaction));
  router.get("/transactions", asyncHandler(controller.listTransactions));
  router.get("/balance", asyncHandler(controller.getBalance));
  return router;
};
