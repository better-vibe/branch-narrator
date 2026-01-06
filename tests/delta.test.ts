/**
 * Tests for delta computation utilities.
 */

import { describe, it, expect } from "bun:test";
import {
  diffById,
  normalizeForComparison,
  compareScopeMetadata,
  extractFactsScope,
  extractRiskReportScope,
} from "../src/core/delta.js";
import type {
  Finding,
  RiskFlag,
  FactsOutput,
  RiskReport,
  ScopeMetadata,
} from "../src/core/types.js";

describe("normalizeForComparison", () => {
  it("should remove generatedAt field", () => {
    const obj = {
      schemaVersion: "1.0",
      generatedAt: "2026-01-06T12:00:00.000Z",
      data: { value: 42 },
    };

    const normalized = normalizeForComparison(obj);

    expect(normalized.generatedAt).toBeUndefined();
    expect(normalized.schemaVersion).toBe("1.0");
    expect(normalized.data).toEqual({ value: 42 });
  });
});

describe("diffById", () => {
  it("should detect added items", () => {
    const beforeItems: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "OLD_VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#old123",
      },
    ];

    const afterItems: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "OLD_VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#old123",
      },
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "NEW_VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#new456",
      },
    ];

    const delta = diffById({ beforeItems, afterItems });

    expect(delta.added).toEqual(["finding.env-var#new456"]);
    expect(delta.removed).toEqual([]);
    expect(delta.changed).toEqual([]);
  });

  it("should detect removed items", () => {
    const beforeItems: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "OLD_VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#old123",
      },
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "REMOVED_VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#removed789",
      },
    ];

    const afterItems: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "OLD_VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#old123",
      },
    ];

    const delta = diffById({ beforeItems, afterItems });

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(["finding.env-var#removed789"]);
    expect(delta.changed).toEqual([]);
  });

  it("should detect changed items", () => {
    const beforeItems: Finding[] = [
      {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        name: "express",
        section: "dependencies",
        from: "4.17.0",
        to: "4.18.0",
        impact: "minor",
        findingId: "finding.dependency-change#express123",
      },
    ];

    const afterItems: Finding[] = [
      {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        name: "express",
        section: "dependencies",
        from: "4.17.0",
        to: "5.0.0",
        impact: "major",
        findingId: "finding.dependency-change#express123",
      },
    ];

    const delta = diffById({ beforeItems, afterItems });

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.changed.length).toBe(1);
    expect(delta.changed[0].id).toBe("finding.dependency-change#express123");
    expect((delta.changed[0].before as any).to).toBe("4.18.0");
    expect((delta.changed[0].after as any).to).toBe("5.0.0");
  });

  it("should ignore timestamp changes", () => {
    const beforeItems = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#var123",
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as any[];

    const afterItems = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "VAR",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#var123",
        generatedAt: "2026-01-06T12:00:00.000Z",
      },
    ] as any[];

    const delta = diffById({ beforeItems, afterItems });

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.changed).toEqual([]); // Should be empty because only timestamp differs
  });

  it("should sort results deterministically", () => {
    const beforeItems: RiskFlag[] = [];
    const afterItems: RiskFlag[] = [
      {
        id: "db.migration",
        flagId: "flag.db.migration#zzz",
        category: "db",
        score: 30,
        confidence: 1,
        title: "DB Migration Z",
        summary: "Z migration",
        evidence: [],
        suggestedChecks: [],
        effectiveScore: 30,
      },
      {
        id: "ci.workflow",
        flagId: "flag.ci.workflow#aaa",
        category: "ci",
        score: 20,
        confidence: 1,
        title: "CI Workflow A",
        summary: "A workflow",
        evidence: [],
        suggestedChecks: [],
        effectiveScore: 20,
      },
      {
        id: "deps.major",
        flagId: "flag.deps.major#mmm",
        category: "deps",
        score: 40,
        confidence: 1,
        title: "Major Bump M",
        summary: "M bump",
        evidence: [],
        suggestedChecks: [],
        effectiveScore: 40,
      },
    ];

    const delta = diffById({ beforeItems, afterItems });

    // Should be sorted alphabetically
    expect(delta.added).toEqual([
      "flag.ci.workflow#aaa",
      "flag.db.migration#zzz",
      "flag.deps.major#mmm",
    ]);
  });
});

describe("compareScopeMetadata", () => {
  it("should detect mode mismatch", () => {
    const before: ScopeMetadata = {
      mode: "unstaged",
      base: null,
      head: null,
      profile: "auto",
    };

    const after: ScopeMetadata = {
      mode: "branch",
      base: "main",
      head: "HEAD",
      profile: "auto",
    };

    const warnings = compareScopeMetadata(before, after);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.code === "scope-mismatch")).toBe(true);
    expect(warnings.some(w => w.message.includes("mode"))).toBe(true);
  });

  it("should detect profile mismatch", () => {
    const before: ScopeMetadata = {
      mode: "unstaged",
      base: null,
      head: null,
      profile: "sveltekit",
    };

    const after: ScopeMetadata = {
      mode: "unstaged",
      base: null,
      head: null,
      profile: "auto",
    };

    const warnings = compareScopeMetadata(before, after);

    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain("profile");
  });

  it("should return empty array when scopes match", () => {
    const scope: ScopeMetadata = {
      mode: "unstaged",
      base: null,
      head: null,
      profile: "auto",
      include: [],
      exclude: [],
    };

    const warnings = compareScopeMetadata(scope, scope);

    expect(warnings).toEqual([]);
  });
});

describe("extractFactsScope", () => {
  it("should extract scope metadata from FactsOutput", () => {
    const facts: Partial<FactsOutput> = {
      schemaVersion: "1.0",
      git: {
        base: "main",
        head: "feature",
        range: "main..feature",
        repoRoot: "/repo",
        isDirty: false,
      },
      profile: {
        requested: "auto",
        detected: "sveltekit",
        confidence: "high",
        reasons: ["Detected SvelteKit project"],
      },
      filters: {
        defaultExcludes: [],
        excludes: ["*.log"],
        includes: ["src/**"],
        redact: false,
        maxFileBytes: 1048576,
        maxDiffBytes: 5242880,
      },
    };

    const scope = extractFactsScope(facts as FactsOutput);

    expect(scope.mode).toBe("branch");
    expect(scope.base).toBe("main");
    expect(scope.head).toBe("feature");
    expect(scope.profile).toBe("sveltekit");
    expect(scope.include).toEqual(["src/**"]);
    expect(scope.exclude).toEqual(["*.log"]);
  });
});

describe("extractRiskReportScope", () => {
  it("should extract scope metadata from RiskReport", () => {
    const report: Partial<RiskReport> = {
      schemaVersion: "1.0",
      range: {
        base: "develop",
        head: "feature",
      },
      riskScore: 42,
      riskLevel: "moderate",
      categoryScores: {
        security: 0,
        ci: 0,
        deps: 42,
        db: 0,
        infra: 0,
        api: 0,
        tests: 0,
        churn: 0,
      },
      flags: [],
    };

    const scope = extractRiskReportScope(report as RiskReport);

    expect(scope.mode).toBe("branch");
    expect(scope.base).toBe("develop");
    expect(scope.head).toBe("feature");
    expect(scope.only).toBe(null);
  });
});
