import { describe, expect, it } from "bun:test";
import { buildAiApiUrl, normalizeAiApiBaseUrl } from "./api-url";

describe("normalizeAiApiBaseUrl", () => {
  it("appends /v1 when base url omits version", () => {
    expect(normalizeAiApiBaseUrl("https://api.example.com")).toBe("https://api.example.com/v1");
  });

  it("keeps base url when /v1 already exists", () => {
    expect(normalizeAiApiBaseUrl("https://api.example.com/v1")).toBe("https://api.example.com/v1");
  });

  it("strips endpoint suffixes back to /v1", () => {
    expect(normalizeAiApiBaseUrl("https://api.example.com/v1/models")).toBe("https://api.example.com/v1");
    expect(normalizeAiApiBaseUrl("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1");
    expect(normalizeAiApiBaseUrl("https://api.example.com/v1/completions")).toBe("https://api.example.com/v1");
  });

  it("drops query and hash fragments", () => {
    expect(normalizeAiApiBaseUrl("https://api.example.com/v1/models?x=1#top")).toBe("https://api.example.com/v1");
  });
});

describe("buildAiApiUrl", () => {
  it("returns normalized base url for empty path", () => {
    expect(buildAiApiUrl("https://api.example.com/v1/models", "")).toBe("https://api.example.com/v1");
  });

  it("builds endpoint url from base root", () => {
    expect(buildAiApiUrl("https://api.example.com", "/models")).toBe("https://api.example.com/v1/models");
  });

  it("builds endpoint url from explicit v1 base", () => {
    expect(buildAiApiUrl("https://api.example.com/v1", "chat/completions")).toBe("https://api.example.com/v1/chat/completions");
  });
});
