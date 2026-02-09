import { Router } from "express";
import { WalletController } from "./WalletController";
import { AuthConfig, authMiddleware } from "../../../shared/http/authMiddleware";
import { asyncHandler } from "../../../shared/http/asyncHandler";

export const buildWalletRoutes = (controller: WalletController, authConfig: AuthConfig): Router => {
  const router = Router();
  router.use(authMiddleware(authConfig));
  router.post("/transactions", asyncHandler(controller.createTransaction));
  router.get("/transactions", asyncHandler(controller.listTransactions));
  router.get("/balance", asyncHandler(controller.getBalance));
  return router;
};
