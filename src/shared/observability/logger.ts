import { getTraceId } from "./trace";

export type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

export const createLogger = (service: string): Logger => {
  const log = (
    level: "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>
  ) => {
    const traceId = getTraceId();
    const entry = {
      level,
      service,
      message,
      traceId,
      time: new Date().toISOString(),
      ...meta
    };
    console.log(JSON.stringify(entry));
  };

  return {
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta)
  };
};
