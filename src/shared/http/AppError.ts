export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}
