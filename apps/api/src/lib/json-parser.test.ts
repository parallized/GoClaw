import { describe, expect, it } from "bun:test";
import { extractJsonBlock, safeJsonParse } from "./json-parser";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses valid JSON array", () => {
    expect(safeJsonParse<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses valid JSON string", () => {
    expect(safeJsonParse<string>('"hello"')).toBe("hello");
  });

  it("returns null for invalid JSON", () => {
    expect(safeJsonParse("{not json}")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeJsonParse("")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(safeJsonParse("hello world")).toBeNull();
  });

  it("returns null for undefined-like input", () => {
    expect(safeJsonParse("undefined")).toBeNull();
  });
});

describe("extractJsonBlock", () => {
  it("extracts JSON from markdown fenced block", () => {
    const input = 'Some text\n```json\n{"key":"value"}\n```\nMore text';
    expect(extractJsonBlock(input)).toBe('{"key":"value"}');
  });

  it("extracts JSON from fenced block with extra whitespace", () => {
    const input = '```json\n  {"key":"value"}  \n```';
    expect(extractJsonBlock(input)).toBe('{"key":"value"}');
  });

  it("handles case-insensitive fence marker", () => {
    const input = '```JSON\n{"key":"value"}\n```';
    expect(extractJsonBlock(input)).toBe('{"key":"value"}');
  });

  it("extracts multiline JSON from fenced block", () => {
    const input = '```json\n{\n  "tips": ["a", "b"],\n  "count": 2\n}\n```';
    expect(extractJsonBlock(input)).toBe('{\n  "tips": ["a", "b"],\n  "count": 2\n}');
  });

  it("returns trimmed input when no fence is found", () => {
    const input = '  {"key":"value"}  ';
    expect(extractJsonBlock(input)).toBe('{"key":"value"}');
  });

  it("returns trimmed input for plain text without fence", () => {
    expect(extractJsonBlock("  hello  ")).toBe("hello");
  });

  it("takes first fenced block if multiple exist", () => {
    const input = '```json\n{"first":true}\n```\n```json\n{"second":true}\n```';
    expect(extractJsonBlock(input)).toBe('{"first":true}');
  });
});
