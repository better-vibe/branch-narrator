/**
 * Tests for facts builder and category aggregation.
 */

import { describe, it, expect } from "bun:test";
import { aggregateCategories, buildSummaryByArea } from "../src/commands/facts/categories.js";
import { deriveActions } from "../src/commands/facts/actions.js";
import type { Finding, RiskFactor, Evidence } from "../src/core/types.js";

describe("aggregateCategories", () => {
  it("should aggregate findings by category", () => {
    const findings: Finding[] = [
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [],
        routeId: "/api/users",
        file: "src/routes/api/users/+server.ts",
        change: "added",
        routeType: "endpoint",
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [],
        routeId: "/about",
        file: "src/routes/about/+page.svelte",
        change: "modified",
        routeType: "page",
      },
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [],
        tool: "supabase",
        files: ["supabase/migrations/001_init.sql"],
        risk: "medium",
        reasons: ["Migration files changed"],
      },
    ];

    const riskFactors: RiskFactor[] = [
      {
        kind: "route-added",
        weight: 5,
        explanation: "Route added: /api/users",
        evidence: [],
      },
      {
        kind: "db-migration",
        weight: 15,
        explanation: "Database migration detected",
        evidence: [],
      },
    ];

    const categories = aggregateCategories(findings, riskFactors);

    expect(categories.length).toBe(2);
    
    // Should be sorted by riskWeight desc
    expect(categories[0].id).toBe("database");
    expect(categories[0].count).toBe(1);
    expect(categories[0].riskWeight).toBe(15);
    
    expect(categories[1].id).toBe("routes");
    expect(categories[1].count).toBe(2);
    expect(categories[1].riskWeight).toBe(5);
  });

  it("should exclude file-summary from counts", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        kind: "file-summary",
        category: "unknown",
        confidence: "high",
        evidence: [],
        added: ["src/routes/+page.svelte"],
        modified: [],
        deleted: [],
        renamed: [],
      },
      {
        type: "test-change",
        kind: "test-change",
        category: "tests",
        confidence: "high",
        evidence: [],
        framework: "vitest",
        files: ["tests/example.test.ts"],
      },
    ];

    const categories = aggregateCategories(findings, []);

    // Should have 1 category (tests), not 2
    expect(categories.length).toBe(1);
    expect(categories[0].id).toBe("tests");
    expect(categories[0].count).toBe(1);
  });

  it("should limit top evidence to 3 items", () => {
    const evidence: Evidence[] = [
      { file: "file1.ts", excerpt: "excerpt 1" },
      { file: "file2.ts", excerpt: "excerpt 2" },
      { file: "file3.ts", excerpt: "excerpt 3" },
      { file: "file4.ts", excerpt: "excerpt 4" },
    ];

    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["file1.ts"],
      },
    ];

    const categories = aggregateCategories(findings, []);

    expect(categories[0].topEvidence.length).toBe(3);
  });

  it("should sort deterministically by riskWeight, count, id", () => {
    const findings: Finding[] = [
      {
        type: "cloudflare-change",
        kind: "cloudflare-change",
        category: "cloudflare",
        confidence: "high",
        evidence: [],
        area: "wrangler",
        files: ["wrangler.toml"],
      },
      {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        name: "svelte",
        section: "dependencies",
        from: "4.0.0",
        to: "5.0.0",
        impact: "major",
      },
    ];

    const riskFactors: RiskFactor[] = [
      {
        kind: "dependency-major",
        weight: 15,
        explanation: "Major version change",
        evidence: [],
      },
      {
        kind: "cloudflare-change",
        weight: 10,
        explanation: "Cloudflare config changed",
        evidence: [],
      },
    ];

    const categories = aggregateCategories(findings, riskFactors);

    // Should be sorted by riskWeight descending
    expect(categories[0].id).toBe("dependencies");
    expect(categories[0].riskWeight).toBe(15);
    expect(categories[1].id).toBe("cloudflare");
    expect(categories[1].riskWeight).toBe(10);
  });
});

describe("buildSummaryByArea", () => {
  it("should build summary from categories", () => {
    const categories = [
      {
        id: "routes" as const,
        count: 2,
        riskWeight: 10,
        topEvidence: [],
      },
      {
        id: "database" as const,
        count: 1,
        riskWeight: 20,
        topEvidence: [],
      },
    ];

    const summary = buildSummaryByArea(categories);

    expect(summary).toEqual({
      routes: 2,
      database: 1,
    });
  });
});

describe("deriveActions", () => {
  it("should generate SvelteKit check action for sveltekit profile", () => {
    const findings: Finding[] = [
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [],
        routeId: "/about",
        file: "src/routes/about/+page.svelte",
        change: "modified",
        routeType: "page",
      },
    ];

    const actions = deriveActions(findings, "sveltekit");

    expect(actions.some(a => a.id === "sveltekit-check")).toBe(true);
    const checkAction = actions.find(a => a.id === "sveltekit-check");
    expect(checkAction?.blocking).toBe(true);
    expect(checkAction?.commands[0].cmd).toBe("pnpm check");
  });

  it("should generate test action when test changes detected", () => {
    const findings: Finding[] = [
      {
        type: "test-change",
        kind: "test-change",
        category: "tests",
        confidence: "high",
        evidence: [],
        framework: "vitest",
        files: ["tests/example.test.ts"],
      },
    ];

    const actions = deriveActions(findings, "auto");

    expect(actions.some(a => a.id === "run-tests")).toBe(true);
    const testAction = actions.find(a => a.id === "run-tests");
    expect(testAction?.blocking).toBe(true);
  });

  it("should generate migration actions for database changes", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [],
        tool: "supabase",
        files: ["supabase/migrations/001_init.sql"],
        risk: "medium",
        reasons: ["Migration files changed"],
      },
    ];

    const actions = deriveActions(findings, "auto");

    expect(actions.some(a => a.id === "apply-migrations")).toBe(true);
  });

  it("should mark migration blocking if dangerous SQL", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [],
        tool: "supabase",
        files: ["supabase/migrations/002_danger.sql"],
        risk: "high",
        reasons: ["DROP TABLE detected"],
      },
    ];

    const actions = deriveActions(findings, "auto");

    const migrateAction = actions.find(a => a.id === "apply-migrations");
    expect(migrateAction?.blocking).toBe(true);
    expect(migrateAction?.reason).toContain("DANGEROUS SQL");
    
    // Should also have backup action
    expect(actions.some(a => a.id === "backup-db")).toBe(true);
  });

  it("should generate action for env var changes", () => {
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["src/lib/db.ts"],
      },
    ];

    const actions = deriveActions(findings, "auto");

    expect(actions.some(a => a.id === "update-env-docs")).toBe(true);
    const envAction = actions.find(a => a.id === "update-env-docs");
    expect(envAction?.blocking).toBe(false);
  });

  it("should sort actions with blocking first", () => {
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [],
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
      },
      {
        type: "test-change",
        kind: "test-change",
        category: "tests",
        confidence: "high",
        evidence: [],
        framework: "vitest",
        files: ["tests/example.test.ts"],
      },
    ];

    const actions = deriveActions(findings, "auto");

    // Blocking actions should come first
    const firstAction = actions[0];
    expect(firstAction.blocking).toBe(true);
    
    // Non-blocking should come after
    const lastAction = actions[actions.length - 1];
    expect(lastAction.blocking).toBe(false);
  });
});
