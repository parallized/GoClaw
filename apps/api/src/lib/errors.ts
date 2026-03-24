export class AppError extends Error {
  retryAfterMs?: number;
  constructor(message: string, readonly status = 400, readonly issues?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

const CERTIFICATE_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_SIGNATURE_FAILURE",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT"
]);

const CERTIFICATE_ERROR_PATTERNS = [
  /certificate/i,
  /cert[_\s-]/i,
  /tls/i,
  /ssl/i,
  /verification/i,
  /unable to verify/i
];

const NETWORK_ERROR_PATTERNS = [
  /connection/i,
  /connect/i,
  /dns/i,
  /fetch failed/i,
  /network/i,
  /socket/i,
  /timed out/i,
  /timeout/i
];

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

export function isCertificateVerificationError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && (CERTIFICATE_ERROR_CODES.has(code) || code.includes("CERT") || code.includes("TLS"))) {
    return true;
  }

  const message = errorMessage(error);
  return CERTIFICATE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function isNetworkFailureError(error: unknown): boolean {
  if (isCertificateVerificationError(error)) {
    return true;
  }

  const code = errorCode(error);
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return true;
  }

  const message = errorMessage(error);
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

interface UpstreamErrorOptions {
  timeoutMessage?: string;
  certificateMessage?: string;
  networkMessage?: string;
}

export function normalizeUpstreamServiceError(
  error: unknown,
  options: UpstreamErrorOptions = {}
): AppError | unknown {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new AppError(options.timeoutMessage ?? "请求外部服务超时", 504);
  }

  if (isCertificateVerificationError(error)) {
    return new AppError(options.certificateMessage ?? "外部服务证书校验失败，请稍后重试。", 503);
  }

  if (isNetworkFailureError(error)) {
    return new AppError(options.networkMessage ?? "外部服务网络连接失败，请稍后重试。", 503);
  }

  return error;
}

export function toErrorMessage(error: unknown): string {
  if (isCertificateVerificationError(error)) {
    return "外部服务证书校验失败，请稍后重试。";
  }

  if (isNetworkFailureError(error)) {
    return "外部服务网络连接失败，请稍后重试。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "发生未知错误";
}
