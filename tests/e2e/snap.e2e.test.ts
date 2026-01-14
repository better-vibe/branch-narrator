/**
 * E2E tests for the snap command.
 * Tests snapshot save/list/show/diff/restore with real git repositories.
 */

import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import type { SnapshotIndex, SnapshotJson, SnapshotDelta } from "../../src/commands/snap/types.js";

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
  const cwd = await mkdtemp(join(tmpdir(), "snap-e2e-"));

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
// snap save Tests
// ============================================================================

describe("snap save", () => {
  it("should create a snapshot with staged changes", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Stage a new file
    await writeFile(join(cwd, "staged.ts"), "export const staged = true;\n");
    await git(["add", "staged.ts"], cwd);

    // Save snapshot
    const { stdout, exitCode } = await runCli(["snap", "save", "test-staged"], cwd);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^[a-f0-9]{12}$/); // 12 hex chars

    const snapshotId = stdout.trim();

    // Verify snapshot directory exists
    const snapshotDir = join(cwd, ".branch-narrator", "snapshots", snapshotId);
    const dirStat = await stat(snapshotDir);
    expect(dirStat.isDirectory()).toBe(true);

    // Verify snapshot.json exists
    const snapshotJsonPath = join(snapshotDir, "snapshot.json");
    const jsonContent = await readFile(snapshotJsonPath, "utf-8");
    const snapshot: SnapshotJson = JSON.parse(jsonContent);

    expect(snapshot.schemaVersion).toBe("1.0");
    expect(snapshot.snapshotId).toBe(snapshotId);
    expect(snapshot.label).toBe("test-staged");
    expect(snapshot.workspace.patches.staged.bytes).toBeGreaterThan(0);
  });

  it("should create a snapshot with unstaged changes", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Modify an existing file without staging
    await writeFile(join(cwd, "README.md"), "# Modified\n");

    // Save snapshot
    const { stdout, exitCode } = await runCli(["snap", "save", "test-unstaged"], cwd);

    expect(exitCode).toBe(0);
    const snapshotId = stdout.trim();

    // Verify snapshot has unstaged patch
    const snapshotDir = join(cwd, ".branch-narrator", "snapshots", snapshotId);
    const snapshot: SnapshotJson = JSON.parse(
      await readFile(join(snapshotDir, "snapshot.json"), "utf-8")
    );

    expect(snapshot.workspace.patches.unstaged.bytes).toBeGreaterThan(0);
  });

  it("should create a snapshot with untracked files", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create an untracked file
    await writeFile(join(cwd, "untracked.txt"), "This is untracked\n");

    // Save snapshot
    const { stdout, exitCode } = await runCli(["snap", "save", "test-untracked"], cwd);

    expect(exitCode).toBe(0);
    const snapshotId = stdout.trim();

    // Verify snapshot has untracked files
    const snapshotDir = join(cwd, ".branch-narrator", "snapshots", snapshotId);
    const snapshot: SnapshotJson = JSON.parse(
      await readFile(join(snapshotDir, "snapshot.json"), "utf-8")
    );

    expect(snapshot.workspace.untracked.fileCount).toBeGreaterThan(0);

    // Verify blob exists
    const blobsDir = join(snapshotDir, "untracked", "blobs");
    const blobs = await readdir(blobsDir);
    expect(blobs.length).toBeGreaterThan(0);
  });

  it("should embed analysis results", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create some changes
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src/app.ts"), "export const app = true;\n");

    // Save snapshot
    const { stdout, exitCode } = await runCli(["snap", "save"], cwd);

    expect(exitCode).toBe(0);
    const snapshotId = stdout.trim();

    // Verify analysis is embedded
    const snapshotDir = join(cwd, ".branch-narrator", "snapshots", snapshotId);
    const snapshot: SnapshotJson = JSON.parse(
      await readFile(join(snapshotDir, "snapshot.json"), "utf-8")
    );

    expect(snapshot.analysis.facts).toBeDefined();
    expect(snapshot.analysis.facts.schemaVersion).toBeDefined();
    expect(snapshot.analysis.riskReport).toBeDefined();
    expect(snapshot.analysis.riskReport.schemaVersion).toBe("2.0");
  });
});

// ============================================================================
// snap list Tests
// ============================================================================

