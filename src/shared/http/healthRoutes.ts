import { Router } from "express";

export type HealthCheck = () => Promise<void>;

export const buildHealthRoutes = (
  liveness: HealthCheck,
  readiness: HealthCheck
): Router => {
  const router = Router();
  router.get("/health", async (_req, res) => {
    await liveness();
    res.status(200).json({ status: "ok" });
  });
  router.get("/ready", async (_req, res, next) => {
    try {
      await readiness();
      res.status(200).json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });
  return router;
};
