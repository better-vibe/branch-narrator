/**
 * Tests for evidence extraction and redaction.
 */

import { describe, it, expect } from "vitest";
import {
  createEvidence,
  redactSecrets,
  redactEvidence,
  truncateExcerpt,
  extractRepresentativeExcerpt,
} from "../src/core/evidence.js";

describe("createEvidence", () => {
  it("should create evidence with file and excerpt", () => {
    const evidence = createEvidence("src/auth.ts", "const token = JWT.sign()");

    expect(evidence.file).toBe("src/auth.ts");
    expect(evidence.excerpt).toBe("const token = JWT.sign()");
    expect(evidence.line).toBeUndefined();
    expect(evidence.hunk).toBeUndefined();
  });

  it("should trim excerpt whitespace", () => {
    const evidence = createEvidence("file.ts", "  \n  code here  \n  ");

    expect(evidence.excerpt).toBe("code here");
  });

  it("should include line number when provided", () => {
    const evidence = createEvidence("file.ts", "code", { line: 42 });

    expect(evidence.line).toBe(42);
  });

  it("should include hunk metadata when provided", () => {
    const evidence = createEvidence("file.ts", "code", {
      hunk: {
        oldStart: 10,
        oldLines: 5,
        newStart: 15,
        newLines: 8,
        content: "...",
        additions: [],
        deletions: [],
      },
    });

    expect(evidence.hunk).toEqual({
      oldStart: 10,
      oldLines: 5,
      newStart: 15,
      newLines: 8,
    });
  });
});

describe("redactSecrets", () => {
  it("should redact Stripe API keys", () => {
    // Note: Using TESTKEY to avoid triggering secret scanners
    const text = 'const key = "sk_live_TESTKEY1234567890ABCDEFGHIJKLMN"';
    const redacted = redactSecrets(text);

    expect(redacted).toBe('const key = "sk_live_***REDACTED***"');
  });

  it("should redact test Stripe keys", () => {
    const text = "pk_test_EXAMPLEKEY12345678901234567";
    const redacted = redactSecrets(text);

    expect(redacted).toContain("pk_test_***REDACTED***");
  });

  it("should redact JWT tokens", () => {
    // Note: JWT must be long enough to match
    const text = "bearer: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const redacted = redactSecrets(text);

    expect(redacted).toContain("eyJ***REDACTED***");
  });

  it("should redact AWS access keys", () => {
    const text = "aws_access_key_id = AKIAIOSFODNN7EXAMPLE";
    const redacted = redactSecrets(text);

    expect(redacted).toContain("AKIA***REDACTED***");
  });

  it("should redact password values but preserve key name", () => {
    const text = 'password: "super_secret_123"';
    const redacted = redactSecrets(text);

    expect(redacted).toContain("password:");
    expect(redacted).toContain("***REDACTED***");
    expect(redacted).not.toContain("super_secret_123");
  });

  it("should redact secret values", () => {
    const text = "secret=my_secret_value_here";
    const redacted = redactSecrets(text);

    expect(redacted).toContain("secret");
    expect(redacted).toContain("***REDACTED***");
    expect(redacted).not.toContain("my_secret_value_here");
  });

  it("should redact token values", () => {
    const text = "api_token='abc123def456'";
    const redacted = redactSecrets(text);

    expect(redacted).toContain("api_token");
    expect(redacted).toContain("***REDACTED***");
    expect(redacted).not.toContain("abc123def456");
  });

  it("should preserve non-sensitive code", () => {
    const text = "const username = 'john.doe'";
    const redacted = redactSecrets(text);

    // Username is not a secret pattern, should be unchanged
    expect(redacted).toBe(text);
  });

  it("should handle multiple secrets in same text", () => {
    const text = 'password="pass123" token="tok456"';
    const redacted = redactSecrets(text);

    expect(redacted).toContain("password");
    expect(redacted).toContain("token");
    expect(redacted).not.toContain("pass123");
    expect(redacted).not.toContain("tok456");
  });
});

describe("redactEvidence", () => {
  it("should redact evidence excerpt", () => {
    const evidence = createEvidence(
      "src/config.ts",
      'const apiKey = "sk_live_ABCDEFGH123456789"'
    );

    const redacted = redactEvidence(evidence);

    expect(redacted.excerpt).toContain("***REDACTED***");
    expect(redacted.excerpt).not.toContain("sk_live_ABCDEFGH");
  });

  it("should preserve file and metadata", () => {
    const evidence = createEvidence(
      "src/auth.ts",
      'password: "secret123"',
      { line: 42 }
    );

    const redacted = redactEvidence(evidence);

    expect(redacted.file).toBe("src/auth.ts");
    expect(redacted.line).toBe(42);
  });
});

describe("truncateExcerpt", () => {
  it("should not truncate short excerpts", () => {
    const short = "This is a short line";
    const truncated = truncateExcerpt(short, 100);

    expect(truncated).toBe(short);
  });

  it("should truncate long excerpts", () => {
    const long = "a".repeat(300);
    const truncated = truncateExcerpt(long, 100);

    expect(truncated.length).toBe(100);
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("should use default max length of 200", () => {
    const long = "b".repeat(300);
    const truncated = truncateExcerpt(long);

    expect(truncated.length).toBe(200);
    expect(truncated.endsWith("...")).toBe(true);
  });
});

describe("extractRepresentativeExcerpt", () => {
  it("should return empty string for empty additions", () => {
    const excerpt = extractRepresentativeExcerpt([]);

    expect(excerpt).toBe("");
  });

  it("should skip comment lines", () => {
    const additions = [
      "// This is a comment",
      "/* Another comment */",
      "* Comment in block",
      "# Python comment",
      "const code = true;",
    ];

    const excerpt = extractRepresentativeExcerpt(additions);

    expect(excerpt).toBe("const code = true;");
  });

  it("should skip empty lines", () => {
    const additions = ["", "   ", "\t", "const code = true;"];

    const excerpt = extractRepresentativeExcerpt(additions);

    expect(excerpt).toBe("const code = true;");
  });

  it("should return first non-comment line", () => {
    const additions = [
      "// Header comment",
      "import { something } from 'somewhere';",
      "const value = 42;",
    ];

    const excerpt = extractRepresentativeExcerpt(additions);

    expect(excerpt).toBe("import { something } from 'somewhere';");
  });

  it("should truncate long excerpts", () => {
    const long = "a".repeat(300);
    const additions = [long];

    const excerpt = extractRepresentativeExcerpt(additions, 100);

    expect(excerpt.length).toBe(100);
    expect(excerpt.endsWith("...")).toBe(true);
  });

  it("should trim whitespace from excerpt", () => {
    const additions = ["  \t  const value = 42;  \n  "];

    const excerpt = extractRepresentativeExcerpt(additions);

    expect(excerpt).toBe("const value = 42;");
  });
});
