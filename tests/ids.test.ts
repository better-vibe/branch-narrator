/**
 * Tests for stable ID generation.
 */

import { describe, expect, it } from "bun:test";
import {
  normalizePath,
  stableHash,
  buildFindingId,
  buildFlagId,
  assignFindingId,
  assignFlagId,
} from "../src/core/ids.js";
import type { EnvVarFinding, DependencyChangeFinding, RouteChangeFinding } from "../src/core/types.js";

describe("normalizePath", () => {
  it("should convert backslashes to forward slashes", () => {
    expect(normalizePath("src\\routes\\page.ts")).toBe("src/routes/page.ts");
  });

  it("should preserve forward slashes", () => {
    expect(normalizePath("src/routes/page.ts")).toBe("src/routes/page.ts");
  });

  it("should handle mixed slashes", () => {
    expect(normalizePath("src\\routes/api\\+server.ts")).toBe("src/routes/api/+server.ts");
  });
});

describe("stableHash", () => {
  it("should produce a 12-character hex hash", () => {
    const hash = stableHash("test input");
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("should be deterministic", () => {
    const input = "deterministic test";
    const hash1 = stableHash(input);
    const hash2 = stableHash(input);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const hash1 = stableHash("input1");
    const hash2 = stableHash("input2");
    expect(hash1).not.toBe(hash2);
  });
});

describe("buildFindingId", () => {
  describe("env-var findings", () => {
    it("should generate stable IDs", () => {
      const finding: EnvVarFinding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["src/db.ts", "src/config.ts"],
      };

      const id1 = buildFindingId(finding);
      const id2 = buildFindingId(finding);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^finding\.env-var#[0-9a-f]{12}$/);
    });

    it("should be order-invariant for file lists", () => {
      const finding1: EnvVarFinding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["src/db.ts", "src/config.ts"],
      };

      const finding2: EnvVarFinding = {
        ...finding1,
        evidenceFiles: ["src/config.ts", "src/db.ts"], // Different order
      };

      const id1 = buildFindingId(finding1);
      const id2 = buildFindingId(finding2);
      
      expect(id1).toBe(id2);
    });

    it("should produce different IDs for different env var names", () => {
      const finding1: EnvVarFinding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["src/db.ts"],
      };

      const finding2: EnvVarFinding = {
        ...finding1,
        name: "API_KEY",
      };

      const id1 = buildFindingId(finding1);
      const id2 = buildFindingId(finding2);
      
      expect(id1).not.toBe(id2);
    });

    it("should normalize paths in fingerprint", () => {
      const finding1: EnvVarFinding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["src/db.ts"],
      };

      const finding2: EnvVarFinding = {
        ...finding1,
        evidenceFiles: ["src\\db.ts"], // Backslash
      };

      const id1 = buildFindingId(finding1);
      const id2 = buildFindingId(finding2);
      
      expect(id1).toBe(id2);
    });
  });

  describe("dependency-change findings", () => {
    it("should generate stable IDs", () => {
      const finding: DependencyChangeFinding = {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        name: "react",
        section: "dependencies",
        from: "17.0.0",
        to: "18.0.0",
        impact: "major",
      };

      const id1 = buildFindingId(finding);
      const id2 = buildFindingId(finding);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^finding\.dependency-change#[0-9a-f]{12}$/);
    });

    it("should include from/to versions in fingerprint", () => {
      const finding1: DependencyChangeFinding = {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        name: "react",
        section: "dependencies",
        from: "17.0.0",
        to: "18.0.0",
        impact: "major",
      };

      const finding2: DependencyChangeFinding = {
        ...finding1,
        from: "16.0.0",
        to: "17.0.0",
      };

      const id1 = buildFindingId(finding1);
      const id2 = buildFindingId(finding2);
      
      expect(id1).not.toBe(id2);
    });

    it("should handle undefined from/to versions", () => {
      const finding: DependencyChangeFinding = {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        name: "new-package",
        section: "dependencies",
        impact: "new",
      };

      const id = buildFindingId(finding);
      expect(id).toMatch(/^finding\.dependency-change#[0-9a-f]{12}$/);
    });
  });

  describe("route-change findings", () => {
    it("should generate stable IDs", () => {
      const finding: RouteChangeFinding = {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [],
        routeId: "/dashboard",
        file: "src/routes/dashboard/+page.svelte",
        change: "added",
        routeType: "page",
      };

      const id1 = buildFindingId(finding);
      const id2 = buildFindingId(finding);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^finding\.route-change#[0-9a-f]{12}$/);
    });

    it("should normalize route paths", () => {
      const finding1: RouteChangeFinding = {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [],
        routeId: "/dashboard",
        file: "src/routes/dashboard/+page.svelte",
        change: "added",
        routeType: "page",
      };

      const finding2: RouteChangeFinding = {
        ...finding1,
        routeId: "\\dashboard", // Backslash
      };

      const id1 = buildFindingId(finding1);
      const id2 = buildFindingId(finding2);
      
      expect(id1).toBe(id2);
    });
  });
});