describe("snap list", () => {
  it("should list all snapshots", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create first snapshot
    await writeFile(join(cwd, "file1.ts"), "export const one = 1;\n");
    await runCli(["snap", "save", "first"], cwd);

    // Create second snapshot
    await writeFile(join(cwd, "file2.ts"), "export const two = 2;\n");
    await runCli(["snap", "save", "second"], cwd);

    // List snapshots
    const { stdout, exitCode } = await runCli(["snap", "list"], cwd);

    expect(exitCode).toBe(0);
    const index: SnapshotIndex = JSON.parse(stdout);

    expect(index.schemaVersion).toBe("1.0");
    expect(index.snapshots.length).toBe(2);

    // Should be sorted by createdAt descending (newest first)
    expect(index.snapshots[0].label).toBe("second");
    expect(index.snapshots[1].label).toBe("first");
  });

  it("should return empty list when no snapshots exist", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    const { stdout, exitCode } = await runCli(["snap", "list"], cwd);

    expect(exitCode).toBe(0);
    const index: SnapshotIndex = JSON.parse(stdout);

    expect(index.snapshots).toEqual([]);
  });

  it("should support --pretty flag", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    await runCli(["snap", "save", "test"], cwd);

    const { stdout } = await runCli(["snap", "list", "--pretty"], cwd);

    // Pretty output should have multiple lines
    expect(stdout.split("\n").length).toBeGreaterThan(1);
  });
});

// ============================================================================
// snap show Tests
// ============================================================================

describe("snap show", () => {
  it("should show snapshot details", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create snapshot
    await writeFile(join(cwd, "test.ts"), "export const test = true;\n");
    const { stdout: saveOutput } = await runCli(["snap", "save", "show-test"], cwd);
    const snapshotId = saveOutput.trim();

    // Show snapshot
    const { stdout, exitCode } = await runCli(["snap", "show", snapshotId], cwd);

    expect(exitCode).toBe(0);
    const snapshot: SnapshotJson = JSON.parse(stdout);

    expect(snapshot.snapshotId).toBe(snapshotId);
    expect(snapshot.label).toBe("show-test");
    expect(snapshot.schemaVersion).toBe("1.0");
  });

  it("should fail for non-existent snapshot", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    const { exitCode, stderr } = await runCli(["snap", "show", "nonexistent"], cwd);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("not found");
  });
});

// ============================================================================
// snap diff Tests
// ============================================================================

describe("snap diff", () => {
  it("should compute delta between two snapshots", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create first snapshot with one file
    await writeFile(join(cwd, "file1.ts"), "export const one = 1;\n");
    const { stdout: id1Output } = await runCli(["snap", "save", "first"], cwd);
    const id1 = id1Output.trim();

    // Reset to clean state
    await git(["checkout", "--", "."], cwd);
    await execa("rm", ["-f", "file1.ts"], { cwd, reject: false });

    // Create second snapshot with different file
    await writeFile(join(cwd, "file2.ts"), "export const two = 2;\n");
    const { stdout: id2Output } = await runCli(["snap", "save", "second"], cwd);
    const id2 = id2Output.trim();

    // Compute diff
    const { stdout, exitCode } = await runCli(["snap", "diff", id1, id2], cwd);

    expect(exitCode).toBe(0);
    const delta: SnapshotDelta = JSON.parse(stdout);

    expect(delta.schemaVersion).toBe("1.0");
    expect(delta.from).toBe(id1);
    expect(delta.to).toBe(id2);
    expect(delta.summary).toBeDefined();
  });

  it("should show risk score delta", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create first snapshot
    await writeFile(join(cwd, "safe.ts"), "export const safe = true;\n");
    const { stdout: id1Output } = await runCli(["snap", "save", "safe"], cwd);
    const id1 = id1Output.trim();

    // Reset
    await git(["checkout", "--", "."], cwd);

    // Create second snapshot with more changes
    await writeFile(join(cwd, "risky.ts"), "const secret = process.env.API_KEY;\n");
    const { stdout: id2Output } = await runCli(["snap", "save", "risky"], cwd);
    const id2 = id2Output.trim();

    // Compute diff
    const { stdout } = await runCli(["snap", "diff", id1, id2], cwd);
    const delta: SnapshotDelta = JSON.parse(stdout);

    expect(delta.delta.riskScore.from).toBeDefined();
    expect(delta.delta.riskScore.to).toBeDefined();
    expect(delta.delta.riskScore.delta).toBeDefined();
  });
});

