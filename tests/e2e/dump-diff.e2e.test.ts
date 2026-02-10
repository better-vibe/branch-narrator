/**
 * E2E tests for the dump-diff command.
 * Tests diff output in various formats with real git repositories.
 */

import { join } from "node:path";
import { describe, expect, it, afterEach } from "bun:test";
import {
  createTestRepo,
  runCli,
  type TestRepo,
} from "./helpers/repo.js";

let currentRepo: TestRepo | null = null;

afterEach(async () => {
  if (currentRepo) {
    await currentRepo.cleanup();
    currentRepo = null;
  }
});

// ============================================================================
// JSON Format Tests
// ============================================================================

describe("dump-diff command - JSON format", () => {
  it("should produce valid JSON with schemaVersion 2.0", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const hello = 'world';",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);

    expect(output.schemaVersion).toBe("2.0");
    expect(output.git).toBeDefined();
    expect(output.files).toBeDefined();
    expect(output.skippedFiles).toBeDefined();
    expect(output.summary).toBeDefined();
  });

  it("should include git metadata", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    expect(output.git.mode).toBe("branch");
    expect(output.git.base).toBe(currentRepo.base);
    expect(output.git.head).toBeDefined();
    expect(output.git.isDirty).toBe(false);
  });

  it("should include file information", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/a.ts": "export const a = 1;",
        "src/b.ts": "export const b = 2;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    expect(output.files.length).toBe(2);

    for (const file of output.files) {
      expect(file.path).toBeDefined();
      expect(file.status).toBeDefined();
    }
  });

  it("should include patch content by default", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 42;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    expect(output.files[0].patch).toBeDefined();
    expect(output.files[0].patch.text).toContain("export const x = 42");
  });

  it("should omit patch with --name-only", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--name-only"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    expect(output.files[0].patch).toBeUndefined();
    expect(output.files[0].path).toBeDefined();
  });

  it("should include stats with --stat", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;\nexport const y = 2;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--stat"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    expect(output.files[0].stats).toBeDefined();
    expect(output.files[0].stats.added).toBeGreaterThan(0);
  });

  it("should resolve --patch-for from repo root when run in subdir", async () => {
    currentRepo = await createTestRepo({
      files: {
        "docs/05-cli/examples.md": "Example docs content",
      },
    });

    const { stdout, exitCode } = await runCli(
      [
        "dump-diff",
        "--format",
        "json",
        "--mode",
        "branch",
        "--base",
        currentRepo.base,
        "--head",
        currentRepo.head,
        "--no-timestamp",
        "--patch-for",
        "docs/05-cli/examples.md",
      ],
      join(currentRepo.cwd, "docs")
    );

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);

    expect(output.files).toHaveLength(1);
    expect(output.files[0].path).toBe("docs/05-cli/examples.md");
    expect(output.files[0].patch?.text).toContain("docs/05-cli/examples.md");
  });

  it("should support --patch-for with a folder path", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const index = true;",
        "src/nested/util.ts": "export const util = 1;",
        "docs/readme.md": "# docs",
      },
    });

    const { stdout, exitCode } = await runCli(
      [
        "dump-diff",
        "--format",
        "json",
        "--mode",
        "branch",
        "--base",
        currentRepo.base,
        "--head",
        currentRepo.head,
        "--no-timestamp",
        "--patch-for",
        "src",
      ],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const paths = output.files.map((f: any) => f.path).sort();
    expect(paths).toEqual(["src/index.ts", "src/nested/util.ts"]);
    expect(output.options.patchFor).toBe("src");
  });

  it("should support --patch-for folder path from subdirectory", async () => {
    currentRepo = await createTestRepo({
      files: {
        "docs/05-cli/examples.md": "Examples docs content",
        "docs/05-cli/options.md": "Options docs content",
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout, exitCode } = await runCli(
      [
        "dump-diff",
        "--format",
        "json",
        "--mode",
        "branch",
        "--base",
        currentRepo.base,
        "--head",
        currentRepo.head,
        "--no-timestamp",
        "--patch-for",
        "docs/05-cli/",
      ],
      join(currentRepo.cwd, "docs")
    );

    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout);
    const paths = output.files.map((f: any) => f.path).sort();
    expect(paths).toEqual(["docs/05-cli/examples.md", "docs/05-cli/options.md"]);
  });
});

// ============================================================================
// Text Format Tests
// ============================================================================

describe("dump-diff command - text format", () => {
  it("should produce raw diff output", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const hello = 'world';",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "text", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("diff --git");
    expect(stdout).toContain("src/index.ts");
  });
});

// ============================================================================
// Markdown Format Tests
// ============================================================================

