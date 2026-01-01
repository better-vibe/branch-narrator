/**
 * Tests for dump-diff command.
 * These are unit tests that do NOT require an actual git repo.
 */

import { describe, expect, it } from "vitest";
import {
  buildNameStatusArgs,
  buildPerFileDiffArgs,
  buildUntrackedDiffArgs,
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  parseNameStatus,
  parsePorcelainZForUntracked,
  renderJson,
  renderMarkdown,
  renderText,
  type DiffFileEntry,
  type DiffMode,
  type DumpDiffOutput,
  type FileEntry,
} from "../src/commands/dump-diff/index.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createFileEntry(
  path: string,
  status: "A" | "M" | "D" | "R" = "M",
  oldPath?: string,
  untracked?: boolean
): FileEntry {
  return { path, status, oldPath, untracked };
}

function createDiffEntry(
  path: string,
  diff: string,
  status: "A" | "M" | "D" | "R" = "M",
  oldPath?: string,
  untracked?: boolean
): DiffFileEntry {
  return { path, status, diff, oldPath, untracked };
}

// ============================================================================
// buildNameStatusArgs Tests
// ============================================================================

describe("buildNameStatusArgs", () => {
  it("should return correct args for branch mode", () => {
    const result = buildNameStatusArgs({
      mode: "branch",
      base: "main",
      head: "feature",
    });

    expect(result).toEqual([
      "diff",
      "--name-status",
      "--find-renames",
      "main..feature",
    ]);
  });

  it("should return correct args for unstaged mode", () => {
    const result = buildNameStatusArgs({ mode: "unstaged" });

    expect(result).toEqual(["diff", "--name-status", "--find-renames"]);
  });

  it("should return correct args for staged mode", () => {
    const result = buildNameStatusArgs({ mode: "staged" });

    expect(result).toEqual([
      "diff",
      "--name-status",
      "--find-renames",
      "--staged",
    ]);
  });

  it("should return correct args for all mode", () => {
    const result = buildNameStatusArgs({ mode: "all" });

    expect(result).toEqual(["diff", "--name-status", "--find-renames", "HEAD"]);
  });
});

// ============================================================================
// buildPerFileDiffArgs Tests
// ============================================================================

describe("buildPerFileDiffArgs", () => {
  it("should return correct args for branch mode", () => {
    const result = buildPerFileDiffArgs({
      mode: "branch",
      base: "main",
      head: "feature",
      unified: 3,
      path: "src/index.ts",
    });

    expect(result).toEqual([
      "diff",
      "--unified=3",
      "--find-renames",
      "main..feature",
      "--",
      "src/index.ts",
    ]);
  });

  it("should return correct args for unstaged mode", () => {
    const result = buildPerFileDiffArgs({
      mode: "unstaged",
      unified: 0,
      path: "src/index.ts",
    });

    expect(result).toEqual([
      "diff",
      "--unified=0",
      "--find-renames",
      "--",
      "src/index.ts",
    ]);
  });

  it("should return correct args for staged mode", () => {
    const result = buildPerFileDiffArgs({
      mode: "staged",
      unified: 5,
      path: "src/index.ts",
    });

    expect(result).toEqual([
      "diff",
      "--unified=5",
      "--find-renames",
      "--staged",
      "--",
      "src/index.ts",
    ]);
  });

  it("should return correct args for all mode", () => {
    const result = buildPerFileDiffArgs({
      mode: "all",
      unified: 0,
      path: "src/index.ts",
    });

    expect(result).toEqual([
      "diff",
      "--unified=0",
      "--find-renames",
      "HEAD",
      "--",
      "src/index.ts",
    ]);
  });

  it("should include oldPath for renames", () => {
    const result = buildPerFileDiffArgs({
      mode: "branch",
      base: "main",
      head: "HEAD",
      unified: 0,
      path: "src/new-name.ts",
      oldPath: "src/old-name.ts",
    });

    expect(result).toEqual([
      "diff",
      "--unified=0",
      "--find-renames",
      "main..HEAD",
      "--",
      "src/old-name.ts",
      "src/new-name.ts",
    ]);
  });
});

