/**
 * E2E tests for the integrate command.
 * Tests integration with Cursor and Jules.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "./helpers/repo.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "integrate-e2e-"));
  
  // Initialize as a git repo (required for some operations)
  const { execa } = await import("execa");
  await execa("git", ["init", "-b", "main"], { cwd: tempDir });
  await execa("git", ["config", "user.name", "Test Bot"], { cwd: tempDir });
  await execa("git", ["config", "user.email", "test@example.com"], { cwd: tempDir });
  await writeFile(join(tempDir, ".gitkeep"), "");
  await execa("git", ["add", "."], { cwd: tempDir });
  await execa("git", ["commit", "-m", "Initial commit"], { cwd: tempDir });
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Cursor Integration Tests
// ============================================================================

describe("integrate cursor command", () => {
  it("should create .cursor/rules directory", async () => {
    const { exitCode } = await runCli(["integrate", "cursor"], tempDir);

    expect(exitCode).toBe(0);

    // Check directory exists
    const { stat } = await import("node:fs/promises");
    const dirStat = await stat(join(tempDir, ".cursor", "rules"));
    expect(dirStat.isDirectory()).toBe(true);
  });

  it("should create branch-narrator.md rule file", async () => {
    const { exitCode } = await runCli(["integrate", "cursor"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "utf-8"
    );

    expect(content).toContain("branch-narrator");
    expect(content).toContain("facts");
    expect(content).toContain("risk-report");
  });

  it("should create pr-description.md rule file", async () => {
    const { exitCode } = await runCli(["integrate", "cursor"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(
      join(tempDir, ".cursor", "rules", "pr-description.md"),
      "utf-8"
    );

    expect(content.length).toBeGreaterThan(0);
  });

  it("should use .mdc format when existing .mdc files present", async () => {
    // Create existing .mdc file
    await mkdir(join(tempDir, ".cursor", "rules"), { recursive: true });
    await writeFile(
      join(tempDir, ".cursor", "rules", "existing.mdc"),
      "---\nalwaysApply: true\n---\n# Existing"
    );

    const { exitCode } = await runCli(["integrate", "cursor"], tempDir);

    expect(exitCode).toBe(0);

    // Should create .mdc file
    const content = await readFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.mdc"),
      "utf-8"
    );

    expect(content).toContain("alwaysApply: true");
    expect(content).toContain("branch-narrator");
  });

  it("should include all commands in documentation", async () => {
    await runCli(["integrate", "cursor"], tempDir);

    const content = await readFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "utf-8"
    );

    // All major commands should be documented
    expect(content).toContain("facts");
    expect(content).toContain("risk-report");
    expect(content).toContain("zoom");
    expect(content).toContain("dump-diff");
    expect(content).toContain("snap");
  });
});

// ============================================================================
// Jules Integration Tests
// ============================================================================

describe("integrate jules command", () => {
  it("should create AGENTS.md file", async () => {
    const { exitCode } = await runCli(["integrate", "jules"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("Branch Narrator");
  });

  it("should append to existing AGENTS.md", async () => {
    // Create existing AGENTS.md
    await writeFile(
      join(tempDir, "AGENTS.md"),
      "# Existing Rules\n\nDo not violate physics.\n"
    );

    const { exitCode } = await runCli(["integrate", "jules"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

    // Should preserve existing content
    expect(content).toContain("Existing Rules");
    expect(content).toContain("Do not violate physics");
    // Should add new content
    expect(content).toContain("Branch Narrator");
  });

  it("should include command documentation", async () => {
    await runCli(["integrate", "jules"], tempDir);

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

    // Should document key commands
    expect(content.toLowerCase()).toMatch(/dump-diff|facts|risk/);
  });
});

// ============================================================================
// Claude Integration Tests
// ============================================================================

describe("integrate claude command", () => {
  it("should create CLAUDE.md file", async () => {
    const { exitCode } = await runCli(["integrate", "claude"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Branch Narrator Usage");
  });
});

// ============================================================================
// Jules Rules Integration Tests
// ============================================================================

describe("integrate jules-rules command", () => {
  it("should create .jules/rules/branch-narrator.md", async () => {
    const { exitCode } = await runCli(["integrate", "jules-rules"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(
      join(tempDir, ".jules", "rules", "branch-narrator.md"),
      "utf-8"
    );
    expect(content).toContain("branch-narrator");
  });
});

// ============================================================================
// Opencode Integration Tests
// ============================================================================

describe("integrate opencode command", () => {
  it("should create OPENCODE.md file", async () => {
    const { exitCode } = await runCli(["integrate", "opencode"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(join(tempDir, "OPENCODE.md"), "utf-8");
    expect(content).toContain("Branch Narrator Usage");
  });
});

// ============================================================================
// Auto Detect Integration Tests
// ============================================================================

describe("integrate auto-detect command", () => {
  it("should integrate all detected guides", async () => {
    await mkdir(join(tempDir, ".cursor", "rules"), { recursive: true });
    await mkdir(join(tempDir, ".jules"), { recursive: true });
    await mkdir(join(tempDir, ".opencode"), { recursive: true });
    await writeFile(join(tempDir, "AGENTS.md"), "# Agents\n");
    await writeFile(join(tempDir, "CLAUDE.md"), "# Claude\n");

    const { exitCode, stdout } = await runCli(["integrate"], tempDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Auto-detected guides");

    const cursorRule = await readFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "utf-8"
    );
    const agentsRule = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    const claudeRule = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
    const julesRule = await readFile(
      join(tempDir, ".jules", "rules", "branch-narrator.md"),
      "utf-8"
    );
    const opencodeRule = await readFile(
      join(tempDir, ".opencode", "branch-narrator.md"),
      "utf-8"
    );

    expect(cursorRule).toContain("branch-narrator");
    expect(agentsRule).toContain("Branch Narrator Usage");
    expect(claudeRule).toContain("Branch Narrator Usage");
    expect(julesRule).toContain("branch-narrator");
    expect(opencodeRule).toContain("branch-narrator");
  });
});

// ============================================================================
// Dry Run Tests
// ============================================================================

describe("integrate command - dry run", () => {
  it("should not create files with --dry-run for cursor", async () => {
    const { exitCode, stdout } = await runCli(
      ["integrate", "cursor", "--dry-run"],
      tempDir
    );

    expect(exitCode).toBe(0);

    // Should output what would be created
    expect(stdout.toLowerCase()).toMatch(/would|dry|preview/);

    // Should NOT create the directory
    const { stat } = await import("node:fs/promises");
    await expect(stat(join(tempDir, ".cursor", "rules"))).rejects.toThrow();
  });

  it("should not create files with --dry-run for jules", async () => {
    const { exitCode, stdout } = await runCli(
      ["integrate", "jules", "--dry-run"],
      tempDir
    );

    expect(exitCode).toBe(0);

    // Should output what would be created
    expect(stdout.toLowerCase()).toMatch(/would|dry|preview/);

    // Should NOT create AGENTS.md
    const { stat } = await import("node:fs/promises");
    await expect(stat(join(tempDir, "AGENTS.md"))).rejects.toThrow();
  });
});

// ============================================================================
// Force Option Tests
// ============================================================================

describe("integrate command - force option", () => {
  it("should overwrite existing files with --force for cursor", async () => {
    // Create existing file with different content
    await mkdir(join(tempDir, ".cursor", "rules"), { recursive: true });
    await writeFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "ORIGINAL CONTENT THAT SHOULD BE REPLACED"
    );

    const { exitCode } = await runCli(
      ["integrate", "cursor", "--force"],
      tempDir
    );

    expect(exitCode).toBe(0);

    const content = await readFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "utf-8"
    );

    // Should NOT contain original content
    expect(content).not.toContain("ORIGINAL CONTENT");
    // Should contain new content
    expect(content).toContain("branch-narrator");
  });

  it("should overwrite existing AGENTS.md with --force for jules", async () => {
    // Create existing file
    await writeFile(
      join(tempDir, "AGENTS.md"),
      "ORIGINAL CONTENT THAT SHOULD BE REPLACED"
    );

    const { exitCode } = await runCli(
      ["integrate", "jules", "--force"],
      tempDir
    );

    expect(exitCode).toBe(0);

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

    // Should NOT contain original content
    expect(content).not.toContain("ORIGINAL CONTENT");
    // Should contain new content
    expect(content).toContain("Branch Narrator");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("integrate command - error handling", () => {
  it("should fail with unknown target", async () => {
    const { exitCode, stderr } = await runCli(
      ["integrate", "unknown"],
      tempDir
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/supported|unknown|invalid/);
  });

  it("should list supported targets in error message", async () => {
    const { stderr } = await runCli(["integrate", "invalid"], tempDir);

    expect(stderr.toLowerCase()).toMatch(/cursor|jules/);
  });
});

// ============================================================================
// Append Behavior Tests
// ============================================================================

describe("integrate command - append behavior", () => {
  it("should append to existing cursor rules by default", async () => {
    // Create existing file
    await mkdir(join(tempDir, ".cursor", "rules"), { recursive: true });
    await writeFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "EXISTING CONTENT\n"
    );

    const { exitCode } = await runCli(["integrate", "cursor"], tempDir);

    expect(exitCode).toBe(0);

    const content = await readFile(
      join(tempDir, ".cursor", "rules", "branch-narrator.md"),
      "utf-8"
    );

    // Should contain both
    expect(content).toContain("EXISTING CONTENT");
    expect(content).toContain("branch-narrator");
  });
});
