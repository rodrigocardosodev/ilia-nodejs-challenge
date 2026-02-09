import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

type TraceStore = {
  traceId: string;
};

const storage = new AsyncLocalStorage<TraceStore>();

export const runWithTrace = <T>(traceId: string, fn: () => T): T => {
  return storage.run({ traceId }, fn);
};

export const getTraceId = (): string | undefined => {
  return storage.getStore()?.traceId;
};

export const createTraceId = (): string => {
  return randomUUID();
};
