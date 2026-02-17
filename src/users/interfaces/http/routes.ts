import { Router } from "express";
import { UsersController } from "./UsersController";
import { AuthConfig, authMiddleware } from "../../../shared/http/authMiddleware";
import { asyncHandler } from "../../../shared/http/asyncHandler";
import { requireIdempotencyKey } from "../../../shared/http/idempotencyKeyMiddleware";
import { RouteRateLimiters } from "../../../shared/http/rateLimitMiddleware";

const optional = (handler: RouteRateLimiters["auth"] | undefined) => (handler ? [handler] : []);

export const buildUsersRoutes = (
  controller: UsersController,
  authConfig: AuthConfig,
  rateLimiters?: Partial<RouteRateLimiters>
): Router => {
  const router = Router();
  router.post(
    "/users",
    ...optional(rateLimiters?.write),
    requireIdempotencyKey,
    asyncHandler(controller.register)
  );
  router.post("/auth", ...optional(rateLimiters?.auth), asyncHandler(controller.login));

  router.use(authMiddleware(authConfig));
  router.get("/users", asyncHandler(controller.list));
  router.get("/users/:id", asyncHandler(controller.getById));
  router.patch(
    "/users/:id",
    ...optional(rateLimiters?.write),
    requireIdempotencyKey,
    asyncHandler(controller.update)
  );
  router.delete(
    "/users/:id",
    ...optional(rateLimiters?.write),
    requireIdempotencyKey,
    asyncHandler(controller.remove)
  );
  return router;
};
