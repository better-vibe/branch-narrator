/**
 * E2E tests for the risk-report command.
 * Tests risk scoring and flag generation with real git repositories.
 */

import { describe, expect, it, afterEach } from "bun:test";
import type { RiskReport } from "../../src/core/types.js";
import {
  createTestRepo,
  createRepoWithDangerousSql,
  createRepoWithSecurityFiles,
  createRepoWithCIChanges,
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
// JSON Output Schema Tests
// ============================================================================

describe("risk-report command - JSON output schema", () => {
  it("should produce valid JSON with required fields", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const hello = 'world';",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const output: RiskReport = JSON.parse(stdout);

    expect(output.schemaVersion).toBe("2.0");
    expect(output.range).toBeDefined();
    expect(output.riskScore).toBeDefined();
    expect(output.riskLevel).toBeDefined();
    expect(output.categoryScores).toBeDefined();
    expect(output.flags).toBeDefined();
    expect(output.skippedFiles).toBeDefined();
  });

  it("should include range info", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    expect(output.range.base).toBe(currentRepo.base);
    expect(output.range.head).toBeDefined();
    expect(output.range.mode).toBe("branch");
  });

  it("should omit generatedAt when --no-timestamp is used", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);
    expect(output.generatedAt).toBeUndefined();
  });
});

// ============================================================================
// Risk Score Tests
// ============================================================================

describe("risk-report command - risk scoring", () => {
  it("should produce low risk for simple changes", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/utils.ts": "export function add(a: number, b: number) { return a + b; }",
      },
    });

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    expect(output.riskScore).toBeLessThan(50);
    expect(output.riskLevel).toMatch(/^(low|moderate)$/);
  });

  it("should produce higher risk for dangerous SQL", async () => {
    currentRepo = await createRepoWithDangerousSql();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    // Dangerous SQL should increase risk
    expect(output.riskScore).toBeGreaterThan(0);
    expect(output.categoryScores.db).toBeGreaterThan(0);
  });

  it("should produce higher risk for CI workflow security changes", async () => {
    currentRepo = await createRepoWithCIChanges();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    // CI changes should produce CI or security scores
    // Note: security score is for workflow-specific security issues (permissions, etc.)
    expect(output.categoryScores.ci).toBeGreaterThan(0);
  });

  it("should track CI workflow changes", async () => {
    currentRepo = await createRepoWithCIChanges();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    expect(output.categoryScores.ci).toBeGreaterThan(0);
  });

  it("should track dependency changes", async () => {
    currentRepo = await createRepoWithDependencyChanges();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    expect(output.categoryScores.deps).toBeGreaterThan(0);
  });
});

// ============================================================================
// Risk Flags Tests
// ============================================================================

describe("risk-report command - flags", () => {
  it("should generate flags with required fields", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    if (output.flags.length > 0) {
      const flag = output.flags[0];
      expect(flag.ruleKey).toBeDefined();
      expect(flag.flagId).toBeDefined();
      expect(flag.relatedFindingIds).toBeDefined();
      expect(flag.category).toBeDefined();
      expect(flag.score).toBeDefined();
      expect(flag.confidence).toBeDefined();
      expect(flag.title).toBeDefined();
      expect(flag.summary).toBeDefined();
      expect(flag.evidence).toBeDefined();
      expect(flag.suggestedChecks).toBeDefined();
      expect(flag.effectiveScore).toBeDefined();
    }
  });

  it("should generate database flags for dangerous SQL", async () => {
    currentRepo = await createRepoWithDangerousSql();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    const dbFlags = output.flags.filter(f => f.category === "db");
    expect(dbFlags.length).toBeGreaterThan(0);
  });

  it("should generate flags for CI workflow changes", async () => {
    currentRepo = await createRepoWithCIChanges();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    // CI changes should generate CI pipeline flags
    const ciFlags = output.flags.filter(f => f.category === "ci");
    expect(ciFlags.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Category Filtering Tests
// ============================================================================

describe("risk-report command - category filtering", () => {
  it("should filter by category with --only", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--only", "security"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    // All flags should be security-related
    for (const flag of output.flags) {
      expect(flag.category).toBe("security");
    }
  });

  it("should exclude categories with --exclude", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--exclude", "tests"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    // No flags should be test-related
    const testFlags = output.flags.filter(f => f.category === "tests");
    expect(testFlags.length).toBe(0);
  });
});

// ============================================================================
// Risk Level Thresholds Tests
// ============================================================================

describe("risk-report command - risk levels", () => {
  it("should classify risk levels correctly", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/safe.ts": "export const safe = true;",
      },
    });

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    // Verify level matches score
    if (output.riskScore <= 20) {
      expect(output.riskLevel).toBe("low");
    } else if (output.riskScore <= 40) {
      expect(output.riskLevel).toBe("moderate");
    } else if (output.riskScore <= 60) {
      expect(output.riskLevel).toBe("elevated");
    } else if (output.riskScore <= 80) {
      expect(output.riskLevel).toBe("high");
    } else {
      expect(output.riskLevel).toBe("critical");
    }
  });
});

// ============================================================================
// Score Breakdown Tests
// ============================================================================

describe("risk-report command - score breakdown", () => {
  it("should include score breakdown with --explain-score", async () => {
    currentRepo = await createComprehensiveRepo();

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--explain-score"],
      currentRepo.cwd
    );

    const output: RiskReport = JSON.parse(stdout);

    expect(output.scoreBreakdown).toBeDefined();
    expect(output.scoreBreakdown?.maxCategory).toBeDefined();
    expect(output.scoreBreakdown?.topCategories).toBeDefined();
    expect(output.scoreBreakdown?.formula).toBeDefined();
  });
});

// ============================================================================
// Mode Support Tests
// ============================================================================

describe("risk-report command - mode support", () => {
  it("should support --mode branch", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/feature.ts": "export const feature = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: RiskReport = JSON.parse(stdout);
    expect(output.range.mode).toBe("branch");
  });

  it("should support --mode staged", async () => {
    currentRepo = await createTestRepo({
      staged: {
        "src/staged.ts": "export const staged = true;",
      },
    });

    const { stdout, exitCode } = await runCli(
      ["risk-report", "--mode", "staged", "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    const output: RiskReport = JSON.parse(stdout);
    expect(output.range.mode).toBe("staged");
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe("risk-report command - formatting", () => {
  it("should produce compact JSON by default", async () => {
    currentRepo = await createTestRepo({
      files: {
        "src/index.ts": "export const x = 1;",
      },
    });

    const { stdout } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
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
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp", "--pretty"],
      currentRepo.cwd
    );

    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
  });
});
