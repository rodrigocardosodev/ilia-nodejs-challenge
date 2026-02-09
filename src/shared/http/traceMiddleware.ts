import { NextFunction, Request, Response } from "express";
import { createTraceId, runWithTrace } from "../observability/trace";

export const traceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header("x-trace-id");
  const traceId = incoming && incoming.length > 0 ? incoming : createTraceId();
  res.setHeader("x-trace-id", traceId);
  runWithTrace(traceId, () => next());
};
