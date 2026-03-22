const KNOWN_ENDPOINT_SUFFIXES = [
  "/v1/chat/completions",
  "/v1/completions",
  "/v1/models"
] as const;

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const endpointBase = KNOWN_ENDPOINT_SUFFIXES.find((suffix) => trimmed.endsWith(suffix));
  const withoutEndpoint = endpointBase
    ? trimmed.slice(0, -endpointBase.length)
    : trimmed;

  if (!withoutEndpoint || withoutEndpoint === "/") {
    return "/v1";
  }

  return withoutEndpoint.endsWith("/v1")
    ? withoutEndpoint
    : `${withoutEndpoint}/v1`;
}

export function normalizeAiApiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  try {
    const url = new URL(trimmed);
    url.pathname = normalizePathname(url.pathname);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalizePathname(trimmed);
  }
}

export function buildAiApiUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = normalizeAiApiBaseUrl(baseUrl);
  if (!path) {
    return normalizedBaseUrl;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}