// ============================================================================
// buildUntrackedDiffArgs Tests
// ============================================================================

describe("buildUntrackedDiffArgs", () => {
  it("should return correct args for untracked file", () => {
    const result = buildUntrackedDiffArgs("src/new-file.ts", 0);

    expect(result).toEqual([
      "diff",
      "--no-index",
      "--unified=0",
      "--",
      "/dev/null",
      "src/new-file.ts",
    ]);
  });

  it("should use specified unified context", () => {
    const result = buildUntrackedDiffArgs("src/new-file.ts", 5);

    expect(result).toContain("--unified=5");
  });
});

// ============================================================================
// parsePorcelainZForUntracked Tests
// ============================================================================

describe("parsePorcelainZForUntracked", () => {
  it("should parse untracked files from porcelain output", () => {
    // NUL-separated output with ?? prefix for untracked
    const output = "?? src/new-file.ts\0?? docs/readme.md\0";
    const result = parsePorcelainZForUntracked(output);

    expect(result).toEqual(["src/new-file.ts", "docs/readme.md"]);
  });

  it("should ignore non-untracked entries", () => {
    // Mix of tracked and untracked
    const output = "M  src/modified.ts\0?? src/new-file.ts\0A  src/added.ts\0";
    const result = parsePorcelainZForUntracked(output);

    expect(result).toEqual(["src/new-file.ts"]);
  });

  it("should handle empty output", () => {
    expect(parsePorcelainZForUntracked("")).toEqual([]);
  });

  it("should handle output with no untracked files", () => {
    const output = "M  src/modified.ts\0A  src/added.ts\0";
    const result = parsePorcelainZForUntracked(output);

    expect(result).toEqual([]);
  });
});

// ============================================================================
// Default Exclusion Matching Tests
// ============================================================================

