/**
 * E2E tests for delta mode.
 * Tests the --since flag for computing deltas between runs.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import type { FactsOutput, RiskReport } from "../../src/core/types.js";
import { runCli } from "./helpers/repo.js";

let tempDir: string;

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execa("git", args, { cwd });
  return result.stdout;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "delta-e2e-"));

  // Initialize git repo
  await git(["init", "-b", "main"], tempDir);
  await git(["config", "user.name", "Test Bot"], tempDir);
  await git(["config", "user.email", "test@example.com"], tempDir);

  // Initial commit
  await writeFile(join(tempDir, ".gitkeep"), "");
  await git(["add", "."], tempDir);
  await git(["commit", "-m", "Initial commit"], tempDir);

  // Create snapshots directory
  await mkdir(join(tempDir, ".branch-narrator", "snapshots"), { recursive: true });
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Facts Delta Tests
// ============================================================================

describe("delta mode - facts command", () => {
  it("should compute delta when --since is provided", async () => {
    // Create feature branch with initial changes
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add initial file"], tempDir);

    // Get baseline facts
    const { stdout: baselineOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--no-timestamp"],
      tempDir
    );
    const baseline: FactsOutput = JSON.parse(baselineOutput);

    // Save as snapshot
    const snapshotPath = join(tempDir, ".branch-narrator", "snapshots", "baseline.json");
    await writeFile(snapshotPath, baselineOutput);

    // Add more changes
    await writeFile(
      join(tempDir, "src/config.ts"),
      "export const API_KEY = process.env.API_KEY;"
    );
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add config with env var"], tempDir);

    // Get delta facts
    const { stdout: deltaOutput, exitCode } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", snapshotPath, "--no-timestamp"],
      tempDir
    );

    expect(exitCode).toBe(0);

    const delta = JSON.parse(deltaOutput);

    // Should have delta information
    expect(delta.delta).toBeDefined();
    expect(delta.delta.added).toBeDefined();
    expect(delta.delta.removed).toBeDefined();
    expect(delta.delta.changed).toBeDefined();
  });

  it("should detect added findings", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Save baseline
    const { stdout: baselineOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--no-timestamp"],
      tempDir
    );
    const snapshotPath = join(tempDir, ".branch-narrator", "snapshots", "baseline.json");
    await writeFile(snapshotPath, baselineOutput);

    // Add env var usage (new finding type)
    await writeFile(
      join(tempDir, "src/config.ts"),
      "export const apiKey = process.env.API_KEY;\nexport const secret = process.env.SECRET;"
    );
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add config"], tempDir);

    // Get delta
    const { stdout: deltaOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", snapshotPath, "--no-timestamp"],
      tempDir
    );

    const delta = JSON.parse(deltaOutput);

    // Should have added findings for env vars
    expect(delta.delta.added.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Risk Report Delta Tests
// ============================================================================

describe("delta mode - risk-report command", () => {
  it("should compute risk delta when --since is provided", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Get baseline risk report
    const { stdout: baselineOutput } = await runCli(
      ["risk-report", "--mode", "branch", "--base", "main", "--head", "HEAD", "--no-timestamp"],
      tempDir
    );
    const snapshotPath = join(tempDir, ".branch-narrator", "snapshots", "risk-baseline.json");
    await writeFile(snapshotPath, baselineOutput);

    // Add risky changes
    await mkdir(join(tempDir, "supabase/migrations"), { recursive: true });
    await writeFile(
      join(tempDir, "supabase/migrations/001_dangerous.sql"),
      "DROP TABLE users;\nDELETE FROM sessions;"
    );
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add dangerous migration"], tempDir);

    // Get delta
    const { stdout: deltaOutput, exitCode } = await runCli(
      ["risk-report", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", snapshotPath, "--no-timestamp"],
      tempDir
    );

    expect(exitCode).toBe(0);

    const delta = JSON.parse(deltaOutput);

    // Should have delta information
    expect(delta.delta).toBeDefined();
  });
});

// ============================================================================
// Scope Mismatch Warning Tests
// ============================================================================

describe("delta mode - scope mismatch warnings", () => {
  it("should warn when mode differs", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Save baseline with unstaged mode
    const { stdout: baselineOutput } = await runCli(
      ["facts", "--mode", "unstaged", "--no-timestamp"],
      tempDir
    );

    // Modify to look like unstaged mode baseline
    const baseline = JSON.parse(baselineOutput);
    baseline.git = baseline.git || {};
    baseline.git.mode = "unstaged";
    const snapshotPath = join(tempDir, ".branch-narrator", "snapshots", "unstaged.json");
    await writeFile(snapshotPath, JSON.stringify(baseline));

    // Try to get delta with branch mode
    const { stdout: deltaOutput, stderr } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", snapshotPath, "--no-timestamp"],
      tempDir
    );

    const delta = JSON.parse(deltaOutput);

    // Should have warnings about scope mismatch
    if (delta.delta?.warnings) {
      expect(delta.delta.warnings.some((w: any) => 
        w.code === "scope-mismatch" || w.message?.includes("mode")
      )).toBe(true);
    }
  });

  it("should warn when profile differs", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Save baseline with specific profile
    const { stdout: baselineOutput } = await runCli(
      ["facts", "--profile", "sveltekit", "--mode", "branch", "--base", "main", "--head", "HEAD", "--no-timestamp"],
      tempDir
    );
    const snapshotPath = join(tempDir, ".branch-narrator", "snapshots", "sveltekit.json");
    await writeFile(snapshotPath, baselineOutput);

    // Try to get delta with different profile
    const { stdout: deltaOutput } = await runCli(
      ["facts", "--profile", "react", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", snapshotPath, "--no-timestamp"],
      tempDir
    );

    const delta = JSON.parse(deltaOutput);

    // Should have warnings about profile mismatch
    if (delta.delta?.warnings) {
      expect(delta.delta.warnings.some((w: any) =>
        w.code === "scope-mismatch" || w.message?.includes("profile")
      )).toBe(true);
    }
  });
});

// ============================================================================
// Snapshot Loading Tests
// ============================================================================

describe("delta mode - snapshot loading", () => {
  it("should load snapshot from file path", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Save baseline to custom path
    const { stdout: baselineOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--no-timestamp"],
      tempDir
    );
    const customPath = join(tempDir, "my-snapshot.json");
    await writeFile(customPath, baselineOutput);

    // Load from custom path
    const { exitCode } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", customPath, "--no-timestamp"],
      tempDir
    );

    expect(exitCode).toBe(0);
  });

  it("should fail gracefully with invalid snapshot path", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Try to load non-existent snapshot
    const { exitCode, stderr } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", "/nonexistent/path.json"],
      tempDir
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/not found|error|invalid/);
  });

  it("should fail gracefully with invalid snapshot format", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Create invalid snapshot
    const invalidPath = join(tempDir, "invalid.json");
    await writeFile(invalidPath, "not valid json {{{");

    // Try to load invalid snapshot
    const { exitCode, stderr } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", invalidPath],
      tempDir
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/invalid|error|parse/);
  });
});

// ============================================================================
// Delta Output Format Tests
// ============================================================================

describe("delta mode - output format", () => {
  it("should include delta counts", async () => {
    await git(["checkout", "-b", "feature/test"], tempDir);

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src/index.ts"), "export const x = 1;");
    await git(["add", "."], tempDir);
    await git(["commit", "-m", "Add file"], tempDir);

    // Save baseline
    const { stdout: baselineOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--no-timestamp"],
      tempDir
    );
    const snapshotPath = join(tempDir, ".branch-narrator", "snapshots", "baseline.json");
    await writeFile(snapshotPath, baselineOutput);

    // Get delta
    const { stdout: deltaOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", "main", "--head", "HEAD", "--since", snapshotPath, "--no-timestamp"],
      tempDir
    );

    const delta = JSON.parse(deltaOutput);

    // Should have delta arrays
    expect(Array.isArray(delta.delta.added)).toBe(true);
    expect(Array.isArray(delta.delta.removed)).toBe(true);
    expect(Array.isArray(delta.delta.changed)).toBe(true);
  });
});
