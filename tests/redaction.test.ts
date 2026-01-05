/**
 * Redaction tests.
 */

import { describe, expect, it } from "bun:test";
import { redactLine, redactLines } from "../src/commands/risk/redaction.js";

describe("redactLine", () => {
  it("should redact GitHub tokens", () => {
    const line = "TOKEN=ghp_1234567890abcdefghij1234567890abcdef";
    const redacted = redactLine(line);
    expect(redacted).toContain("<redacted-github-token>");
    expect(redacted).not.toContain("ghp_");
  });

  it("should redact secret key values with =", () => {
    const line = 'API_KEY="sk-1234567890abcdef"';
    const redacted = redactLine(line);
    expect(redacted).toContain("API_KEY=<redacted>");
    expect(redacted).not.toContain("sk-1234567890abcdef");
  });

  it("should redact secret key values with :", () => {
    const line = '  password: "supersecret123"';
    const redacted = redactLine(line);
    expect(redacted).toContain("password: <redacted>");
    expect(redacted).not.toContain("supersecret");
  });

  it("should redact token values", () => {
    const line = "AUTH_TOKEN=abc123def456ghi789";
    const redacted = redactLine(line);
    expect(redacted).toContain("AUTH_TOKEN=<redacted>");
  });

  it("should redact private_key values", () => {
    const line = "private_key: xyzabc123def";
    const redacted = redactLine(line);
    expect(redacted).toContain("private_key: <redacted>");
  });

  it("should redact long base64-like strings", () => {
    const line = "data: dGhpc2lzYWxvbmdlcnN0cmluZ3RoYW50aGlydHl0d29jaGFyYWN0ZXJzYW5kaXN2ZXJ5bG9uZw==";
    const redacted = redactLine(line);
    expect(redacted).toContain("<redacted-value>");
  });

  it("should NOT redact short values", () => {
    const line = "port: 3000";
    const redacted = redactLine(line);
    expect(redacted).toBe(line);
  });

  it("should NOT redact hash/checksum variables", () => {
    const line = 'const hash = "1234567890abcdef1234567890abcdef";';
    const redacted = redactLine(line);
    // Should keep the hash value since it contains "hash"
    expect(redacted).toContain("1234567890abcdef");
  });

  it("should preserve structure while redacting", () => {
    const line = "  api_key: my-secret-key";
    const redacted = redactLine(line);
    expect(redacted).toContain("  api_key");
    expect(redacted).not.toContain("my-secret-key");
  });

  it("should NOT redact permission values like 'write'", () => {
    const line = "    contents: write";
    const redacted = redactLine(line);
    expect(redacted).toBe(line); // Should not be changed
  });
});

describe("redactLines", () => {
  it("should redact multiple lines", () => {
    const lines = [
      "API_KEY=secret123",
      "DATABASE_URL=postgres://user:pass@host/db",
      "PORT=3000",
    ];

    const redacted = redactLines(lines);

    expect(redacted[0]).toContain("API_KEY=<redacted>");
    expect(redacted[1]).toContain("DATABASE_URL"); // May be partially redacted
    expect(redacted[2]).toBe("PORT=3000"); // PORT is not a secret pattern
  });

  it("should handle empty array", () => {
    const redacted = redactLines([]);
    expect(redacted).toEqual([]);
  });
});
