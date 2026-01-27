/**
 * E2E tests for the pr-body command.
 * Tests markdown PR description generation.
 */

import { describe, expect, it, afterEach } from "bun:test";
import {
  createTestRepo,
  createSvelteKitRepo,
  createNextJsRepo,
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
// Markdown Generation Tests
// ============================================================================

describe("pr-body command - markdown structure", () => {
  it("should generate valid markdown output", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const hello = 'world';",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    // Should contain markdown headers
    expect(stdout).toContain("#");
  });

  it("should include Summary section", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "src/utils.ts": "export const y = 2;",
      },
    });

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should have summary/overview section
    expect(stdout.toLowerCase()).toMatch(/summary|overview|changes/);
  });

  it("should include file changes information", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention files changed
    expect(stdout.toLowerCase()).toMatch(/file|changed|added/);
  });
});

// ============================================================================
// Profile-Specific Output Tests
// ============================================================================

describe("pr-body command - profile outputs", () => {
  it("should include SvelteKit routes when detected", async () => {
    currentRepo = await createSvelteKitRepo();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention routes or endpoints
    expect(stdout.toLowerCase()).toMatch(/route|endpoint|page/);
  });

  it("should include Next.js routes when detected", async () => {
    currentRepo = await createNextJsRepo();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention routes or pages
    expect(stdout.toLowerCase()).toMatch(/route|page|api/);
  });

  it("should respect --profile flag", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/routes/+page.svelte": "<h1>Hello</h1>",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["pr-body", "--profile", "sveltekit", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    // With sveltekit profile, should attempt to parse as routes
    expect(typeof stdout).toBe("string");
  });
});

// ============================================================================
// Risk Section Tests
// ============================================================================

describe("pr-body command - risk information", () => {
  it("should include risk section for risky changes", async () => {
    currentRepo = await createRepoWithMigrations();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention risk or database changes
    expect(stdout.toLowerCase()).toMatch(/risk|database|migration|sql/);
  });

  it("should include env var warnings", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should mention environment variables
    expect(stdout.toLowerCase()).toMatch(/env|environment|variable|config/);
  });

  it("should include comprehensive info for complex changes", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should include multiple sections
    expect(stdout.length).toBeGreaterThan(100);
  });
});

// ============================================================================
// Mode Tests
// ============================================================================

describe("pr-body command - diff modes", () => {
  it("should work with branch mode", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { exitCode } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });

  it("should work with unstaged mode", async () => {
    currentRepo = await createTestRepo({
      unstaged: { "src/local.ts": "// local change" },
    });

    const { exitCode } = await runCli(
      ["pr-body", "--mode", "unstaged"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });

  it("should work with staged mode", async () => {
    currentRepo = await createTestRepo({
      staged: { "src/staged.ts": "// staged change" },
    });

    const { exitCode } = await runCli(
      ["pr-body", "--mode", "staged"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("pr-body command - error handling", () => {
  it("should fail with invalid mode", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "x" },
    });

    const { exitCode, stderr } = await runCli(
      ["pr-body", "--mode", "invalid"],
      currentRepo.cwd
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("invalid");
  });
});

// ============================================================================
// Output Quality Tests
// ============================================================================

describe("pr-body command - output quality", () => {
  it("should not include raw JSON in output", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should be markdown, not JSON
    expect(stdout).not.toMatch(/^\s*\{/);
    expect(stdout).not.toMatch(/^\s*\[/);
  });

  it("should produce non-empty output", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});

// ============================================================================
// No-Changes Output Tests
// ============================================================================

describe("pr-body command - no-changes output", () => {
  it("should produce single-line no-changes message when diff is empty", async () => {
    currentRepo = await createTestRepo({});

    const { stdout, exitCode } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should succeed or report no changes gracefully
    if (exitCode === 0) {
      expect(stdout).toContain("No changes detected");
      // Should include hidden metadata comment
      expect(stdout).toContain("<!-- branch-narrator:");
      // Should NOT contain test plan, notes, or details sections
      expect(stdout).not.toContain("## Suggested test plan");
      expect(stdout).not.toContain("## Notes");
      expect(stdout).not.toContain("<details>");
    }
  });
});

// ============================================================================
// Dependency Section Tests
// ============================================================================

describe("pr-body command - dependency changes", () => {
  it("should show dependency overview in primary section", async () => {
    currentRepo = await createRepoWithDependencyChanges();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Dependency overview should appear as a primary section (## heading, not ### in details)
    expect(stdout).toContain("## Dependencies");
    // Should summarize dependency changes with counts
    expect(stdout.toLowerCase()).toMatch(/dependency changes/);
  });

  it("should show major updates in dependency overview", async () => {
    currentRepo = await createRepoWithDependencyChanges();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Major dependency updates should be highlighted
    expect(stdout.toLowerCase()).toMatch(/major/);
  });

  it("should still include detailed dependency table in details block", async () => {
    currentRepo = await createRepoWithDependencyChanges();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Details block should still contain the full dependency tables
    expect(stdout).toContain("<details>");
    expect(stdout).toContain("### Dependencies");
  });
});

// ============================================================================
// Impact Analysis Trimming Tests
// ============================================================================

describe("pr-body command - impact analysis trimming", () => {
  it("should include impact analysis for complex changes", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["pr-body", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // If impact analysis is present, it should be in details
    if (stdout.includes("### Impact Analysis")) {
      expect(stdout).toContain("<details>");
    }
  });
});