describe("filterPaths - default exclusions", () => {
  it("should exclude lockfiles by default", () => {
    const files = [
      createFileEntry("pnpm-lock.yaml"),
      createFileEntry("package-lock.json"),
      createFileEntry("yarn.lock"),
      createFileEntry("bun.lockb"),
      createFileEntry("src/index.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.path).toBe("src/index.ts");
    expect(result.skipped).toHaveLength(4);
    expect(result.skipped.every((s) => s.reason === "excluded-by-default")).toBe(
      true
    );
  });

  it("should exclude .d.ts files by default", () => {
    const files = [
      createFileEntry("src/types.d.ts"),
      createFileEntry("dist/index.d.ts"),
      createFileEntry("src/index.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.path).toBe("src/index.ts");
    expect(result.skipped).toHaveLength(2);
  });

  it("should exclude build directories by default", () => {
    const files = [
      createFileEntry("dist/index.js"),
      createFileEntry("build/app.js"),
      createFileEntry(".svelte-kit/output/client.js"),
      createFileEntry(".next/static/chunks/main.js"),
      createFileEntry("coverage/lcov.info"),
      createFileEntry("src/app.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.path).toBe("src/app.ts");
    expect(result.skipped).toHaveLength(5);
  });

  it("should exclude minified and sourcemap files", () => {
    const files = [
      createFileEntry("dist/app.min.js"),
      createFileEntry("dist/app.min.css"),
      createFileEntry("dist/app.js.map"),
      createFileEntry("dist/app.css.map"),
      createFileEntry("src/app.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.path).toBe("src/app.ts");
  });

  it("should exclude log files", () => {
    const files = [
      createFileEntry("npm-debug.log"),
      createFileEntry("error.logs"),
      createFileEntry("src/logger.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.path).toBe("src/logger.ts");
  });
});

// ============================================================================
// Include/Exclude Precedence Tests
// ============================================================================

describe("filterPaths - include/exclude precedence", () => {
  it("should only include files matching include globs", () => {
    const files = [
      createFileEntry("src/index.ts"),
      createFileEntry("src/utils.ts"),
      createFileEntry("tests/index.test.ts"),
      createFileEntry("README.md"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: ["src/**"],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(2);
    expect(result.included.map((f) => f.path)).toEqual([
      "src/index.ts",
      "src/utils.ts",
    ]);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s) => s.reason === "not-included")).toBe(true);
  });

  it("should apply excludes even when includes match", () => {
    const files = [
      createFileEntry("src/index.ts"),
      createFileEntry("src/utils.ts"),
      createFileEntry("src/legacy.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: ["src/**"],
      excludeGlobs: ["**/legacy.ts"],
      defaultExcludes: [],
    });

    expect(result.included).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe("excluded-by-glob");
  });

  it("should skip default excludes when explicitly included", () => {
    const files = [
      createFileEntry("pnpm-lock.yaml"),
      createFileEntry("package.json"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: ["pnpm-lock.yaml"],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    // When --include is used, default excludes don't apply to included files
    expect(result.included).toHaveLength(1);
    expect(result.included[0]!.path).toBe("pnpm-lock.yaml");
    expect(result.skipped[0]!.reason).toBe("not-included");
  });

  it("should sort included files alphabetically", () => {
    const files = [
      createFileEntry("z.ts"),
      createFileEntry("a.ts"),
      createFileEntry("m.ts"),
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: [],
    });

    expect(result.included.map((f) => f.path)).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("should filter untracked files same as tracked files", () => {
    const files = [
      createFileEntry("src/index.ts", "A", undefined, true), // untracked
      createFileEntry("pnpm-lock.yaml", "A", undefined, true), // untracked lockfile
      createFileEntry("src/utils.ts", "M"), // tracked
    ];

    const result = filterPaths({
      files,
      includeGlobs: [],
      excludeGlobs: [],
      defaultExcludes: DEFAULT_EXCLUDES,
    });

    expect(result.included).toHaveLength(2);
    expect(result.included.map((f) => f.path)).toContain("src/index.ts");
    expect(result.included.map((f) => f.path)).toContain("src/utils.ts");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.path).toBe("pnpm-lock.yaml");
  });
});

// ============================================================================
// Chunking Algorithm Tests
// ============================================================================

describe("chunkByBudget", () => {
  it("should return empty array for empty input", () => {
    const result = chunkByBudget([], 1000);
    expect(result).toEqual([]);
  });

  it("should return single chunk when under budget", () => {
    const items = [
      createDiffEntry("a.ts", "diff a"),
      createDiffEntry("b.ts", "diff b"),
    ];

    const result = chunkByBudget(items, 1000);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("should split into multiple chunks when over budget", () => {
    const items = [
      createDiffEntry("a.ts", "a".repeat(100)),
      createDiffEntry("b.ts", "b".repeat(100)),
      createDiffEntry("c.ts", "c".repeat(100)),
    ];

    const result = chunkByBudget(items, 150);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(1);
    expect(result[2]).toHaveLength(1);
  });

  it("should group files that fit together", () => {
    const items = [
      createDiffEntry("a.ts", "a".repeat(40)),
      createDiffEntry("b.ts", "b".repeat(40)),
      createDiffEntry("c.ts", "c".repeat(40)),
      createDiffEntry("d.ts", "d".repeat(40)),
    ];

    const result = chunkByBudget(items, 100);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2); // a + b = 80
    expect(result[1]).toHaveLength(2); // c + d = 80
  });

  it("should handle single file exceeding budget", () => {
    const items = [
      createDiffEntry("small.ts", "small"),
      createDiffEntry("huge.ts", "x".repeat(1000)),
      createDiffEntry("another.ts", "another"),
    ];

    const result = chunkByBudget(items, 100);
    expect(result).toHaveLength(3);
    expect(result[0]![0]!.path).toBe("small.ts");
    expect(result[1]![0]!.path).toBe("huge.ts");
    expect(result[2]![0]!.path).toBe("another.ts");
  });

  it("should not split files across chunks", () => {
    const items = [
      createDiffEntry("a.ts", "a".repeat(60)),
      createDiffEntry("b.ts", "b".repeat(60)),
    ];

    const result = chunkByBudget(items, 100);
    // Each file is 60 chars, together they're 120 > 100
    // So they should be in separate chunks
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(1);
  });
});

// ============================================================================
// JSON Schema Tests (v1.1)
// ============================================================================

describe("renderJson - schema validation", () => {
  it("should produce valid JSON with schemaVersion 1.1 and mode", () => {
    const output: DumpDiffOutput = {
      schemaVersion: "1.1",
      mode: "branch",
      base: "main",
      head: "HEAD",
      unified: 3,
      included: [
        {
          path: "src/index.ts",
          status: "M",
          diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new",
        },
      ],
      skipped: [
        { path: "pnpm-lock.yaml", reason: "excluded-by-default" },
        { path: "assets/logo.png", reason: "binary" },
      ],
      stats: {
        filesConsidered: 3,
        filesIncluded: 1,
        filesSkipped: 2,
        chars: 50,
      },
    };

    const json = renderJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe("1.1");
    expect(parsed.mode).toBe("branch");
    expect(parsed.base).toBe("main");
    expect(parsed.head).toBe("HEAD");
    expect(parsed.unified).toBe(3);
    expect(parsed.included).toHaveLength(1);
    expect(parsed.included[0].path).toBe("src/index.ts");
    expect(parsed.included[0].status).toBe("M");
    expect(parsed.included[0].diff).toContain("--- a/src/index.ts");
    expect(parsed.skipped).toHaveLength(2);
    expect(parsed.stats.filesConsidered).toBe(3);
    expect(parsed.stats.filesIncluded).toBe(1);
    expect(parsed.stats.filesSkipped).toBe(2);
    expect(parsed.stats.chars).toBe(50);
  });

  it("should have null base/head for non-branch modes", () => {
    const output: DumpDiffOutput = {
      schemaVersion: "1.1",
      mode: "unstaged",
      base: null,
      head: null,
      unified: 0,
      included: [],
      skipped: [],
      stats: {
        filesConsidered: 0,
        filesIncluded: 0,
        filesSkipped: 0,
        chars: 0,
      },
    };

    const json = renderJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.mode).toBe("unstaged");
    expect(parsed.base).toBeNull();
    expect(parsed.head).toBeNull();
  });

  it("should handle all mode values", () => {
    const modes: DiffMode[] = ["branch", "unstaged", "staged", "all"];

    for (const mode of modes) {
      const output: DumpDiffOutput = {
        schemaVersion: "1.1",
        mode,
        base: mode === "branch" ? "main" : null,
        head: mode === "branch" ? "HEAD" : null,
        unified: 0,
        included: [],
        skipped: [],
        stats: {
          filesConsidered: 0,
          filesIncluded: 0,
          filesSkipped: 0,
          chars: 0,
        },
      };

      const json = renderJson(output);
      const parsed = JSON.parse(json);
      expect(parsed.mode).toBe(mode);
    }
  });

  it("should handle renamed files with oldPath", () => {
    const output: DumpDiffOutput = {
      schemaVersion: "1.1",
      mode: "branch",
      base: "main",
      head: "feature",
      unified: 0,
      included: [
        {
          path: "src/new-name.ts",
          oldPath: "src/old-name.ts",
          status: "R",
          diff: "rename diff",
        },
      ],
      skipped: [],
      stats: {
        filesConsidered: 1,
        filesIncluded: 1,
        filesSkipped: 0,
        chars: 11,
      },
    };

    const json = renderJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.included[0].oldPath).toBe("src/old-name.ts");
    expect(parsed.included[0].status).toBe("R");
  });

  it("should include untracked flag for untracked files", () => {
    const output: DumpDiffOutput = {
      schemaVersion: "1.1",
      mode: "all",
      base: null,
      head: null,
      unified: 0,
      included: [
        {
          path: "src/new-file.ts",
          status: "A",
          diff: "new file diff",
          untracked: true,
        },
      ],
      skipped: [],
      stats: {
        filesConsidered: 1,
        filesIncluded: 1,
        filesSkipped: 0,
        chars: 13,
      },
    };

    const json = renderJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.included[0].untracked).toBe(true);
  });

  it("should include all skip reasons", () => {
    const output: DumpDiffOutput = {
      schemaVersion: "1.1",
      mode: "branch",
      base: "main",
      head: "HEAD",
      unified: 0,
      included: [],
      skipped: [
        { path: "pnpm-lock.yaml", reason: "excluded-by-default" },
        { path: "ignored.ts", reason: "excluded-by-glob" },
        { path: "logo.png", reason: "binary" },
        { path: "other.ts", reason: "not-included" },
      ],
      stats: {
        filesConsidered: 4,
        filesIncluded: 0,
        filesSkipped: 4,
        chars: 0,
      },
    };

    const json = renderJson(output);
    const parsed = JSON.parse(json);

    const reasons = parsed.skipped.map((s: { reason: string }) => s.reason);
    expect(reasons).toContain("excluded-by-default");
    expect(reasons).toContain("excluded-by-glob");
    expect(reasons).toContain("binary");
    expect(reasons).toContain("not-included");
  });
});

// ============================================================================
// parseNameStatus Tests
// ============================================================================

describe("parseNameStatus", () => {
  it("should parse added files", () => {
    const output = "A\tsrc/new-file.ts";
    const result = parseNameStatus(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ path: "src/new-file.ts", status: "A" });
  });

  it("should parse modified files", () => {
    const output = "M\tsrc/existing.ts";
    const result = parseNameStatus(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ path: "src/existing.ts", status: "M" });
  });

  it("should parse deleted files", () => {
    const output = "D\tsrc/removed.ts";
    const result = parseNameStatus(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ path: "src/removed.ts", status: "D" });
  });

  it("should parse renamed files with old and new paths", () => {
    const output = "R100\tsrc/old-name.ts\tsrc/new-name.ts";
    const result = parseNameStatus(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "src/new-name.ts",
      oldPath: "src/old-name.ts",
      status: "R",
    });
  });

  it("should parse multiple files", () => {
    const output = `A\tsrc/new.ts
M\tsrc/changed.ts
D\tsrc/removed.ts
R095\tsrc/old.ts\tsrc/renamed.ts`;

    const result = parseNameStatus(output);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ path: "src/new.ts", status: "A" });
    expect(result[1]).toEqual({ path: "src/changed.ts", status: "M" });
    expect(result[2]).toEqual({ path: "src/removed.ts", status: "D" });
    expect(result[3]).toEqual({
      path: "src/renamed.ts",
      oldPath: "src/old.ts",
      status: "R",
    });
  });

  it("should handle empty input", () => {
    expect(parseNameStatus("")).toEqual([]);
    expect(parseNameStatus("  \n  ")).toEqual([]);
  });
});

// ============================================================================
// Render Tests
// ============================================================================

describe("renderText", () => {
  it("should join diffs with newlines", () => {
    const entries = [
      createDiffEntry("a.ts", "diff a"),
      createDiffEntry("b.ts", "diff b"),
    ];

    const result = renderText(entries);
    expect(result).toBe("diff a\ndiff b");
  });

  it("should handle empty array", () => {
    expect(renderText([])).toBe("");
  });
});

describe("renderMarkdown", () => {
  it("should include mode-specific header for branch mode", () => {
    const entries = [createDiffEntry("a.ts", "diff content")];
    const result = renderMarkdown(entries, {
      mode: "branch",
      base: "main",
      head: "feature",
      unified: 3,
      excludePatterns: [],
    });

    expect(result).toContain("# Git Diff: main..feature");
    expect(result).toContain("**Mode:** branch");
    expect(result).toContain("**Unified context:** 3 lines");
  });

  it("should show unstaged mode header", () => {
    const entries = [createDiffEntry("a.ts", "diff content")];
    const result = renderMarkdown(entries, {
      mode: "unstaged",
      base: null,
      head: null,
      unified: 0,
      excludePatterns: [],
    });

    expect(result).toContain("# Git Diff: Unstaged Changes (working tree vs index)");
    expect(result).toContain("**Mode:** unstaged");
  });

  it("should show staged mode header", () => {
    const entries = [createDiffEntry("a.ts", "diff content")];
    const result = renderMarkdown(entries, {
      mode: "staged",
      base: null,
      head: null,
      unified: 0,
      excludePatterns: [],
    });

    expect(result).toContain("# Git Diff: Staged Changes (index vs HEAD)");
    expect(result).toContain("**Mode:** staged");
  });

  it("should show all mode header", () => {
    const entries = [createDiffEntry("a.ts", "diff content")];
    const result = renderMarkdown(entries, {
      mode: "all",
      base: null,
      head: null,
      unified: 0,
      excludePatterns: [],
    });

    expect(result).toContain("# Git Diff: All Changes (working tree vs HEAD)");
    expect(result).toContain("**Mode:** all");
  });

  it("should list files with status", () => {
    const entries = [
      createDiffEntry("src/added.ts", "diff", "A"),
      createDiffEntry("src/modified.ts", "diff", "M"),
      createDiffEntry("src/deleted.ts", "diff", "D"),
      createDiffEntry("src/renamed.ts", "diff", "R"),
    ];

    const result = renderMarkdown(entries, {
      mode: "branch",
      base: "main",
      head: "HEAD",
      unified: 0,
      excludePatterns: [],
    });

    expect(result).toContain("`src/added.ts` (added)");
    expect(result).toContain("`src/modified.ts` (modified)");
    expect(result).toContain("`src/deleted.ts` (deleted)");
    expect(result).toContain("`src/renamed.ts` (renamed)");
  });

  it("should mark untracked files", () => {
    const entries = [
      createDiffEntry("src/new-file.ts", "diff", "A", undefined, true),
    ];

    const result = renderMarkdown(entries, {
      mode: "all",
      base: null,
      head: null,
      unified: 0,
      excludePatterns: [],
    });

    expect(result).toContain("`src/new-file.ts` (added [untracked])");
  });

  it("should wrap diff in fenced code block", () => {
    const entries = [createDiffEntry("a.ts", "--- a/a.ts\n+++ b/a.ts")];
    const result = renderMarkdown(entries, {
      mode: "branch",
      base: "main",
      head: "HEAD",
      unified: 0,
      excludePatterns: [],
    });

    expect(result).toContain("```diff");
    expect(result).toContain("--- a/a.ts");
    expect(result).toContain("```");
  });

  it("should show excluded patterns when provided", () => {
    const entries = [createDiffEntry("a.ts", "diff")];
    const result = renderMarkdown(entries, {
      mode: "branch",
      base: "main",
      head: "HEAD",
      unified: 0,
      excludePatterns: ["**/*.log", "**/dist/**"],
    });

    expect(result).toContain("**Excluded patterns:** **/*.log, **/dist/**");
  });
});

// ============================================================================
// calculateTotalChars Tests
// ============================================================================

describe("calculateTotalChars", () => {
  it("should sum all diff lengths", () => {
    const entries = [
      createDiffEntry("a.ts", "12345"), // 5
      createDiffEntry("b.ts", "1234567890"), // 10
      createDiffEntry("c.ts", "abc"), // 3
    ];

    expect(calculateTotalChars(entries)).toBe(18);
  });

  it("should return 0 for empty array", () => {
    expect(calculateTotalChars([])).toBe(0);
  });
});
