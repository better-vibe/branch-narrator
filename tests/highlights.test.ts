/**
 * Highlights builder tests.
 *
 * Tests highlight generation and priority-based ordering.
 */

import { describe, expect, it } from "bun:test";
import { buildHighlights, HIGHLIGHT_PRIORITY } from "../src/commands/facts/highlights.js";
import type {
  Finding,
  ImpactAnalysisFinding,
  LockfileFinding,
  RiskFlagFinding,
  RouteChangeFinding,
  DependencyChangeFinding,
  TypeScriptConfigFinding,
  TestChangeFinding,
  SecurityFileFinding,
  CIWorkflowFinding,
  SQLRiskFinding,
  StencilComponentChangeFinding,
} from "../src/core/types.js";

// ============================================================================
// Helper functions to create minimal findings
// ============================================================================

function createImpactFinding(
  blastRadius: "high" | "medium" | "low",
  file: string
): ImpactAnalysisFinding {
  return {
    type: "impact-analysis",
    kind: "impact-analysis",
    category: "product",
    confidence: "high",
    evidence: [],
    file,
    affectedFiles: [],
    blastRadius,
    dependencyDepth: 1,
  };
}

function createLockfileMismatch(
  manifestChanged: boolean,
  lockfileChanged: boolean
): LockfileFinding {
  return {
    type: "lockfile-mismatch",
    kind: "lockfile-mismatch",
    category: "dependencies",
    confidence: "high",
    evidence: [],
    manifestChanged,
    lockfileChanged,
  };
}

function createHighRiskFlag(): RiskFlagFinding {
  return {
    type: "risk-flag",
    kind: "risk-flag",
    category: "security",
    confidence: "high",
    evidence: [],
    risk: "high",
    riskType: "destructive-sql",
    message: "Destructive SQL detected",
  };
}

function createRouteChange(): RouteChangeFinding {
  return {
    type: "route-change",
    kind: "route-change",
    category: "product",
    confidence: "high",
    evidence: [],
    routeId: "/api/users",
    file: "src/routes/api/users/+server.ts",
    change: "modified",
    routeType: "endpoint",
    methods: ["GET", "POST"],
  };
}

function createMajorDependencyChange(): DependencyChangeFinding {
  return {
    type: "dependency-change",
    kind: "dependency-change",
    category: "dependencies",
    confidence: "high",
    evidence: [],
    name: "svelte",
    section: "dependencies",
    from: "^3.0.0",
    to: "^4.0.0",
    impact: "major",
  };
}

function createTsConfigChange(isBreaking: boolean): TypeScriptConfigFinding {
  return {
    type: "typescript-config",
    kind: "typescript-config",
    category: "config",
    confidence: "high",
    evidence: [],
    file: "tsconfig.json",
    isBreaking,
    changedOptions: {
      added: isBreaking ? ["strict"] : [],
      removed: [],
      modified: [],
    },
    breakingReasons: isBreaking ? ["Added strict option"] : [],
  };
}

function createTestChange(): TestChangeFinding {
  return {
    type: "test-change",
    kind: "test-change",
    category: "tests",
    confidence: "high",
    evidence: [],
    framework: "vitest",
    files: ["tests/utils.test.ts"],
    added: [],
    modified: ["tests/utils.test.ts"],
    deleted: [],
  };
}

function createSecurityFile(): SecurityFileFinding {
  return {
    type: "security-file",
    kind: "security-file",
    category: "security",
    confidence: "high",
    evidence: [],
    file: "src/auth/session.ts",
    securityType: "authentication",
  };
}

function createCIWorkflowSecurity(): CIWorkflowFinding {
  return {
    type: "ci-workflow",
    kind: "ci-workflow",
    category: "ci",
    confidence: "high",
    evidence: [],
    file: ".github/workflows/ci.yml",
    riskType: "permissions_broadened",
    details: "Workflow permissions broadened",
  };
}

function createDestructiveSql(): SQLRiskFinding {
  return {
    type: "sql-risk",
    kind: "sql-risk",
    category: "database",
    confidence: "high",
    evidence: [],
    file: "migrations/001.sql",
    riskType: "destructive",
    statement: "DROP TABLE users;",
  };
}

