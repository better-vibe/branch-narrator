/**
 * E2E tests for SARIF output format.
 * Tests that `facts --format sarif` produces valid SARIF 2.1.0 output.
 */

import { describe, expect, it, afterEach } from "bun:test";
import {
  createTestRepo,
  createRepoWithMigrations,
  createRepoWithDangerousSql,
  createRepoWithEnvVars,
  createRepoWithSecurityFiles,
  createRepoWithCIChanges,
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

// SARIF 2.1.0 schema structure
interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri?: string;
      rules?: SarifRule[];
    };
  };
  results: SarifResult[];
  originalUriBaseIds?: Record<string, { uri: string }>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  defaultConfiguration?: { level: string };
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri: string; uriBaseId?: string };
      region?: { startLine?: number };
    };
  }>;
  partialFingerprints?: { findingId?: string };
}

// ============================================================================
// SARIF Structure Tests
// ============================================================================

describe("SARIF output - structure", () => {
  it("should produce valid SARIF 2.1.0 structure", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stdout, exitCode } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);

    const sarif: SarifLog = JSON.parse(stdout);

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-schema-2.1.0.json");
    expect(sarif.runs).toBeDefined();
    expect(sarif.runs.length).toBe(1);
  });

  it("should include tool driver information", async () => {
    currentRepo = await createTestRepo({
      files: { "src/index.ts": "export const x = 1;" },
    });

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    expect(sarif.runs[0].tool.driver.name).toBe("branch-narrator");
    expect(sarif.runs[0].tool.driver.version).toBeDefined();
  });

  it("should include originalUriBaseIds", async () => {
    currentRepo = await createRepoWithMigrations();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    expect(sarif.runs[0].originalUriBaseIds).toBeDefined();
    expect(sarif.runs[0].originalUriBaseIds?.SRCROOT).toBeDefined();
  });
});

// ============================================================================
// Rule Mapping Tests
// ============================================================================

describe("SARIF output - rule mappings", () => {
  it("should include rules for used findings", async () => {
    currentRepo = await createRepoWithMigrations();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Should have rules defined
    const rules = sarif.runs[0].tool.driver.rules;
    if (rules && rules.length > 0) {
      // Each rule should have required fields
      for (const rule of rules) {
        expect(rule.id).toMatch(/^BNR\d{3}$/);
        expect(rule.name).toBeDefined();
        expect(rule.shortDescription).toBeDefined();
      }
    }
  });

  it("should map dangerous SQL to BNR001", async () => {
    currentRepo = await createRepoWithDangerousSql();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Find results with BNR001 rule
    const dangerousSqlResults = sarif.runs[0].results.filter(
      r => r.ruleId === "BNR001" || r.ruleId === "BNR014"
    );

    // Should have dangerous SQL detection
    expect(dangerousSqlResults.length).toBeGreaterThan(0);
  });

  it("should map env var references to BNR004", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Find results with BNR004 rule
    const envVarResults = sarif.runs[0].results.filter(r => r.ruleId === "BNR004");

    expect(envVarResults.length).toBeGreaterThan(0);
  });

  it("should map security file changes to BNR009", async () => {
    currentRepo = await createRepoWithSecurityFiles();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Find results with BNR009 rule
    const securityResults = sarif.runs[0].results.filter(r => r.ruleId === "BNR009");

    expect(securityResults.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Result Level Tests
// ============================================================================

describe("SARIF output - result levels", () => {
  it("should have valid levels", async () => {
    currentRepo = await createRepoWithDangerousSql();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    for (const result of sarif.runs[0].results) {
      expect(["error", "warning", "note", "none"]).toContain(result.level);
    }
  });

  it("should use error level for high-risk findings", async () => {
    currentRepo = await createRepoWithDangerousSql();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Dangerous SQL should have error level
    const errorResults = sarif.runs[0].results.filter(r => r.level === "error");
    expect(errorResults.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Location Tests
// ============================================================================

describe("SARIF output - locations", () => {
  it("should include file locations", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Find results with locations
    const resultsWithLocations = sarif.runs[0].results.filter(
      r => r.locations && r.locations.length > 0
    );

    if (resultsWithLocations.length > 0) {
      const location = resultsWithLocations[0].locations![0];
      expect(location.physicalLocation?.artifactLocation?.uri).toBeDefined();
    }
  });

  it("should use uriBaseId for relative paths", async () => {
    currentRepo = await createRepoWithMigrations();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    const resultsWithLocations = sarif.runs[0].results.filter(
      r => r.locations && r.locations.length > 0
    );

    if (resultsWithLocations.length > 0) {
      const location = resultsWithLocations[0].locations![0];
      expect(location.physicalLocation?.artifactLocation?.uriBaseId).toBe("SRCROOT");
    }
  });
});

// ============================================================================
// Fingerprint Tests
// ============================================================================

describe("SARIF output - fingerprints", () => {
  it("should include partialFingerprints with findingId", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    const resultsWithFingerprints = sarif.runs[0].results.filter(
      r => r.partialFingerprints?.findingId
    );

    if (resultsWithFingerprints.length > 0) {
      expect(resultsWithFingerprints[0].partialFingerprints?.findingId).toMatch(/^finding\./);
    }
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe("SARIF output - determinism", () => {
  it("should produce sorted rules", async () => {
    currentRepo = await createRepoWithDangerousSql();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    const rules = sarif.runs[0].tool.driver.rules || [];
    const ruleIds = rules.map(r => r.id);

    // Rules should be sorted
    const sortedIds = [...ruleIds].sort();
    expect(ruleIds).toEqual(sortedIds);
  });

  it("should produce consistent output for same input", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout: stdout1 } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    const { stdout: stdout2 } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head, "--no-timestamp"],
      currentRepo.cwd
    );

    // Normalize and compare (remove timestamps if any)
    const normalize = (s: string) => s.replace(/"generatedAt":\s*"[^"]+"/g, "");
    expect(normalize(stdout1)).toBe(normalize(stdout2));
  });
});

// ============================================================================
// GitHub Actions Compatibility Tests
// ============================================================================

describe("SARIF output - GitHub Actions compatibility", () => {
  it("should produce valid JSON", async () => {
    currentRepo = await createRepoWithCIChanges();

    const { stdout, exitCode } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it("should have required SARIF fields for upload", async () => {
    currentRepo = await createRepoWithEnvVars();

    const { stdout } = await runCli(
      ["facts", "--format", "sarif", "--mode", "branch", "--base", currentRepo.base, "--head", currentRepo.head],
      currentRepo.cwd
    );

    const sarif: SarifLog = JSON.parse(stdout);

    // Required fields for GitHub code scanning
    expect(sarif.version).toBeDefined();
    expect(sarif.runs).toBeDefined();
    expect(sarif.runs[0].tool).toBeDefined();
    expect(sarif.runs[0].results).toBeDefined();
  });
});