describe("dump-diff command - markdown format", () => {
  it("should produce markdown with header", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "md", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("# Diff");
    expect(stdout).toContain("```diff");
    expect(stdout).toContain("```");
  });

  it("should list changed files", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/a.ts": "export const a = 1;",
        "src/b.ts": "export const b = 2;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "md", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(stdout).toContain("src/a.ts");
    expect(stdout).toContain("src/b.ts");
  });
});

// ============================================================================
// Mode Support Tests
// ============================================================================

describe("dump-diff command - mode support", () => {
  it("should support --mode branch", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/feature.ts": "export const feature = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.git.mode).toBe("branch");
  });

  it("should support --mode staged", async () => {
    currentRepo = await createTestRepo({
      staged: {
        "src/staged.ts": "export const staged = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "staged", "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.git.mode).toBe("staged");
    expect(output.git.isDirty).toBe(true);
  });

  it("should support --mode unstaged", async () => {
    currentRepo = await createTestRepo({
      unstaged: {
        "src/unstaged.ts": "export const unstaged = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "unstaged", "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.git.mode).toBe("unstaged");
  });

  it("should support --mode all", async () => {
    currentRepo = await createTestRepo({
      staged: {
        "src/staged.ts": "export const staged = true;",
      },
      unstaged: {
        "src/unstaged.ts": "export const unstaged = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "all", "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout);
    expect(output.git.mode).toBe("all");
  });
});

// ============================================================================
// Include/Exclude Filter Tests
// ============================================================================

describe("dump-diff command - filtering", () => {
  it("should filter by --include", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "lib/utils.ts": "export const y = 2;",
        "docs/README.md": "# Docs",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--include", "src/**"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    // Should only include src/ files
    const paths = output.files.map((f: any) => f.path);
    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain("lib/utils.ts");
    expect(paths).not.toContain("docs/README.md");
  });

  it("should filter by --exclude", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "src/generated/auto.ts": "// auto-generated",
        "docs/README.md": "# Docs",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--exclude", "**/generated/**"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    // Should exclude generated files
    const includedPaths = output.files.map((f: any) => f.path);
    expect(includedPaths).not.toContain("src/generated/auto.ts");
  });

  it("should skip lockfiles by default", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "package-lock.json": "{}",
        "bun.lock": "lockfile content",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    // Lockfiles should be in skippedFiles, not files
    const includedPaths = output.files.map((f: any) => f.path);
    expect(includedPaths).not.toContain("package-lock.json");
    expect(includedPaths).not.toContain("bun.lock");

    const skippedPaths = output.skippedFiles.map((f: any) => f.path);
    expect(skippedPaths.some((p: string) => p.includes("lock"))).toBe(true);
  });
});

// ============================================================================
// Summary Tests
// ============================================================================

describe("dump-diff command - summary", () => {
  it("should include accurate file counts", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/a.ts": "export const a = 1;",
        "src/b.ts": "export const b = 2;",
        "src/c.ts": "export const c = 3;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    expect(output.summary.changedFileCount).toBe(3);
    expect(output.summary.includedFileCount).toBe(3);
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe("dump-diff command - JSON formatting", () => {
  it("should produce compact JSON by default", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const lines = stdout.trim().split("\n");
    expect(lines.length).toBe(1);
  });

  it("should produce indented JSON with --pretty", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--pretty"],
      currentRepo.cwd
    );

    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
  });
});

// ============================================================================
// Untracked Files Tests
// ============================================================================

describe("dump-diff command - untracked files", () => {
  it("should include untracked files in unstaged mode", async () => {
    currentRepo = await createTestRepo({
      unstaged: {
        "src/new-untracked.ts": "export const untracked = true;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "unstaged", "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    const paths = output.files.map((f: any) => f.path);
    expect(paths).toContain("src/new-untracked.ts");
  });

  it("should mark untracked files with untracked flag", async () => {
    currentRepo = await createTestRepo({
      unstaged: {
        "src/untracked.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "unstaged", "--no-timestamp"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    const untrackedFile = output.files.find((f: any) => f.path === "src/untracked.ts");
    expect(untrackedFile).toBeDefined();
    expect(untrackedFile.untracked).toBe(true);
  });

  it("should exclude untracked files with --no-untracked", async () => {
    currentRepo = await createTestRepo({
      unstaged: {
        "src/untracked.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["dump-diff", "--format", "json", "--mode", "unstaged", "--no-timestamp", "--no-untracked"],
      currentRepo.cwd
    );

    const output = JSON.parse(stdout);

    const paths = output.files.map((f: any) => f.path);
    expect(paths).not.toContain("src/untracked.ts");
  });
});
