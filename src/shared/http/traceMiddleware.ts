import { NextFunction, Request, Response } from "express";
import { createTraceId, runWithTrace } from "../observability/trace";

export const traceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header("x-trace-id");
  const traceIdPattern = /^[a-zA-Z0-9-]{8,128}$/;
  const traceId =
    typeof incoming === "string" && traceIdPattern.test(incoming) ? incoming : createTraceId();
  res.setHeader("x-trace-id", traceId);
  runWithTrace(traceId, () => next());
};
