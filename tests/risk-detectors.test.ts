/**
 * Findings-to-flags tests for risk-report.
 *
 * Note: legacy `src/commands/risk/detectors/*` have been removed. The canonical
 * behavior is now: findings (with findingId) -> findingsToFlags() -> RiskFlag[].
 */

import { describe, expect, it } from "bun:test";
import { createEvidence } from "../src/core/evidence.js";
import { assignFindingId, buildFlagId } from "../src/core/ids.js";
import { findingsToFlags } from "../src/commands/risk/findings-to-flags.js";
import type {
  APIContractChangeFinding,
  CIWorkflowFinding,
  DbMigrationFinding,
  DependencyChangeFinding,
  InfraChangeFinding,
  LargeDiffFinding,
  LockfileFinding,
  SQLRiskFinding,
  TestChangeFinding,
  TestGapFinding,
  TestParityViolationFinding,
} from "../src/core/types.js";

describe("findingsToFlags", () => {
  it("should convert ci-workflow findings to security/ci flags with deterministic IDs", () => {
    const f1: CIWorkflowFinding = {
      type: "ci-workflow",
      kind: "ci-workflow",
      category: "ci",
      confidence: "high",
      evidence: [createEvidence(".github/workflows/ci.yml", "permissions: contents: write")],
      file: ".github/workflows/ci.yml",
      riskType: "permissions_broadened",
      details: "Workflow has broadened permissions (write access)",
    };

    const fWithId = assignFindingId(f1);
    const flags = findingsToFlags([fWithId]);

    expect(flags).toHaveLength(1);
    expect(flags[0]!.ruleKey).toBe("security.workflow_permissions_broadened");
    expect(flags[0]!.relatedFindingIds).toEqual([fWithId.findingId]);
    expect(flags[0]!.flagId).toBe(buildFlagId(flags[0]!.ruleKey, [fWithId.findingId]));
  });

  it("should convert sql-risk findings to db flags", () => {
    const f1: SQLRiskFinding = {
      type: "sql-risk",
      kind: "sql-risk",
      category: "database",
      confidence: "high",
      evidence: [createEvidence("migrations/001.sql", "DROP TABLE users;")],
      file: "migrations/001.sql",
      riskType: "destructive",
      details: "Contains DROP TABLE/COLUMN or TRUNCATE",
    };

    const fWithId = assignFindingId(f1);
    const flags = findingsToFlags([fWithId]);

    expect(flags).toHaveLength(1);
    expect(flags[0]!.ruleKey).toBe("db.destructive_sql");
    expect(flags[0]!.relatedFindingIds).toEqual([fWithId.findingId]);
  });

  it("should convert infra-change findings to infra flags", () => {
    const f1: InfraChangeFinding = {
      type: "infra-change",
      kind: "infra-change",
      category: "infra",
      confidence: "high",
      evidence: [],
      infraType: "dockerfile",
      files: ["Dockerfile"],
    };

    const fWithId = assignFindingId(f1);
    const flags = findingsToFlags([fWithId]);

    expect(flags).toHaveLength(1);
    expect(flags[0]!.ruleKey).toBe("infra.dockerfile_changed");
    expect(flags[0]!.relatedFindingIds).toEqual([fWithId.findingId]);
  });

  it("should aggregate API contract findings into a single api.contract_changed flag", () => {
    const f1: APIContractChangeFinding = {
      type: "api-contract-change",
      kind: "api-contract-change",
      category: "api",
      confidence: "high",
      evidence: [],
      files: ["openapi.yaml"],
    };
    const f2: APIContractChangeFinding = {
      ...f1,
      files: ["proto/service.proto"],
    };

    const a = assignFindingId(f1);
    const b = assignFindingId(f2);
    const flags = findingsToFlags([a, b]);

    expect(flags).toHaveLength(1);
    expect(flags[0]!.ruleKey).toBe("api.contract_changed");
    expect(flags[0]!.relatedFindingIds.sort()).toEqual([a.findingId, b.findingId].sort());
    expect(flags[0]!.flagId).toBe(buildFlagId("api.contract_changed", [a.findingId, b.findingId]));
  });

  it("should convert dependency-change findings into deps flags and link all related finding IDs", () => {
    const newDep: DependencyChangeFinding = {
      type: "dependency-change",
      kind: "dependency-change",
      category: "dependencies",
      confidence: "high",
      evidence: [createEvidence("package.json", "\"lodash\": \"^4.17.21\"")],
      name: "lodash",
      section: "dependencies",
      to: "^4.17.21",
      impact: "new",
      riskCategory: null,
    };

    const majorBump: DependencyChangeFinding = {
      type: "dependency-change",
      kind: "dependency-change",
      category: "dependencies",
      confidence: "high",
      evidence: [createEvidence("package.json", "\"react\": \"^17\" -> \"^18\"")],
      name: "react",
      section: "dependencies",
      from: "^17.0.0",
      to: "^18.0.0",
      impact: "major",
      riskCategory: null,
    };

    const a = assignFindingId(newDep);
    const b = assignFindingId(majorBump);
    const flags = findingsToFlags([a, b]);

    const newProd = flags.find((f) => f.ruleKey === "deps.new_prod_dependency");
    expect(newProd).toBeDefined();
    expect(newProd!.relatedFindingIds).toEqual([a.findingId]);

    const major = flags.find((f) => f.ruleKey === "deps.major_version_bump");
    expect(major).toBeDefined();
    expect(major!.relatedFindingIds).toEqual([b.findingId]);
  });

  it("should convert db-migration and test-change findings into db/tests flags", () => {
    const mig: DbMigrationFinding = {
      type: "db-migration",
      kind: "db-migration",
      category: "database",
      confidence: "high",
      evidence: [],
      tool: "supabase",
      files: ["supabase/migrations/001.sql"],
      risk: "medium",
      reasons: ["Migration files changed"],
    };

    const testChange: TestChangeFinding = {
      type: "test-change",
      kind: "test-change",
      category: "tests",
      confidence: "high",
      evidence: [],
      framework: "vitest",
      files: ["tests/foo.test.ts"],
    };

    const a = assignFindingId(mig);
    const b = assignFindingId(testChange);
    const flags = findingsToFlags([a, b]);

    expect(flags.find((f) => f.ruleKey === "db.migrations_changed")?.relatedFindingIds).toEqual([a.findingId]);
    expect(flags.find((f) => f.ruleKey === "tests.changed")?.relatedFindingIds).toEqual([b.findingId]);
  });

  it("should convert test-gap and test-parity-violation findings into tests flags", () => {
    const gap: TestGapFinding = {
      type: "test-gap",
      kind: "test-gap",
      category: "quality",
      confidence: "medium",
      evidence: [createEvidence("src/a.ts", "No corresponding test changes")],
      prodFilesChanged: 3,
      testFilesChanged: 0,
    };

    const parity: TestParityViolationFinding = {
      type: "test-parity-violation",
      kind: "test-parity-violation",
      category: "tests",
      confidence: "high",
      evidence: [createEvidence("src/a.ts", "No test file found")],
      sourceFile: "src/a.ts",
      expectedTestLocations: ["tests/a.test.ts"],
    };

    const a = assignFindingId(gap);
    const b = assignFindingId(parity);
    const flags = findingsToFlags([a, b]);

    expect(flags.find((f) => f.ruleKey === "tests.possible_gap")?.relatedFindingIds).toEqual([a.findingId]);
    expect(flags.find((f) => f.ruleKey === "tests.missing_parity")?.relatedFindingIds).toEqual([b.findingId]);
  });

  it("should ensure all emitted flags have ruleKey/flagId and non-empty relatedFindingIds", () => {
    const f1 = assignFindingId({
      type: "large-diff",
      kind: "large-diff",
      category: "unknown",
      confidence: "high",
      evidence: [],
      filesChanged: 60,
      linesChanged: 2000,
    } satisfies LargeDiffFinding);

    const f2 = assignFindingId({
      type: "lockfile-mismatch",
      kind: "lockfile-mismatch",
      category: "dependencies",
      confidence: "high",
      evidence: [],
      manifestChanged: false,
      lockfileChanged: true,
    } satisfies LockfileFinding);

    const flags = findingsToFlags([f1, f2]);
    expect(flags.length).toBeGreaterThan(0);

    for (const flag of flags) {
      expect(typeof flag.ruleKey).toBe("string");
      expect(flag.ruleKey.length).toBeGreaterThan(0);
      expect(typeof flag.flagId).toBe("string");
      expect(flag.flagId).toMatch(/^flag\.[a-z0-9_.-]+#[a-f0-9]{12}$/);
      expect(Array.isArray(flag.relatedFindingIds)).toBe(true);
      expect(flag.relatedFindingIds.length).toBeGreaterThan(0);
      for (const id of flag.relatedFindingIds) {
        expect(id).toMatch(/^finding\.[a-z0-9-]+#[a-f0-9]{12}$/);
      }
    }
  });
});

