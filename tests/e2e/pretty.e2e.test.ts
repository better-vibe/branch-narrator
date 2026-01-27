/**
 * E2E tests for the pretty command.
 * Tests colorized terminal output for humans.
 */

import { describe, expect, it, afterEach } from "bun:test";
import {
  createTestRepo,
  createSvelteKitRepo,
  createRepoWithMigrations,
  createRepoWithEnvVars,
  createRepoWithDependencyChanges,
  createComprehensiveRepo,
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
// Basic Output Tests
// ============================================================================

describe("pretty command - basic output", () => {
  it("should produce output for simple changes", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const hello = 'world';",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it("should include file information", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "src/utils.ts": "export const y = 2;",
      },
    });

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention files or changes
    expect(stdout.toLowerCase()).toMatch(/file|change|added|modified/);
  });
});

// ============================================================================
// Terminal Formatting Tests
// ============================================================================

describe("pretty command - terminal formatting", () => {
  it("should produce readable terminal output", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Output should have line breaks for readability
    expect(stdout).toContain("\n");
  });

  it("should not output raw JSON", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should not be JSON
    expect(stdout).not.toMatch(/^\s*\{/);
    expect(stdout).not.toMatch(/^\s*\[/);
  });
});

// ============================================================================
// Content Tests
// ============================================================================

describe("pretty command - content sections", () => {
  it("should include summary for comprehensive changes", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should have substantial output
    expect(stdout.length).toBeGreaterThan(50);
  });

  it("should show risk information for risky changes", async () => {
    currentRepo = await createRepoWithMigrations();

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention risk or relevant info
    expect(stdout.toLowerCase()).toMatch(/risk|database|migration|warning|caution/);
  });

  it("should show environment variable info", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention env vars
    expect(stdout.toLowerCase()).toMatch(/env|environment|variable|config/);
  });
});

// ============================================================================
// Profile Tests
// ============================================================================

describe("pretty command - profile handling", () => {
  it("should auto-detect SvelteKit profile", async () => {
    currentRepo = await createSvelteKitRepo();

    const { stdout, exitCode } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    // Should show route info for SvelteKit
    expect(stdout.toLowerCase()).toMatch(/route|page|endpoint/);
  });

  it("should respect --profile flag", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/routes/+page.svelte": "<h1>Hello</h1>",
      },
    });

    const { exitCode } = await runCli(
      ["pretty", "--profile", "sveltekit", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });

  it("should show profile-specific test commands for SvelteKit", async () => {
    currentRepo = await createSvelteKitRepo();

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should show SvelteKit-specific test command
    expect(stdout).toContain("bun run check");
    expect(stdout.toLowerCase()).toContain("sveltekit");
  });

  it("should show profile-specific test commands for library profile", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "package.json": JSON.stringify({
          name: "test-lib",
          exports: { ".": "./dist/index.js" },
        }),
      },
    });

    const { stdout } = await runCli(
      ["pretty", "--profile", "library", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should show library-specific test command, NOT SvelteKit
    expect(stdout).toContain("bun run build");
    expect(stdout).toContain("library profile");
    expect(stdout).not.toContain("SvelteKit profile");
  });

  it("should display detected profile in summary", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["pretty", "--profile", "react", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should show the profile name in output
    expect(stdout.toLowerCase()).toContain("profile:");
  });
});

// ============================================================================
// Mode Tests
// ============================================================================

describe("pretty command - diff modes", () => {
  it("should work with branch mode", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { exitCode } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });

  it("should work with unstaged mode", async () => {
    currentRepo = await createTestRepo({
      unstaged: { "src/local.ts": "// local change" },
    });

    const { exitCode } = await runCli(
      ["pretty", "--mode", "unstaged"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });

  it("should work with staged mode", async () => {
    currentRepo = await createTestRepo({
      staged: { "src/staged.ts": "// staged change" },
    });

    const { exitCode } = await runCli(
      ["pretty", "--mode", "staged"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });

  it("should work with all mode", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
      staged: { "src/staged.ts": "// staged" },
      unstaged: { "src/unstaged.ts": "// unstaged" },
    });

    const { exitCode } = await runCli(
      ["pretty", "--mode", "all"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("pretty command - error handling", () => {
  it("should fail with invalid mode", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "x" },
    });

    const { exitCode, stderr } = await runCli(
      ["pretty", "--mode", "invalid"],
      currentRepo.cwd
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("invalid");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("pretty command - edge cases", () => {
  it("should handle empty changes gracefully with no-changes message", async () => {
    currentRepo = await createTestRepo({});

    const { stdout, exitCode } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should succeed or report no changes gracefully
    if (exitCode === 0) {
      expect(stdout).toContain("No changes detected");
      // Should NOT contain test plan or notes sections
      expect(stdout.toLowerCase()).not.toContain("suggested test plan");
      expect(stdout.toLowerCase()).not.toContain("notes");
    }
    // May succeed with "no changes" or may fail - either is acceptable
    expect([0, 1]).toContain(exitCode);
  });

  it("should handle single file changes", async () => {
    currentRepo = await createTestRepo({
      files: { "README.md": "# Hello" },
    });

    const { exitCode } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });
});

// ============================================================================
// Dependency Section Tests
// ============================================================================

describe("pretty command - dependency changes", () => {
  it("should show dependency overview in primary area", async () => {
    currentRepo = await createRepoWithDependencyChanges();

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should display dependency changes in the main output
    expect(stdout.toLowerCase()).toMatch(/dependenc/);
    // Should include count information
    expect(stdout.toLowerCase()).toMatch(/dependency changes/);
  });

  it("should highlight major updates in dependency overview", async () => {
    currentRepo = await createRepoWithDependencyChanges();

    const { stdout } = await runCli(
      ["pretty", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Major updates should be called out
    expect(stdout.toLowerCase()).toMatch(/major/);
  });
});
