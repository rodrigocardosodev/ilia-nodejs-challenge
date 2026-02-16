import { Router } from "express";
import { UsersController } from "./UsersController";
import { AuthConfig, authMiddleware } from "../../../shared/http/authMiddleware";
import { asyncHandler } from "../../../shared/http/asyncHandler";
import { requireIdempotencyKey } from "../../../shared/http/idempotencyKeyMiddleware";

export const buildUsersRoutes = (controller: UsersController, authConfig: AuthConfig): Router => {
  const router = Router();
  router.post("/users", requireIdempotencyKey, asyncHandler(controller.register));
  router.post("/auth", asyncHandler(controller.login));

  router.use(authMiddleware(authConfig));
  router.get("/users", asyncHandler(controller.list));
  router.get("/users/:id", asyncHandler(controller.getById));
  router.patch("/users/:id", requireIdempotencyKey, asyncHandler(controller.update));
  router.delete("/users/:id", requireIdempotencyKey, asyncHandler(controller.remove));
  return router;
};
