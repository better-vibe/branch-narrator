/**
 * Tests for untracked files integration with analyzers.
 *
 * Note: parseNameStatus tests are in dump-diff.test.ts to avoid duplication.
 */

import { describe, expect, it } from "bun:test";

describe("untracked files integration", () => {
  it("should include untracked files in file-summary when uncommitted", async () => {
    // This is a behavioral test - we verify the analyzer handles
    // added files correctly (which is how untracked files appear)
    const { fileSummaryAnalyzer } = await import(
      "../src/analyzers/file-summary.js"
    );
    const { createTestChangeSet, createTestFileDiff } = await import(
      "../src/core/change-set.js"
    );

    const changeSet = createTestChangeSet({
      files: [
        { path: "src/tests/e2e/chat.test.ts", status: "added" },
        { path: "src/tests/e2e/helpers.ts", status: "added" },
        { path: "supabase/migrations/001.sql", status: "added" },
      ],
      diffs: [
        createTestFileDiff(
          "src/tests/e2e/chat.test.ts",
          ['import { test } from "bun:test";', "test('chat', () => {});"],
          "added"
        ),
        createTestFileDiff(
          "src/tests/e2e/helpers.ts",
          ["export function helper() {}"],
          "added"
        ),
        createTestFileDiff(
          "supabase/migrations/001.sql",
          ["CREATE TABLE users (id uuid PRIMARY KEY);"],
          "added"
        ),
      ],
    });

    const findings = fileSummaryAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const summary = findings[0];
    expect(summary.type).toBe("file-summary");
    if (summary.type === "file-summary") {
      expect(summary.added).toContain("src/tests/e2e/chat.test.ts");
      expect(summary.added).toContain("src/tests/e2e/helpers.ts");
      expect(summary.added).toContain("supabase/migrations/001.sql");
    }
  });

  it("should detect test files from untracked additions", async () => {
    const { vitestAnalyzer } = await import("../src/analyzers/vitest.js");
    const { createTestChangeSet } = await import("../src/core/change-set.js");

    const changeSet = createTestChangeSet({
      files: [
        { path: "src/tests/e2e/chat.test.ts", status: "added" },
        { path: "src/tests/e2e/webhook.test.ts", status: "added" },
        { path: "vitest.config.e2e.ts", status: "added" },
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const testFinding = findings[0];
    expect(testFinding.type).toBe("test-change");
    if (testFinding.type === "test-change") {
      expect(testFinding.files).toContain("src/tests/e2e/chat.test.ts");
      expect(testFinding.files).toContain("src/tests/e2e/webhook.test.ts");
      expect(testFinding.files).toContain("vitest.config.e2e.ts");
    }
  });

  it("should detect supabase migrations from untracked additions", async () => {
    const { supabaseAnalyzer } = await import("../src/analyzers/supabase.js");
    const { createTestChangeSet, createTestFileDiff } = await import(
      "../src/core/change-set.js"
    );

    const changeSet = createTestChangeSet({
      files: [
        {
          path: "supabase/migrations/20251231000001_add_user.sql",
          status: "added",
        },
      ],
      diffs: [
        createTestFileDiff(
          "supabase/migrations/20251231000001_add_user.sql",
          [
            "CREATE TABLE users (",
            "  id uuid PRIMARY KEY,",
            "  email text NOT NULL",
            ");",
          ],
          "added"
        ),
      ],
    });

    const findings = supabaseAnalyzer.analyze(changeSet);
    expect(findings.length).toBeGreaterThan(0);

    const migrationFinding = findings.find((f) => f.type === "db-migration");
    expect(migrationFinding).toBeDefined();
    if (migrationFinding?.type === "db-migration") {
      expect(migrationFinding.files).toContain(
        "supabase/migrations/20251231000001_add_user.sql"
      );
      expect(migrationFinding.risk).toBe("medium"); // No destructive patterns
    }
  });
});

