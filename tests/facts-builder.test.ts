/**
 * Tests for facts builder and category aggregation.
 */

import { describe, it, expect } from "bun:test";
import { aggregateCategories, buildSummaryByArea } from "../src/commands/facts/categories.js";
import { deriveActions } from "../src/commands/facts/actions.js";
import { buildFacts } from "../src/commands/facts/builder.js";
import type { Finding, RiskFactor, Evidence, ChangeSet, RiskScore } from "../src/core/types.js";

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

describe("buildFacts", () => {
  // Helper to create a minimal ChangeSet
  const createMockChangeSet = (): ChangeSet => ({
    base: "main",
    head: "HEAD",
    files: [{ path: "src/test.ts", status: "modified" }],
    diffs: [{
      path: "src/test.ts",
      status: "modified",
      hunks: [{
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 2,
        content: "@@ -1,1 +1,2 @@\n-old line\n+new line 1\n+new line 2",
        additions: ["+new line 1", "+new line 2"],
        deletions: ["-old line"],
      }],
    }],
    basePackageJson: undefined,
    headPackageJson: undefined,
  });

  // Helper to create a minimal RiskScore
  const createMockRiskScore = (): RiskScore => ({
    total: 50,
    category: "medium",
    factors: [],
  });

  it("should use provided repoRoot instead of calling git", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      repoRoot: "/custom/repo/root",
      isDirty: false,
    });

    expect(facts.git.repoRoot).toBe("/custom/repo/root");
    expect(facts.git.isDirty).toBe(false);
  });

  it("should use provided isDirty instead of calling git", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      repoRoot: "/repo",
      isDirty: true,
    });

    expect(facts.git.isDirty).toBe(true);
  });

  it("should apply --max-findings limit deterministically", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "a.ts", excerpt: "test" }],
        routeId: "/a",
        file: "a.ts",
        change: "added",
        routeType: "page",
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "b.ts", excerpt: "test" }],
        routeId: "/b",
        file: "b.ts",
        change: "added",
        routeType: "page",
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "c.ts", excerpt: "test" }],
        routeId: "/c",
        file: "c.ts",
        change: "added",
        routeType: "page",
      },
    ];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      filters: {
        maxFindings: 2,
      },
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.findings.length).toBe(2);
    // Should keep first 2 after deterministic sorting
    expect(facts.findings[0].routeId).toBe("/a");
    expect(facts.findings[1].routeId).toBe("/b");
  });

  it("should sort evidence only for findings that remain after maxFindings", async () => {
    const changeSet = createMockChangeSet();
    
    // Create findings with unsorted evidence
    // VAR1 has evidence starting with 'a.ts' so it will sort before VAR2 which starts with 'b.ts'
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [
          { file: "z.ts", excerpt: "last" },
          { file: "a.ts", excerpt: "first" },
        ],
        name: "VAR1",
        change: "added",
        evidenceFiles: ["z.ts", "a.ts"],
      },
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [
          { file: "y.ts", excerpt: "second" },
          { file: "b.ts", excerpt: "first" },
        ],
        name: "VAR2",
        change: "added",
        evidenceFiles: ["y.ts", "b.ts"],
      },
    ];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      filters: {
        maxFindings: 1,
      },
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.findings.length).toBe(1);
    // First finding is sorted by its first evidence file (originally z.ts before sorting)
    // After deterministic finding sort, VAR2 comes first because 'y.ts' < 'z.ts' 
    // (first file in unsorted evidence determines finding order)
    // But wait - we sort findings by first file in evidence BEFORE sorting evidence
    // So VAR2 (y.ts) < VAR1 (z.ts), meaning VAR2 is kept
    expect(facts.findings[0].name).toBe("VAR2");
    // Evidence within VAR2 should be sorted: b.ts < y.ts
    expect(facts.findings[0].evidence[0].file).toBe("b.ts");
    expect(facts.findings[0].evidence[1].file).toBe("y.ts");
  });

  it("should redact evidence only for findings kept after maxFindings", async () => {
    const changeSet = createMockChangeSet();
    
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [
          { file: "a.ts", excerpt: 'password="secret123"' },
        ],
        name: "VAR1",
        change: "added",
        evidenceFiles: ["a.ts"],
      },
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [
          { file: "b.ts", excerpt: 'password="another_secret"' },
        ],
        name: "VAR2",
        change: "added",
        evidenceFiles: ["b.ts"],
      },
    ];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      filters: {
        maxFindings: 1,
        redact: true,
      },
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.findings.length).toBe(1);
    // Evidence should be redacted
    expect(facts.findings[0].evidence[0].excerpt).toContain("***REDACTED***");
    expect(facts.findings[0].evidence[0].excerpt).not.toContain("secret123");
  });

  it("should maintain deterministic sorting with maxFindings", async () => {
    const changeSet = createMockChangeSet();
    
    // Create findings that will sort deterministically
    // Sorting is by type first, then by first evidence file
    const findings: Finding[] = [
      {
        type: "test-change",
        kind: "test-change",
        category: "tests",
        confidence: "high",
        evidence: [{ file: "z.test.ts", excerpt: "test" }],
        framework: "vitest",
        files: ["z.test.ts"],
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "b.ts", excerpt: "route b" }],
        routeId: "/b",
        file: "b.ts",
        change: "added",
        routeType: "page",
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "a.ts", excerpt: "route a" }],
        routeId: "/a",
        file: "a.ts",
        change: "added",
        routeType: "page",
      },
    ];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      filters: {
        maxFindings: 2,
      },
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.findings.length).toBe(2);
    // Should be sorted by type first (route-change comes before test-change alphabetically)
    // Then by first evidence file within same type (a.ts < b.ts)
    expect(facts.findings[0].type).toBe("route-change");
    expect(facts.findings[0].routeId).toBe("/a");
    expect(facts.findings[1].type).toBe("route-change");
    expect(facts.findings[1].routeId).toBe("/b");
  });

  it("should calculate stats correctly", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [];
    const riskScore = createMockRiskScore();

    const facts = await buildFacts({
      changeSet,
      findings,
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.stats.filesChanged).toBe(1);
    expect(facts.stats.insertions).toBe(2);
    expect(facts.stats.deletions).toBe(1);
  });
});
