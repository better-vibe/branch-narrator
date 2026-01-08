/**
 * E2E tests for the facts command.
 * Tests the complete pipeline: git diff → analyzers → JSON output.
 */

import { describe, expect, it, afterEach } from "bun:test";
import type { FactsOutput } from "../../src/core/types.js";
import {
  createTestRepo,
  createSvelteKitRepo,
  createNextJsRepo,
  createRepoWithEnvVars,
  createRepoWithMigrations,
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
// JSON Output Schema Tests
// ============================================================================

describe("facts command - JSON output schema", () => {
  it("should produce valid JSON with required fields", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const hello = 'world';",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const output: FactsOutput = JSON.parse(stdout);

    // Verify required top-level fields
    expect(output.schemaVersion).toBeDefined();
    expect(output.git).toBeDefined();
    expect(output.profile).toBeDefined();
    expect(output.stats).toBeDefined();
    expect(output.filters).toBeDefined();
    expect(output.summary).toBeDefined();
    expect(output.categories).toBeDefined();
    expect(output.changeset).toBeDefined();
    expect(output.risk).toBeDefined();
    expect(output.findings).toBeDefined();
    expect(output.actions).toBeDefined();
    expect(output.skippedFiles).toBeDefined();
    expect(output.warnings).toBeDefined();
  });

  it("should include git info", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);

    expect(output.git.base).toBe(currentRepo.base);
    expect(output.git.head).toBeDefined();
    expect(output.git.mode).toBe("branch");
    expect(output.git.isDirty).toBe(false);
  });

  it("should omit generatedAt when --no-timestamp is used", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    expect(output.generatedAt).toBeUndefined();
  });

  it("should include generatedAt when --no-timestamp is not used", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    expect(output.generatedAt).toBeDefined();
    expect(output.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// Mode Support Tests
// ============================================================================

describe("facts command - mode support", () => {
  it("should support --mode branch", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/feature.ts": "export const feature = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: FactsOutput = JSON.parse(stdout);
    expect(output.git.mode).toBe("branch");
    expect(output.git.isDirty).toBe(false);
  });

  it("should support --mode staged", async () => {
    currentRepo = await createTestRepo({
      staged: {
        "src/staged.ts": "export const staged = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["facts", "--mode", "staged", "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: FactsOutput = JSON.parse(stdout);
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
      ["facts", "--mode", "unstaged", "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: FactsOutput = JSON.parse(stdout);
    expect(output.git.mode).toBe("unstaged");
  });
});

// ============================================================================
// Changeset Structure Tests
// ============================================================================

describe("facts command - changeset structure", () => {
  it("should include files grouped by status", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/new-file.ts": "export const x = 1;",
        "src/another.ts": "export const y = 2;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);

    expect(output.changeset.files).toBeDefined();
    expect(output.changeset.files.added).toContain("src/new-file.ts");
    expect(output.changeset.files.added).toContain("src/another.ts");
  });

  it("should include category breakdown", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
        "tests/index.test.ts": "test('x', () => {});",
        "docs/README.md": "# Docs",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);

    expect(output.changeset.byCategory).toBeDefined();
    expect(output.changeset.categorySummary.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Profile Detection Tests
// ============================================================================

describe("facts command - profile detection", () => {
  it("should detect SvelteKit profile", async () => {
    currentRepo = await createSvelteKitRepo();

    const { stdout, exitCode } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: FactsOutput = JSON.parse(stdout);

    expect(output.profile.detected).toBe("sveltekit");
    expect(output.profile.confidence).toBe("high");
    expect(output.profile.reasons.some(r => r.includes("@sveltejs/kit"))).toBe(true);
  });

  it("should detect Next.js profile", async () => {
    currentRepo = await createNextJsRepo();

    const { stdout, exitCode } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: FactsOutput = JSON.parse(stdout);

    expect(output.profile.detected).toBe("next");
    expect(output.profile.reasons.some(r => r.includes("next"))).toBe(true);
  });

  it("should allow forcing profile with --profile", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--profile", "sveltekit", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    expect(output.profile.requested).toBe("sveltekit");
  });
});

// ============================================================================
// Finding Generation Tests
// ============================================================================

describe("facts command - findings", () => {
  it("should detect route changes in SvelteKit", async () => {
    currentRepo = await createSvelteKitRepo();

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    const routeFindings = output.findings.filter(f => f.type === "route-change");

    expect(routeFindings.length).toBeGreaterThan(0);
    // Should detect the page and API routes
    const routeIds = routeFindings.map((f: any) => f.routeId);
    expect(routeIds).toContain("/");
    expect(routeIds).toContain("/about");
  });

  it("should detect route changes in Next.js", async () => {
    currentRepo = await createNextJsRepo();

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    const routeFindings = output.findings.filter(f => f.type === "route-change");

    expect(routeFindings.length).toBeGreaterThan(0);
    const routeIds = routeFindings.map((f: any) => f.routeId);
    expect(routeIds).toContain("/");
    expect(routeIds).toContain("/dashboard");
  });

  it("should detect environment variables", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    const envFindings = output.findings.filter(f => f.type === "env-var");

    expect(envFindings.length).toBeGreaterThan(0);
    const envNames = envFindings.map((f: any) => f.name);
    expect(envNames).toContain("API_URL");
    expect(envNames).toContain("AUTH_SECRET");
  });

  it("should detect database migrations", async () => {
    currentRepo = await createRepoWithMigrations();

    // Force SvelteKit profile which includes supabase analyzer
    const { stdout } = await runCli(
      ["facts", "--profile", "sveltekit", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);
    const migrationFindings = output.findings.filter(f => f.type === "db-migration");

    expect(migrationFindings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Risk Score Tests
// ============================================================================

describe("facts command - risk scoring", () => {
  it("should compute risk score", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);

    expect(output.risk).toBeDefined();
    expect(output.risk.score).toBeGreaterThanOrEqual(0);
    expect(output.risk.score).toBeLessThanOrEqual(100);
    expect(output.risk.level).toMatch(/^(low|medium|high)$/);
    expect(output.risk.factors).toBeDefined();
  });

  it("should generate actions", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);

    expect(output.actions).toBeDefined();
    expect(output.actions.length).toBeGreaterThan(0);

    // Each action should have required fields
    for (const action of output.actions) {
      expect(action.id).toBeDefined();
      expect(action.category).toBeDefined();
      expect(action.blocking).toBeDefined();
      expect(action.reason).toBeDefined();
      expect(action.triggers).toBeDefined();
    }
  });
});

// ============================================================================
// Stats Tests
// ============================================================================

describe("facts command - stats", () => {
  it("should report correct file counts", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/a.ts": "export const a = 1;",
        "src/b.ts": "export const b = 2;",
        "src/c.ts": "export const c = 3;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: FactsOutput = JSON.parse(stdout);

    expect(output.stats.filesChanged).toBe(3);
    expect(output.stats.insertions).toBeGreaterThan(0);
  });
});

// ============================================================================
// Pretty Print Tests
// ============================================================================

describe("facts command - formatting", () => {
  it("should produce compact JSON by default", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    // Compact JSON should not have newlines in the middle
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
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--pretty"],
      currentRepo.cwd
    );

    // Pretty JSON should have multiple lines
    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
  });
});
