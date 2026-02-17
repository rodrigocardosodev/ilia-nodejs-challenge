import { NextFunction, Request, Response } from "express";
import { Logger } from "../observability/logger";

export const requestLoggerMiddleware =
  (logger: Logger) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    let logged = false;
    const logRequest = () => {
      if (logged) {
        return;
      }
      logged = true;
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const route = req.route
        ? `${req.baseUrl ?? ""}${req.route.path ?? ""}`
        : (req.path ?? "unknown");
      logger.info("HTTP request", {
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs
      });
    };
    res.on("finish", logRequest);
    res.on("close", logRequest);
    next();
  };