// ============================================================================
// snap restore Tests
// ============================================================================

describe("snap restore", () => {
  it("should restore workspace to snapshot state", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create a file and snapshot
    await writeFile(join(cwd, "original.ts"), "export const original = true;\n");
    const { stdout: snapshotOutput } = await runCli(["snap", "save", "original-state"], cwd);
    const snapshotId = snapshotOutput.trim();

    // Make different changes
    await execa("rm", ["-f", "original.ts"], { cwd, reject: false });
    await writeFile(join(cwd, "different.ts"), "export const different = true;\n");

    // Restore
    const { exitCode } = await runCli(["snap", "restore", snapshotId], cwd);

    expect(exitCode).toBe(0);

    // Verify original file is back
    const originalContent = await readFile(join(cwd, "original.ts"), "utf-8");
    expect(originalContent).toBe("export const original = true;\n");
  });

  it("should create pre-restore backup", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create initial snapshot
    await writeFile(join(cwd, "first.ts"), "export const first = true;\n");
    const { stdout: snapshotOutput } = await runCli(["snap", "save", "first-state"], cwd);
    const snapshotId = snapshotOutput.trim();

    // Make changes
    await writeFile(join(cwd, "second.ts"), "export const second = true;\n");

    // Count snapshots before restore
    const { stdout: beforeList } = await runCli(["snap", "list"], cwd);
    const beforeIndex: SnapshotIndex = JSON.parse(beforeList);
    const countBefore = beforeIndex.snapshots.length;

    // Restore
    await runCli(["snap", "restore", snapshotId], cwd);

    // Count snapshots after restore (should have +1 for auto backup)
    const { stdout: afterList } = await runCli(["snap", "list"], cwd);
    const afterIndex: SnapshotIndex = JSON.parse(afterList);
    const countAfter = afterIndex.snapshots.length;

    expect(countAfter).toBe(countBefore + 1);

    // Find the auto backup
    const autoBackup = afterIndex.snapshots.find((s) =>
      s.label.startsWith("auto/pre-restore/")
    );
    expect(autoBackup).toBeDefined();
  });

  it("should fail when HEAD has changed", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create snapshot
    await writeFile(join(cwd, "file.ts"), "export const file = true;\n");
    const { stdout: snapshotOutput } = await runCli(["snap", "save", "before-commit"], cwd);
    const snapshotId = snapshotOutput.trim();

    // Make a new commit (changes HEAD)
    await writeFile(join(cwd, "new.ts"), "export const new_ = true;\n");
    await git(["add", "."], cwd);
    await git(["commit", "-m", "New commit"], cwd);

    // Try to restore - should fail
    const { exitCode, stderr } = await runCli(["snap", "restore", snapshotId], cwd);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("HEAD mismatch");
  });

  it("should restore untracked files", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create untracked file and snapshot
    await writeFile(join(cwd, "untracked.txt"), "untracked content\n");
    const { stdout: snapshotOutput } = await runCli(["snap", "save", "with-untracked"], cwd);
    const snapshotId = snapshotOutput.trim();

    // Remove untracked file
    await execa("rm", ["-f", "untracked.txt"], { cwd, reject: false });

    // Verify it's gone
    try {
      await stat(join(cwd, "untracked.txt"));
      throw new Error("File should not exist");
    } catch (e) {
      expect((e as NodeJS.ErrnoException).code).toBe("ENOENT");
    }

    // Restore
    await runCli(["snap", "restore", snapshotId], cwd);

    // Verify untracked file is back
    const content = await readFile(join(cwd, "untracked.txt"), "utf-8");
    expect(content).toBe("untracked content\n");
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe("snapshot determinism", () => {
  it("should generate same snapshotId for identical state", async () => {
    currentRepo = await createTestRepo();
    const { cwd } = currentRepo;

    // Create identical files twice
    await writeFile(join(cwd, "file.ts"), "export const x = 1;\n");

    const { stdout: id1 } = await runCli(["snap", "save", "first"], cwd);

    // Delete the .branch-narrator directory to start fresh
    await execa("rm", ["-rf", ".branch-narrator"], { cwd });

    // Create same file again (should produce same ID)
    const { stdout: id2 } = await runCli(["snap", "save", "second"], cwd);

    expect(id1.trim()).toBe(id2.trim());
  });
});
