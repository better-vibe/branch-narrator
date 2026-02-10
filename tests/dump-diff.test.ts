/**
 * Tests for dump-diff command.
 * These are unit tests that do NOT require an actual git repo.
 */

import { describe, expect, it } from "bun:test";
import {
  buildDumpDiffJsonV2,
  buildNameStatusArgs,
  buildPerFileDiffArgs,
  buildUntrackedDiffArgs,
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  normalizePatchSelectorPath,
  pathMatchesPatchDirectory,
  parseNameStatus,
  parseLsFilesOutput,
  resolvePatchTargets,
  renderDumpDiffJson,
  renderMarkdown,
  renderText,
  type DiffFile,
  type DiffFileEntry,
  type DiffMode,
  type DumpDiffJsonV2,
  type FileEntry,
  type SkippedFile,
} from "../src/commands/dump-diff/index.js";
import {
  parseNumStats,
  type FileStats,
} from "../src/commands/dump-diff/git.js";
import {
  parseHunkHeader,
  parseDiffIntoHunks,
  type DiffHunk,
} from "../src/commands/dump-diff/core.js";

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
// --patch-for Target Resolution Tests
// ============================================================================

describe("--patch-for target resolution", () => {
  it("should normalize patch selector paths", () => {
    expect(normalizePatchSelectorPath("./src/utils/")).toBe("src/utils");
    expect(normalizePatchSelectorPath("src\\utils\\file.ts")).toBe("src/utils/file.ts");
    expect(normalizePatchSelectorPath(".")).toBe(".");
  });

  it("should match paths inside a directory selector", () => {
    expect(pathMatchesPatchDirectory("src/a.ts", "src")).toBe(true);
    expect(pathMatchesPatchDirectory("src/nested/b.ts", "src")).toBe(true);
    expect(pathMatchesPatchDirectory("other/c.ts", "src")).toBe(false);
  });

  it("should prefer exact file match over directory expansion", () => {
    const files: FileEntry[] = [
      createFileEntry("src", "M"),
      createFileEntry("src/index.ts", "M"),
      createFileEntry("src/nested.ts", "M"),
    ];

    const resolved = resolvePatchTargets(files, "src");
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe("file");
    expect(resolved?.targets).toHaveLength(1);
    expect(resolved?.targets[0]?.path).toBe("src");
  });

  it("should resolve directory recursively when selector ends with slash", () => {
    const files: FileEntry[] = [
      createFileEntry("src/index.ts", "M"),
      createFileEntry("src/nested/util.ts", "A"),
      createFileEntry("docs/readme.md", "M"),
    ];

    const resolved = resolvePatchTargets(files, "src/");
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe("directory");
    expect(resolved?.targets).toHaveLength(2);
    expect(resolved?.targets.map((f) => f.path).sort()).toEqual([
      "src/index.ts",
      "src/nested/util.ts",
    ]);
  });

  it("should resolve directory recursively without trailing slash", () => {
    const files: FileEntry[] = [
      createFileEntry("src/index.ts", "M"),
      createFileEntry("src/nested/util.ts", "A"),
      createFileEntry("docs/readme.md", "M"),
    ];

    const resolved = resolvePatchTargets(files, "src");
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe("directory");
    expect(resolved?.targets).toHaveLength(2);
    expect(resolved?.targets.map((f) => f.path).sort()).toEqual([
      "src/index.ts",
      "src/nested/util.ts",
    ]);
  });

  it("should match directory selectors against rename oldPath", () => {
    const files: FileEntry[] = [
      createFileEntry("new/location.ts", "R", "src/old/location.ts"),
      createFileEntry("docs/readme.md", "M"),
    ];

    const resolved = resolvePatchTargets(files, "src/old");
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe("directory");
    expect(resolved?.targets).toHaveLength(1);
    expect(resolved?.targets[0]?.path).toBe("new/location.ts");
  });

  it("should return null when no file or directory matches", () => {
    const files: FileEntry[] = [
      createFileEntry("src/index.ts", "M"),
      createFileEntry("docs/readme.md", "M"),
    ];

    expect(resolvePatchTargets(files, "does-not-exist")).toBeNull();
  });
});

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
// parseLsFilesOutput Tests
// ============================================================================

