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
    expect(checkAction?.category).toBe("types");
    expect(checkAction?.triggers).toContain("Route files changed");
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
    expect(testAction?.category).toBe("tests");
    expect(testAction?.triggers.some(t => t.includes("test file(s) changed"))).toBe(true);
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
    const migrateAction = actions.find(a => a.id === "apply-migrations");
    expect(migrateAction?.category).toBe("database");
    expect(migrateAction?.triggers.some(t => t.includes("migration file(s) changed"))).toBe(true);
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
    expect(migrateAction?.triggers.some(t => t.includes("DANGEROUS SQL"))).toBe(true);

    // Should also have backup action
    expect(actions.some(a => a.id === "backup-db")).toBe(true);
    const backupAction = actions.find(a => a.id === "backup-db");
    expect(backupAction?.category).toBe("database");
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
    expect(envAction?.category).toBe("environment");
    expect(envAction?.triggers.some(t => t.includes("DATABASE_URL"))).toBe(true);
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

  it("should include trigger context for major dependency changes", () => {
    const findings: Finding[] = [
      {
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
      },
    ];

    const actions = deriveActions(findings, "auto");

    const depAction = actions.find(a => a.id === "review-dependencies");
    expect(depAction).toBeDefined();
    expect(depAction?.category).toBe("dependencies");
    expect(depAction?.triggers.some(t => t.includes("react"))).toBe(true);
    expect(depAction?.triggers.some(t => t.includes("17.0.0 → 18.0.0"))).toBe(true);
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
    score: 50,
    level: "medium",
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
    // VAR1 has evidence starting with 'z.ts' and VAR2 starts with 'y.ts',
    // so VAR2 will sort before VAR1 when findings are ordered by first evidence file.
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
    // Both findings have same type (env-var), so sorted by first evidence file alphabetically.
    // VAR2 has 'y.ts', VAR1 has 'z.ts', so VAR2 comes first ('y' < 'z').
    expect(facts.findings[0].name).toBe("VAR2");
    // After maxFindings, evidence within VAR2 is sorted alphabetically.
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

  it("should assign findingIds to all findings", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [{ file: "a.ts", excerpt: "test" }],
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["a.ts"],
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "b.ts", excerpt: "test" }],
        routeId: "/api/users",
        file: "b.ts",
        change: "added",
        routeType: "endpoint",
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
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.findings.length).toBe(2);
    // All findings should have findingIds
    expect(facts.findings[0].findingId).toBeDefined();
    expect(facts.findings[0].findingId).toMatch(/^finding\./);
    expect(facts.findings[1].findingId).toBeDefined();
    expect(facts.findings[1].findingId).toMatch(/^finding\./);
  });

  it("should assign deterministic findingIds", async () => {
    const changeSet = createMockChangeSet();
    const finding: Finding = {
      type: "env-var",
      kind: "env-var",
      category: "config_env",
      confidence: "high",
      evidence: [{ file: "a.ts", excerpt: "test" }],
      name: "DATABASE_URL",
      change: "added",
      evidenceFiles: ["a.ts"],
    };
    const riskScore = createMockRiskScore();

    // Build facts twice with the same input
    const facts1 = await buildFacts({
      changeSet,
      findings: [finding],
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      repoRoot: "/repo",
      isDirty: false,
    });

    const facts2 = await buildFacts({
      changeSet,
      findings: [finding],
      riskScore,
      requestedProfile: "auto",
      detectedProfile: "auto",
      profileConfidence: "high",
      profileReasons: ["Test"],
      repoRoot: "/repo",
      isDirty: false,
    });

    // findingIds should be identical
    expect(facts1.findings[0].findingId).toBe(facts2.findings[0].findingId);
  });

  it("should populate changeset.files from file-summary finding", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "file-summary",
        kind: "file-summary",
        category: "unknown",
        confidence: "high",
        evidence: [],
        added: ["src/new.ts"],
        modified: ["src/existing.ts"],
        deleted: ["src/old.ts"],
        renamed: [{ from: "src/before.ts", to: "src/after.ts" }],
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
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.changeset.files.added).toEqual(["src/new.ts"]);
    expect(facts.changeset.files.modified).toEqual(["src/existing.ts"]);
    expect(facts.changeset.files.deleted).toEqual(["src/old.ts"]);
    expect(facts.changeset.files.renamed).toEqual([{ from: "src/before.ts", to: "src/after.ts" }]);
    // file-summary should NOT be in findings array
    expect(facts.findings.some(f => f.type === "file-summary")).toBe(false);
  });

  it("should populate changeset.byCategory from file-category finding", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "file-category",
        kind: "file-category",
        category: "unknown",
        confidence: "high",
        evidence: [],
        categories: {
          product: ["src/lib.ts"],
          tests: ["tests/test.ts"],
          ci: [],
          infra: [],
          database: ["supabase/migrations/001.sql"],
          docs: [],
          dependencies: [],
          config: [],
          artifacts: [],
          other: [],
        },
        summary: [
          { category: "product", count: 1 },
          { category: "tests", count: 1 },
          { category: "database", count: 1 },
        ],
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
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.changeset.byCategory.product).toEqual(["src/lib.ts"]);
    expect(facts.changeset.byCategory.tests).toEqual(["tests/test.ts"]);
    expect(facts.changeset.byCategory.database).toEqual(["supabase/migrations/001.sql"]);
    expect(facts.changeset.categorySummary).toHaveLength(3);
    // file-category should NOT be in findings array
    expect(facts.findings.some(f => f.type === "file-category")).toBe(false);
  });

  it("should populate changeset.warnings from large-diff finding", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "large-diff",
        kind: "large-diff",
        category: "unknown",
        confidence: "high",
        evidence: [],
        filesChanged: 50,
        linesChanged: 5000,
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
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.changeset.warnings).toHaveLength(1);
    expect(facts.changeset.warnings[0].type).toBe("large-diff");
    expect((facts.changeset.warnings[0] as any).filesChanged).toBe(50);
    expect((facts.changeset.warnings[0] as any).linesChanged).toBe(5000);
    // large-diff should NOT be in findings array
    expect(facts.findings.some(f => f.type === "large-diff")).toBe(false);
  });

  it("should populate changeset.warnings from lockfile-mismatch finding", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "lockfile-mismatch",
        kind: "lockfile-mismatch",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        manifestChanged: true,
        lockfileChanged: false,
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
      repoRoot: "/repo",
      isDirty: false,
    });

    expect(facts.changeset.warnings).toHaveLength(1);
    expect(facts.changeset.warnings[0].type).toBe("lockfile-mismatch");
    expect((facts.changeset.warnings[0] as any).manifestChanged).toBe(true);
    expect((facts.changeset.warnings[0] as any).lockfileChanged).toBe(false);
    // lockfile-mismatch should NOT be in findings array
    expect(facts.findings.some(f => f.type === "lockfile-mismatch")).toBe(false);
  });

  it("should keep domain findings in findings array", async () => {
    const changeSet = createMockChangeSet();
    const findings: Finding[] = [
      {
        type: "file-summary",
        kind: "file-summary",
        category: "unknown",
        confidence: "high",
        evidence: [],
        added: ["src/new.ts"],
        modified: [],
        deleted: [],
        renamed: [],
      },
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
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [],
        tool: "supabase",
        files: ["supabase/migrations/001.sql"],
        risk: "medium",
        reasons: ["Migration files changed"],
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
      repoRoot: "/repo",
      isDirty: false,
    });

    // Domain findings should be in findings array
    expect(facts.findings).toHaveLength(2);
    expect(facts.findings.some(f => f.type === "route-change")).toBe(true);
    expect(facts.findings.some(f => f.type === "db-migration")).toBe(true);
    // Meta finding should NOT be in findings array
    expect(facts.findings.some(f => f.type === "file-summary")).toBe(false);
  });

  it("should use schema version 2.1", async () => {
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

    expect(facts.schemaVersion).toBe("2.1");
  });

  it("should have empty changeset when no meta-findings", async () => {
    const changeSet = createMockChangeSet();
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
      repoRoot: "/repo",
      isDirty: false,
    });

    // Changeset should have default empty values
    expect(facts.changeset.files.added).toEqual([]);
    expect(facts.changeset.files.modified).toEqual([]);
    expect(facts.changeset.files.deleted).toEqual([]);
    expect(facts.changeset.files.renamed).toEqual([]);
    expect(facts.changeset.warnings).toEqual([]);
    // Domain finding should still be present
    expect(facts.findings).toHaveLength(1);
    expect(facts.findings[0].type).toBe("env-var");
  });
});