describe("buildFlagId", () => {
  it("should generate stable IDs", () => {
    const ruleKey = "security.workflow_permissions_broadened";
    const relatedFindingIds = ["finding.env-var#abc123"];

    const id1 = buildFlagId(ruleKey, relatedFindingIds);
    const id2 = buildFlagId(ruleKey, relatedFindingIds);
    
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^flag\.security\.workflow_permissions_broadened#[0-9a-f]{12}$/);
  });

  it("should be order-invariant for relatedFindingIds", () => {
    const ruleKey = "security.workflow_permissions_broadened";
    const ids1 = ["finding.env-var#abc123", "finding.env-var#def456"];
    const ids2 = ["finding.env-var#def456", "finding.env-var#abc123"]; // Different order

    const id1 = buildFlagId(ruleKey, ids1);
    const id2 = buildFlagId(ruleKey, ids2);
    
    expect(id1).toBe(id2);
  });

  it("should produce different IDs for different rule keys", () => {
    const relatedFindingIds = ["finding.env-var#abc123"];
    
    const id1 = buildFlagId("security.rule1", relatedFindingIds);
    const id2 = buildFlagId("security.rule2", relatedFindingIds);
    
    expect(id1).not.toBe(id2);
  });

  it("should produce different IDs for different finding sets", () => {
    const ruleKey = "security.workflow_permissions_broadened";
    
    const id1 = buildFlagId(ruleKey, ["finding.env-var#abc123"]);
    const id2 = buildFlagId(ruleKey, ["finding.env-var#def456"]);
    
    expect(id1).not.toBe(id2);
  });

  it("should handle empty relatedFindingIds", () => {
    const ruleKey = "security.workflow_permissions_broadened";
    const id = buildFlagId(ruleKey, []);
    
    expect(id).toMatch(/^flag\.security\.workflow_permissions_broadened#[0-9a-f]{12}$/);
  });
});

describe("assignFindingId", () => {
  it("should add findingId to finding", () => {
    const finding: EnvVarFinding = {
      type: "env-var",
      kind: "env-var",
      category: "config_env",
      confidence: "high",
      evidence: [],
      name: "DATABASE_URL",
      change: "added",
      evidenceFiles: ["src/db.ts"],
    };

    const withId = assignFindingId(finding);
    
    expect(withId.findingId).toBeDefined();
    expect(withId.findingId).toMatch(/^finding\.env-var#[0-9a-f]{12}$/);
  });

  it("should not mutate original finding", () => {
    const finding: EnvVarFinding = {
      type: "env-var",
      kind: "env-var",
      category: "config_env",
      confidence: "high",
      evidence: [],
      name: "DATABASE_URL",
      change: "added",
      evidenceFiles: ["src/db.ts"],
    };

    const withId = assignFindingId(finding);
    
    expect((finding as any).findingId).toBeUndefined();
    expect(withId.findingId).toBeDefined();
  });
});

describe("assignFlagId", () => {
  it("should add flagId and ruleKey to flag", () => {
    const flag: any = {
      id: "security.workflow_permissions_broadened",
      category: "security",
      score: 35,
      confidence: 0.9,
      title: "Test",
      summary: "Test",
      evidence: [],
      suggestedChecks: [],
      effectiveScore: 32,
      relatedFindingIds: ["finding.env-var#abc123"],
    };

    const withId = assignFlagId(flag);
    
    expect(withId.flagId).toBeDefined();
    expect(withId.flagId).toMatch(/^flag\.security\.workflow_permissions_broadened#[0-9a-f]{12}$/);
    expect(withId.ruleKey).toBe("security.workflow_permissions_broadened");
  });

  it("should handle flags without relatedFindingIds", () => {
    const flag: any = {
      id: "security.workflow_permissions_broadened",
      category: "security",
      score: 35,
      confidence: 0.9,
      title: "Test",
      summary: "Test",
      evidence: [],
      suggestedChecks: [],
      effectiveScore: 32,
    };

    const withId = assignFlagId(flag);
    
    expect(withId.flagId).toBeDefined();
    expect(withId.ruleKey).toBe("security.workflow_permissions_broadened");
  });
});
