/**
 * E2E tests for the cache command.
 * Tests cache stats, clear, and prune operations.
 */

import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";

// ============================================================================
// Test Helpers
// ============================================================================

interface TestRepo {
  cwd: string;
  cleanup: () => Promise<void>;
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execa("git", args, { cwd });
  return result.stdout;
}

async function runCli(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cliPath = join(process.cwd(), "src/cli.ts");
  const result = await execa("bun", [cliPath, ...args], {
    cwd,
    reject: false,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
  };
}

async function createTestRepo(): Promise<TestRepo> {
  const cwd = await mkdtemp(join(tmpdir(), "cache-e2e-"));

  // Initialize git repo
  await git(["init", "-b", "main"], cwd);
  await git(["config", "user.name", "Test Bot"], cwd);
  await git(["config", "user.email", "test@example.com"], cwd);

  // Create initial commit
  await writeFile(join(cwd, "README.md"), "# Test Project\n");
  await git(["add", "."], cwd);
  await git(["commit", "-m", "Initial commit"], cwd);

  return {
    cwd,
    cleanup: async () => {
      const { rm } = await import("node:fs/promises");
      await rm(cwd, { recursive: true, force: true }).catch(() => {});
    },
  };
}

let currentRepo: TestRepo | null = null;

afterEach(async () => {
  if (currentRepo) {
    await currentRepo.cleanup();
    currentRepo = null;
  }
});

// ============================================================================
// cache stats Tests
// ============================================================================

describe("cache stats", () => {
  it("should return empty stats for new cache", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    const { stdout, exitCode } = await runCli(["cache", "stats"], cwd);

    expect(exitCode).toBe(0);
    const stats = JSON.parse(stdout);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.location).toBe(join(cwd, ".branch-narrator", "cache"));
    expect(stats.entries).toBe(0);
    expect(stats.sizeBytes).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it("should support --pretty flag", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    const { stdout, exitCode } = await runCli(["cache", "stats", "--pretty"], cwd);

    expect(exitCode).toBe(0);
    // Pretty output should have multiple lines
    expect(stdout.split("\n").length).toBeGreaterThan(1);
    // Should still be valid JSON
    const stats = JSON.parse(stdout);
    expect(stats.location).toBe(join(cwd, ".branch-narrator", "cache"));
    expect(stats.hits).toBe(0);
  });
});

// ============================================================================
// cache clear Tests
// ============================================================================

describe("cache clear", () => {
  it("should clear cache data", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create some cache data first by running facts
    await writeFile(join(cwd, "test.ts"), "export const x = 1;\n");
    await runCli(["facts", "--mode", "unstaged"], cwd);

    // Clear the cache
    const { exitCode, stderr } = await runCli(["cache", "clear"], cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Cache cleared");

    // Verify cache is empty
    const { stdout } = await runCli(["cache", "stats"], cwd);
    const stats = JSON.parse(stdout);
    expect(stats.entries).toBe(0);
  });
});

// ============================================================================
// cache prune Tests
// ============================================================================

describe("cache prune", () => {
  it("should prune old entries", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Run prune with default max-age (should prune nothing since cache is empty)
    const { stdout, exitCode } = await runCli(["cache", "prune"], cwd);

    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.prunedCount).toBe(0);
  });

  it("should support --max-age flag", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    const { stdout, exitCode } = await runCli(["cache", "prune", "--max-age", "7"], cwd);

    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.prunedCount).toBe(0);
  });

  it("should reject invalid max-age", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    const { exitCode, stderr } = await runCli(["cache", "prune", "--max-age", "-1"], cwd);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid max-age");
  });
});

// ============================================================================
// --no-cache Flag Tests
// ============================================================================

describe("--no-cache flag", () => {
  it("should bypass cache when flag is set", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create some changes
    await writeFile(join(cwd, "test.ts"), "export const x = 1;\n");

    // Run facts with --no-cache
    const { exitCode } = await runCli(["--no-cache", "facts", "--mode", "unstaged"], cwd);

    expect(exitCode).toBe(0);

    // Cache should not have any entries (since caching was disabled)
    const { stdout } = await runCli(["cache", "stats"], cwd);
    const stats = JSON.parse(stdout);
    // No entries should be created when --no-cache is used
    expect(stats.entries).toBe(0);
  });
});

// ============================================================================
// --clear-cache Flag Tests
// ============================================================================

describe("--clear-cache flag", () => {
  it("should clear cache before running command", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Run facts first to populate cache
    await writeFile(join(cwd, "test.ts"), "export const x = 1;\n");
    await runCli(["facts", "--mode", "unstaged"], cwd);

    // Run with --clear-cache
    const { exitCode, stderr } = await runCli(["--clear-cache", "cache", "stats"], cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Cache cleared");
  });
});
