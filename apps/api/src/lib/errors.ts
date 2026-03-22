export class AppError extends Error {
  retryAfterMs?: number;
  constructor(message: string, readonly status = 400, readonly issues?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "发生未知错误";
}

