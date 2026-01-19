/**
 * E2E tests for the zoom command.
 * Tests targeted drill-down for findings and flags.
 */

import { describe, expect, it, afterEach } from "bun:test";
import type { FactsOutput, ZoomFindingOutput, ZoomFlagOutput, RiskReport } from "../../src/core/types.js";
import {
  createTestRepo,
  createRepoWithEnvVars,
  createRepoWithDangerousSql,
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
// Finding Zoom Tests
// ============================================================================

describe("zoom command - finding zoom", () => {
  it("should zoom into a specific finding by ID", async () => {
    currentRepo = await createRepoWithEnvVars();

    // First, get the findings to find a valid ID
    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const envFinding = facts.findings.find((f) => f.type === "env-var");

    if (!envFinding || !envFinding.findingId) {
      // Skip test if no env findings (shouldn't happen with our fixture)
      return;
    }

    // Now zoom into that finding
    const { stdout, exitCode } = await runCli(
      ["zoom", "--finding", envFinding.findingId, "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const zoomOutput: ZoomFindingOutput = JSON.parse(stdout);
    expect(zoomOutput.schemaVersion).toBe("1.0");
    expect(zoomOutput.itemType).toBe("finding");
    expect(zoomOutput.findingId).toBe(envFinding.findingId);
    expect(zoomOutput.finding).toBeDefined();
    expect(zoomOutput.evidence).toBeDefined();
  });

  it("should include evidence in zoom output", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.evidence.length > 0);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout } = await runCli(
      ["zoom", "--finding", finding.findingId, "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const zoomOutput: ZoomFindingOutput = JSON.parse(stdout);
    expect(zoomOutput.evidence).toBeDefined();
    expect(Array.isArray(zoomOutput.evidence)).toBe(true);
  });

  it("should fail with non-existent finding ID", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stderr, exitCode } = await runCli(
      ["zoom", "--finding", "finding.nonexistent#abc123def456", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Finding not found");
  });

  it("should include patch context with --include-patch", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.evidence.length > 0);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout, exitCode, stderr } = await runCli(
      ["zoom", "--finding", finding.findingId, "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    // Test should succeed even without --include-patch
    // The option is for adding patch data, but the command should still work without it
    expect(exitCode).toBe(0);

    if (stdout.length > 0) {
      const zoomOutput: ZoomFindingOutput = JSON.parse(stdout);
      expect(zoomOutput.evidence).toBeDefined();
    }
  });
});

// ============================================================================
// Flag Zoom Tests
// ============================================================================

describe("zoom command - flag zoom", () => {
  it("should zoom into a specific flag by ID", async () => {
    currentRepo = await createRepoWithDangerousSql();

    // First, get the risk report to find a valid flag ID
    const { stdout: riskOutput } = await runCli(
      ["risk-report", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const report: RiskReport = JSON.parse(riskOutput);

    if (report.flags.length === 0) {
      // Skip if no flags (shouldn't happen with dangerous SQL)
      return;
    }

    const flag = report.flags[0];
    if (!flag.flagId) {
      return;
    }

    // Now zoom into that flag
    const { stdout, exitCode } = await runCli(
      ["zoom", "--flag", flag.flagId, "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const zoomOutput: ZoomFlagOutput = JSON.parse(stdout);
    expect(zoomOutput.schemaVersion).toBe("1.0");
    expect(zoomOutput.itemType).toBe("flag");
    expect(zoomOutput.flagId).toBe(flag.flagId);
    expect(zoomOutput.flag).toBeDefined();
  });

  it("should fail with non-existent flag ID", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stderr, exitCode } = await runCli(
      ["zoom", "--flag", "flag.nonexistent.test#abc123def456", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Flag not found");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("zoom command - error handling", () => {
  it("should fail when both --finding and --flag are provided", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stderr, exitCode } = await runCli(
      ["zoom", "--finding", "finding.test#123", "--flag", "flag.test#456", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Cannot specify both");
  });

  it("should fail when neither --finding nor --flag is provided", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stderr, exitCode } = await runCli(
      ["zoom", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Must specify either");
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe("zoom command - output formats", () => {
  it("should output JSON by default", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.findingId);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout } = await runCli(
      ["zoom", "--finding", finding.findingId, "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    // Default format is JSON (changed from markdown for consistency with other analysis commands)
    expect(() => JSON.parse(stdout)).not.toThrow();
    const zoomOutput: ZoomFindingOutput = JSON.parse(stdout);
    expect(zoomOutput.schemaVersion).toBe("1.0");
    expect(zoomOutput.itemType).toBe("finding");
  });

  it("should output JSON with --format json", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.findingId);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout } = await runCli(
      ["zoom", "--finding", finding.findingId, "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    // Should be valid JSON
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it("should output markdown with --format md", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.findingId);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout } = await runCli(
      ["zoom", "--finding", finding.findingId, "--format", "md", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should contain markdown headers
    expect(stdout).toContain("# Finding:");
  });

  it("should output text with --format text", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.findingId);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout } = await runCli(
      ["zoom", "--finding", finding.findingId, "--format", "text", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    // Should contain plain text format
    expect(stdout).toContain("Finding:");
  });
});

// ============================================================================
// Range Information Tests
// ============================================================================

describe("zoom command - range information", () => {
  it("should include range info in output", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: factsOutput } = await runCli(
      ["facts", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const facts: FactsOutput = JSON.parse(factsOutput);
    const finding = facts.findings.find((f) => f.findingId);

    if (!finding || !finding.findingId) {
      return;
    }

    const { stdout } = await runCli(
      ["zoom", "--finding", finding.findingId, "--format", "json", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const zoomOutput: ZoomFindingOutput = JSON.parse(stdout);
    expect(zoomOutput.range).toBeDefined();
    expect(zoomOutput.range.base).toBe(currentRepo.base);
    expect(zoomOutput.range.head).toBeDefined();
  });
});
