import { Router } from "express";
import { UsersController } from "./UsersController";
import { AuthConfig, authMiddleware } from "../../../shared/http/authMiddleware";
import { asyncHandler } from "../../../shared/http/asyncHandler";

export const buildUsersRoutes = (
  controller: UsersController,
  authConfig: AuthConfig
): Router => {
  const router = Router();
  router.post("/users", asyncHandler(controller.register));
  router.post("/auth", asyncHandler(controller.login));

  router.use(authMiddleware(authConfig));
  router.get("/users", asyncHandler(controller.list));
  router.get("/users/:id", asyncHandler(controller.getById));
  router.patch("/users/:id", asyncHandler(controller.update));
  router.delete("/users/:id", asyncHandler(controller.remove));
  return router;
};