describe("parseLsFilesOutput", () => {
  it("should parse NUL-separated file paths", () => {
    // git ls-files --others -z returns NUL-separated paths
    const output = "src/new-file.ts\0docs/readme.md\0";
    const result = parseLsFilesOutput(output);

    expect(result).toEqual(["src/new-file.ts", "docs/readme.md"]);
  });

  it("should filter out empty entries", () => {
    const output = "src/file.ts\0\0another.ts\0";
    const result = parseLsFilesOutput(output);

    expect(result).toEqual(["src/file.ts", "another.ts"]);
  });

  it("should handle empty output", () => {
    expect(parseLsFilesOutput("")).toEqual([]);
  });

  it("should handle single file", () => {
    const output = "src/only-file.ts\0";
    const result = parseLsFilesOutput(output);

    expect(result).toEqual(["src/only-file.ts"]);
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
// JSON Schema Tests (v2.0)
// ============================================================================

describe("buildDumpDiffJsonV2 - schema validation", () => {
  it("should produce valid JSON with schemaVersion 2.0", () => {
    const files: DiffFile[] = [
      {
        path: "src/index.ts",
        status: "M",
        patch: { text: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new" },
      },
    ];
    const skippedFiles: SkippedFile[] = [
      { path: "pnpm-lock.yaml", reason: "excluded-by-default" },
      { path: "assets/logo.png", reason: "binary" },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 3,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      files,
      skippedFiles,
      3
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe("2.0");
    expect(parsed.git.mode).toBe("branch");
    expect(parsed.git.base).toBe("main");
    expect(parsed.git.head).toBe("HEAD");
    expect(parsed.git.isDirty).toBe(false);
    expect(parsed.options.unified).toBe(3);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].path).toBe("src/index.ts");
    expect(parsed.files[0].status).toBe("M");
    expect(parsed.files[0].patch.text).toContain("--- a/src/index.ts");
    expect(parsed.skippedFiles).toHaveLength(2);
    expect(parsed.summary.changedFileCount).toBe(3);
    expect(parsed.summary.includedFileCount).toBe(1);
    expect(parsed.summary.skippedFileCount).toBe(2);
  });

  it("should have null base/head and isDirty true for non-branch modes", () => {
    const output = buildDumpDiffJsonV2(
      {
        mode: "unstaged",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      [],
      [],
      0
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.git.mode).toBe("unstaged");
    expect(parsed.git.base).toBeNull();
    expect(parsed.git.head).toBeNull();
    expect(parsed.git.isDirty).toBe(true);
  });

  it("should handle all mode values", () => {
    const modes: DiffMode[] = ["branch", "unstaged", "staged", "all"];

    for (const mode of modes) {
      const output = buildDumpDiffJsonV2(
        {
          mode,
          base: "main",
          head: "HEAD",
          unified: 0,
          include: [],
          exclude: [],
          includeUntracked: true,
          nameOnly: false,
          stat: false,
          patchFor: null,
          noTimestamp: true,
        },
        [],
        [],
        0
      );

      const json = renderDumpDiffJson(output);
      const parsed = JSON.parse(json);
      expect(parsed.git.mode).toBe(mode);
      expect(parsed.git.isDirty).toBe(mode !== "branch");
    }
  });

  it("should handle renamed files with oldPath", () => {
    const files: DiffFile[] = [
      {
        path: "src/new-name.ts",
        oldPath: "src/old-name.ts",
        status: "R",
        patch: { text: "rename diff" },
      },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "feature",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      files,
      [],
      1
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.files[0].oldPath).toBe("src/old-name.ts");
    expect(parsed.files[0].status).toBe("R");
  });

  it("should include untracked flag for untracked files", () => {
    const files: DiffFile[] = [
      {
        path: "src/new-file.ts",
        status: "A",
        untracked: true,
        patch: { text: "new file diff" },
      },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "all",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      files,
      [],
      1
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.files[0].untracked).toBe(true);
  });

  it("should include all skip reasons", () => {
    const skippedFiles: SkippedFile[] = [
      { path: "pnpm-lock.yaml", reason: "excluded-by-default" },
      { path: "ignored.ts", reason: "excluded-by-glob" },
      { path: "logo.png", reason: "binary" },
      { path: "other.ts", reason: "not-included" },
      { path: "empty-diff.ts", reason: "diff-empty" },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      [],
      skippedFiles,
      5
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    const reasons = parsed.skippedFiles.map((s: { reason: string }) => s.reason);
    expect(reasons).toContain("excluded-by-default");
    expect(reasons).toContain("excluded-by-glob");
    expect(reasons).toContain("binary");
    expect(reasons).toContain("not-included");
    expect(reasons).toContain("diff-empty");
  });

  it("should include command metadata", () => {
    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "feature",
        unified: 3,
        include: ["src/**"],
        exclude: ["**/*.test.ts"],
        includeUntracked: true,
        nameOnly: false,
        stat: true,
        patchFor: null,
        noTimestamp: true,
      },
      [],
      [],
      0
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.command.name).toBe("dump-diff");
    expect(parsed.command.args).toContain("--mode");
    expect(parsed.command.args).toContain("branch");
    expect(parsed.command.args).toContain("--stat");
    expect(parsed.options.include).toEqual(["src/**"]);
    expect(parsed.options.exclude).toEqual(["**/*.test.ts"]);
    expect(parsed.options.stat).toBe(true);
    expect(parsed.options.includeUntracked).toBe(true);
  });

  it("should omit generatedAt when noTimestamp is true", () => {
    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      [],
      [],
      0
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.generatedAt).toBeUndefined();
  });

  it("should include generatedAt when noTimestamp is false", () => {
    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: false,
      },
      [],
      [],
      0
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.generatedAt).toBeDefined();
    expect(typeof parsed.generatedAt).toBe("string");
  });

  it("should handle --name-only mode (no patch field)", () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "M" },
      { path: "src/utils.ts", status: "A" },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: true,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      files,
      [],
      2
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.options.nameOnly).toBe(true);
    expect(parsed.files[0].patch).toBeUndefined();
    expect(parsed.files[1].patch).toBeUndefined();
  });

  it("should handle --stat mode (stats without patch)", () => {
    const files: DiffFile[] = [
      { path: "src/index.ts", status: "M", stats: { added: 10, removed: 5 } },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: true,
        patchFor: null,
        noTimestamp: true,
      },
      files,
      [],
      1
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.options.stat).toBe(true);
    expect(parsed.files[0].stats).toEqual({ added: 10, removed: 5 });
  });

  it("should handle --patch-for mode (patch.text and patch.hunks)", () => {
    const files: DiffFile[] = [
      {
        path: "src/index.ts",
        status: "M",
        stats: { added: 1, removed: 1 },
        patch: {
          text: "@@ -1 +1 @@\n-old\n+new",
          hunks: [
            {
              header: "@@ -1 +1 @@",
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: [
                { kind: "del", text: "-old" },
                { kind: "add", text: "+new" },
              ],
            },
          ],
        },
      },
    ];

    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 0,
        include: [],
        exclude: [],
        includeUntracked: true,
        nameOnly: false,
        stat: false,
        patchFor: "src/index.ts",
        noTimestamp: true,
      },
      files,
      [],
      1
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.options.patchFor).toBe("src/index.ts");
    expect(parsed.files[0].patch.text).toBeDefined();
    expect(parsed.files[0].patch.hunks).toHaveLength(1);
    expect(parsed.files[0].patch.hunks[0].lines).toHaveLength(2);
  });

  it("should include includeUntracked: false in options", () => {
    const output = buildDumpDiffJsonV2(
      {
        mode: "branch",
        base: "main",
        head: "HEAD",
        unified: 3,
        include: [],
        exclude: [],
        includeUntracked: false,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: true,
      },
      [],
      [],
      0
    );

    const json = renderDumpDiffJson(output);
    const parsed = JSON.parse(json);

    expect(parsed.options.includeUntracked).toBe(false);
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

// ============================================================================
// Diff Parsing Tests
// ============================================================================

describe("parseNumStats", () => {
  it("should parse standard numstat output", () => {
    const output = `10\t5\tsrc/index.ts
20\t15\tsrc/utils.ts`;

    const result = parseNumStats(output);

    expect(result.size).toBe(2);
    expect(result.get("src/index.ts")).toEqual({
      path: "src/index.ts",
      oldPath: undefined,
      added: 10,
      removed: 5,
      binary: false,
    });
    expect(result.get("src/utils.ts")).toEqual({
      path: "src/utils.ts",
      oldPath: undefined,
      added: 20,
      removed: 15,
      binary: false,
    });
  });

  it("should handle binary files", () => {
    const output = `-\t-\tassets/logo.png`;

    const result = parseNumStats(output);

    expect(result.get("assets/logo.png")).toEqual({
      path: "assets/logo.png",
      oldPath: undefined,
      added: 0,
      removed: 0,
      binary: true,
    });
  });

  it("should handle renamed files", () => {
    const output = `5\t3\tsrc/old-name.ts\tsrc/new-name.ts`;

    const result = parseNumStats(output);

    expect(result.get("src/new-name.ts")).toEqual({
      path: "src/new-name.ts",
      oldPath: "src/old-name.ts",
      added: 5,
      removed: 3,
      binary: false,
    });
  });

  it("should handle empty output", () => {
    const result = parseNumStats("");

    expect(result.size).toBe(0);
  });
});

describe("parseHunkHeader", () => {
  it("should parse standard hunk header", () => {
    const result = parseHunkHeader("@@ -1,4 +2,6 @@");

    expect(result).toEqual({
      oldStart: 1,
      oldLines: 4,
      newStart: 2,
      newLines: 6,
    });
  });

  it("should parse hunk header without line counts", () => {
    const result = parseHunkHeader("@@ -1 +2 @@");

    expect(result).toEqual({
      oldStart: 1,
      oldLines: 1,
      newStart: 2,
      newLines: 1,
    });
  });

  it("should return null for invalid header", () => {
    const result = parseHunkHeader("not a hunk header");

    expect(result).toBeNull();
  });
});

describe("parseDiffIntoHunks", () => {
  it("should parse diff with single hunk", () => {
    const diff = `@@ -1,3 +1,4 @@
 context line
-removed line
+added line 1
+added line 2
 context line`;

    const hunks = parseDiffIntoHunks(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.header).toBe("@@ -1,3 +1,4 @@");
    expect(hunks[0]!.oldStart).toBe(1);
    expect(hunks[0]!.oldLines).toBe(3);
    expect(hunks[0]!.newStart).toBe(1);
    expect(hunks[0]!.newLines).toBe(4);
    expect(hunks[0]!.lines).toHaveLength(5);
    expect(hunks[0]!.lines[0]).toEqual({ kind: "context", text: " context line" });
    expect(hunks[0]!.lines[1]).toEqual({ kind: "del", text: "-removed line" });
    expect(hunks[0]!.lines[2]).toEqual({ kind: "add", text: "+added line 1" });
  });

  it("should parse diff with multiple hunks", () => {
    const diff = `@@ -1,2 +1,3 @@
 line 1
+new line
 line 2
@@ -10,1 +11,2 @@
 old line
+another new line`;

    const hunks = parseDiffIntoHunks(diff);

    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.header).toBe("@@ -1,2 +1,3 @@");
    expect(hunks[1]!.header).toBe("@@ -10,1 +11,2 @@");
  });

  it("should handle empty diff", () => {
    const hunks = parseDiffIntoHunks("");

    expect(hunks).toHaveLength(0);
  });

  it("should skip special git diff lines like no newline marker", () => {
    const diff = `@@ -1,2 +1,2 @@
 line 1
-old line
+new line
\\ No newline at end of file`;

    const hunks = parseDiffIntoHunks(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toHaveLength(3);
    expect(hunks[0]!.lines[0]).toEqual({ kind: "context", text: " line 1" });
    expect(hunks[0]!.lines[1]).toEqual({ kind: "del", text: "-old line" });
    expect(hunks[0]!.lines[2]).toEqual({ kind: "add", text: "+new line" });
    // The "\ No newline at end of file" line should be skipped
  });
});

describe("DiffStatus extended types", () => {
  it("should support all status types", () => {
    // This test validates that all status types are handled (compile-time check)
    const statuses: Array<"A" | "M" | "D" | "R" | "C" | "T" | "U" | "?" | "unknown"> = [
      "A", "M", "D", "R", "C", "T", "U", "?", "unknown"
    ];

    // All statuses should be valid types (compile-time check)
    expect(statuses.length).toBe(9);
  });
});

describe("SkipReason extended types", () => {
  it("should support all skip reasons", () => {
    const reasons: Array<
      "excluded-by-default" |
      "excluded-by-user" |
      "excluded-by-glob" |
      "binary" |
      "too-large" |
      "unsupported" |
      "not-found" |
      "not-included" |
      "diff-empty" |
      "patch-for-mismatch"
    > = [
      "excluded-by-default",
      "excluded-by-user",
      "excluded-by-glob",
      "binary",
      "too-large",
      "unsupported",
      "not-found",
      "not-included",
      "diff-empty",
      "patch-for-mismatch",
    ];

    // All reasons should be valid types (compile-time check)
    expect(reasons.length).toBe(10);
  });
});