function createStencilComponent(): StencilComponentChangeFinding {
  return {
    type: "stencil-component-change",
    kind: "stencil-component-change",
    category: "api",
    confidence: "high",
    evidence: [],
    tag: "my-button",
    change: "added",
    file: "src/components/my-button.tsx",
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("buildHighlights", () => {
  describe("lockfile mismatch", () => {
    it("should generate highlight when package.json changed but lockfile not updated", () => {
      const findings: Finding[] = [
        createLockfileMismatch(true, false),
      ];

      const highlights = buildHighlights(findings);

      expect(highlights).toContain(
        "Lockfile mismatch: package.json changed but lockfile not updated"
      );
    });

    it("should generate highlight when lockfile changed but package.json not updated", () => {
      const findings: Finding[] = [
        createLockfileMismatch(false, true),
      ];

      const highlights = buildHighlights(findings);

      expect(highlights).toContain(
        "Lockfile mismatch: lockfile changed but package.json not updated"
      );
    });

    it("should not generate highlight when both changed together", () => {
      const findings: Finding[] = [
        createLockfileMismatch(true, true),
      ];

      const highlights = buildHighlights(findings);

      // No mismatch when both changed
      expect(highlights.some(h => h.includes("Lockfile mismatch"))).toBe(false);
    });
  });

  describe("priority ordering", () => {
    it("should order high blast radius before breaking config", () => {
      const findings: Finding[] = [
        createTsConfigChange(true), // breaking config
        createImpactFinding("high", "src/core.ts"), // high blast radius
      ];

      const highlights = buildHighlights(findings);

      const blastRadiusIdx = highlights.findIndex(h => h.includes("high blast radius"));
      const configIdx = highlights.findIndex(h => h.includes("TypeScript config"));

      expect(blastRadiusIdx).toBeLessThan(configIdx);
    });

    it("should order breaking config before risk warnings", () => {
      const findings: Finding[] = [
        createHighRiskFlag(), // risk warning
        createTsConfigChange(true), // breaking config
      ];

      const highlights = buildHighlights(findings);

      const configIdx = highlights.findIndex(h => h.includes("TypeScript config"));
      const riskIdx = highlights.findIndex(h => h.includes("high-risk condition"));

      expect(configIdx).toBeLessThan(riskIdx);
    });

    it("should order risk warnings before lockfile mismatch", () => {
      const findings: Finding[] = [
        createLockfileMismatch(true, false),
        createHighRiskFlag(),
      ];

      const highlights = buildHighlights(findings);

      const riskIdx = highlights.findIndex(h => h.includes("high-risk condition"));
      const lockfileIdx = highlights.findIndex(h => h.includes("Lockfile mismatch"));

      expect(riskIdx).toBeLessThan(lockfileIdx);
    });

    it("should order lockfile mismatch before route changes", () => {
      const findings: Finding[] = [
        createRouteChange(),
        createLockfileMismatch(true, false),
      ];

      const highlights = buildHighlights(findings);

      const lockfileIdx = highlights.findIndex(h => h.includes("Lockfile mismatch"));
      const routeIdx = highlights.findIndex(h => h.includes("route(s) changed"));

      expect(lockfileIdx).toBeLessThan(routeIdx);
    });

    it("should order route changes before test changes", () => {
      const findings: Finding[] = [
        createTestChange(),
        createRouteChange(),
      ];

      const highlights = buildHighlights(findings);

      const routeIdx = highlights.findIndex(h => h.includes("route(s) changed"));
      const testIdx = highlights.findIndex(h => h.includes("Test files:"));

      expect(routeIdx).toBeLessThan(testIdx);
    });

    it("should apply full impact-first ordering across all categories", () => {
      // Create findings in reverse priority order to test sorting
      const findings: Finding[] = [
        createTestChange(),                   // P50
        createStencilComponent(),             // P60
        createRouteChange(),                  // P70
        createLockfileMismatch(true, false),  // P80
        createHighRiskFlag(),                 // P85
        createTsConfigChange(true),           // P90 (breaking)
        createImpactFinding("medium", "b.ts"), // P95
        createImpactFinding("high", "a.ts"),   // P100
      ];

      const highlights = buildHighlights(findings);

      // Expected order (by priority):
      // 1. high blast radius (P100)
      // 2. medium blast radius (P95)
      // 3. TypeScript config (breaking) (P90)
      // 4. high-risk condition (P85)
      // 5. Lockfile mismatch (P80)
      // 6. route(s) changed (P70)
      // 7. Stencil component (P60)
      // 8. test file(s) modified (P50)

      const indices = {
        highBlast: highlights.findIndex(h => h.includes("high blast radius")),
        mediumBlast: highlights.findIndex(h => h.includes("medium blast radius")),
        tsConfig: highlights.findIndex(h => h.includes("TypeScript config")),
        riskFlag: highlights.findIndex(h => h.includes("high-risk condition")),
        lockfile: highlights.findIndex(h => h.includes("Lockfile mismatch")),
        route: highlights.findIndex(h => h.includes("route(s) changed")),
        stencil: highlights.findIndex(h => h.includes("Stencil component")),
        test: highlights.findIndex(h => h.includes("Test files:")),
      };

      // Verify ordering
      expect(indices.highBlast).toBeLessThan(indices.mediumBlast);
      expect(indices.mediumBlast).toBeLessThan(indices.tsConfig);
      expect(indices.tsConfig).toBeLessThan(indices.riskFlag);
      expect(indices.riskFlag).toBeLessThan(indices.lockfile);
      expect(indices.lockfile).toBeLessThan(indices.route);
      expect(indices.route).toBeLessThan(indices.stencil);
      expect(indices.stencil).toBeLessThan(indices.test);
    });
  });

  describe("stability", () => {
    it("should maintain insertion order for same-priority items", () => {
      // Multiple security-related findings at same priority
      const findings: Finding[] = [
        createSecurityFile(),
        createCIWorkflowSecurity(),
        createDestructiveSql(),
      ];

      const highlights1 = buildHighlights(findings);
      const highlights2 = buildHighlights(findings);

      // Order should be deterministic
      expect(highlights1).toEqual(highlights2);

      // All three should be present
      expect(highlights1.some(h => h.includes("Security-sensitive files"))).toBe(true);
      expect(highlights1.some(h => h.includes("CI workflow security"))).toBe(true);
      expect(highlights1.some(h => h.includes("Destructive SQL"))).toBe(true);
    });

    it("should produce identical output on repeated calls", () => {
      const findings: Finding[] = [
        createRouteChange(),
        createMajorDependencyChange(),
        createTsConfigChange(false),
        createTestChange(),
      ];

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(buildHighlights(findings));
      }

      // All results should be identical
      for (const result of results) {
        expect(result).toEqual(results[0]);
      }
    });
  });

  describe("highlight content", () => {
    it("should show both high and medium blast radius when both present", () => {
      const findings: Finding[] = [
        createImpactFinding("high", "a.ts"),
        createImpactFinding("medium", "b.ts"),
      ];

      const highlights = buildHighlights(findings);

      expect(highlights).toContain("1 file(s) with high blast radius");
      expect(highlights).toContain("1 file(s) with medium blast radius");
    });

    it("should aggregate multiple findings of same type", () => {
      const findings: Finding[] = [
        createRouteChange(),
        { ...createRouteChange(), routeId: "/api/posts" } as RouteChangeFinding,
        { ...createRouteChange(), routeId: "/api/comments" } as RouteChangeFinding,
      ];

      const highlights = buildHighlights(findings);

      expect(highlights).toContain("3 route(s) changed");
    });

    it("should distinguish breaking vs non-breaking config changes", () => {
      const breakingFindings: Finding[] = [createTsConfigChange(true)];
      const nonBreakingFindings: Finding[] = [createTsConfigChange(false)];

      const breakingHighlights = buildHighlights(breakingFindings);
      const nonBreakingHighlights = buildHighlights(nonBreakingFindings);

      expect(breakingHighlights).toContain("TypeScript config changed (breaking)");
      expect(nonBreakingHighlights).toContain("TypeScript config modified");
    });
  });

  describe("fallback behavior", () => {
    it("should return empty array for no findings", () => {
      const highlights = buildHighlights([]);

      expect(highlights).toEqual([]);
    });

    it("should show generic count when no specific highlights match", () => {
      // Create a finding type that doesn't have a specific highlight
      const findings: Finding[] = [
        {
          type: "file-summary",
          kind: "file-summary",
          category: "product",
          confidence: "high",
          evidence: [],
          added: ["a.ts", "b.ts"],
          modified: [],
          deleted: [],
          renamed: [],
        } as Finding,
      ];

      const highlights = buildHighlights(findings);

      expect(highlights).toContain("2 product file(s) changed");
    });
  });

  describe("priority constants", () => {
    it("should export priority constants for testing", () => {
      // Verify priority values follow expected ordering
      expect(HIGHLIGHT_PRIORITY.HIGH_BLAST_RADIUS).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.MEDIUM_BLAST_RADIUS
      );
      expect(HIGHLIGHT_PRIORITY.MEDIUM_BLAST_RADIUS).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.BREAKING_CONFIG
      );
      expect(HIGHLIGHT_PRIORITY.BREAKING_CONFIG).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.HIGH_RISK_FLAGS
      );
      expect(HIGHLIGHT_PRIORITY.HIGH_RISK_FLAGS).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.LOCKFILE_MISMATCH
      );
      expect(HIGHLIGHT_PRIORITY.LOCKFILE_MISMATCH).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.ROUTE_CHANGES
      );
      expect(HIGHLIGHT_PRIORITY.ROUTE_CHANGES).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.TEST_CHANGES
      );
      expect(HIGHLIGHT_PRIORITY.TEST_CHANGES).toBeGreaterThan(
        HIGHLIGHT_PRIORITY.FALLBACK
      );
    });
  });
});
