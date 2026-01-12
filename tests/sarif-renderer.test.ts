/**
 * Unit tests for SARIF renderer.
 */

import { describe, expect, test } from "bun:test";
import { renderSarif, SARIF_RULES } from "../src/render/sarif.js";
import type { FactsOutput, Finding, ChangeSet } from "../src/core/types.js";
import { createTestChangeSet } from "../src/core/change-set.js";

describe("SARIF renderer", () => {
  const baseFactsOutput: FactsOutput = {
    schemaVersion: "2.1",
    git: {
      base: "main",
      head: "HEAD",
      range: "main..HEAD",
      repoRoot: "/test/repo",
      isDirty: false,
    },
    profile: {
      requested: "auto",
      detected: "sveltekit",
      confidence: "high",
      reasons: ["Found svelte.config.js"],
    },
    stats: {
      filesChanged: 1,
      insertions: 10,
      deletions: 5,
      skippedFilesCount: 0,
    },
    filters: {
      defaultExcludes: [],
      excludes: [],
      includes: [],
      redact: false,
      maxFileBytes: 1048576,
      maxDiffBytes: 5242880,
    },
    summary: {
      byArea: {},
      highlights: [],
    },
    categories: [],
    changeset: {
      files: {
        added: [],
        modified: [],
        deleted: [],
        renamed: [],
      },
      byCategory: {},
      categorySummary: [],
      warnings: [],
    },
    risk: {
      score: 20,
      level: "low",
      factors: [],
    },
    findings: [],
    actions: [],
    skippedFiles: [],
    warnings: [],
  };

  test("should generate valid SARIF 2.1.0 structure", () => {
    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings: [],
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-schema-2.1.0.json");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("branch-narrator");
    expect(sarif.runs[0].tool.driver.version).toBeTruthy();
  });

  test("should include rules for used ruleIds", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [
          {
            file: "supabase/migrations/001_init.sql",
            excerpt: "DROP TABLE users;",
          },
        ],
        tool: "supabase",
        files: ["supabase/migrations/001_init.sql"],
        risk: "high",
        reasons: ["DROP statement detected"],
        findingId: "finding.db-migration#abc123",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.runs[0].tool.driver.rules).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.rules![0].id).toBe("BNR001");
    expect(sarif.runs[0].tool.driver.rules![0].name).toBe(
      "DangerousSqlInMigration"
    );
  });

  test("should sort rules by ID for deterministic output", () => {
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [{ file: "src/config.ts", excerpt: "process.env.API_KEY" }],
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#xyz789",
      },
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [
          {
            file: "supabase/migrations/001_init.sql",
            excerpt: "CREATE TABLE users",
          },
        ],
        tool: "supabase",
        files: ["supabase/migrations/001_init.sql"],
        risk: "low",
        reasons: ["Schema change"],
        findingId: "finding.db-migration#abc123",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    const ruleIds = sarif.runs[0].tool.driver.rules!.map((r) => r.id);
    expect(ruleIds).toEqual(["BNR002", "BNR004"]); // Sorted alphabetically
  });

  test("should map dangerous SQL migration to BNR001 with error level", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [
          {
            file: "supabase/migrations/002_drop.sql",
            excerpt: "DROP TABLE users;",
            line: 5,
          },
        ],
        tool: "supabase",
        files: ["supabase/migrations/002_drop.sql"],
        risk: "high",
        reasons: ["DROP statement detected"],
        findingId: "finding.db-migration#dangerous",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("BNR001");
    expect(results[0].level).toBe("error");
    expect(results[0].message.text).toContain("Dangerous SQL");
    expect(results[0].locations![0].physicalLocation!.region!.startLine).toBe(
      5
    );
  });

  test("should map non-destructive migration to BNR002 with warning level", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [
          {
            file: "supabase/migrations/003_add_column.sql",
            excerpt: "ALTER TABLE users ADD COLUMN email TEXT;",
          },
        ],
        tool: "supabase",
        files: ["supabase/migrations/003_add_column.sql"],
        risk: "medium",
        reasons: ["Schema modification"],
        findingId: "finding.db-migration#safe",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("BNR002");
    expect(results[0].level).toBe("warning");
  });

  test("should map major dependency bump to BNR003", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [{ file: "package.json", excerpt: '"@sveltejs/kit": "^2.0.0"' }],
        name: "@sveltejs/kit",
        section: "dependencies" as const,
        from: "1.20.0",
        to: "2.0.0",
        impact: "major",
        findingId: "finding.dependency-change#kit2",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("BNR003");
    expect(results[0].level).toBe("warning");
    expect(results[0].message.text).toContain("@sveltejs/kit");
    expect(results[0].message.text).toContain("1.20.0");
    expect(results[0].message.text).toContain("2.0.0");
  });

  test("should not map minor/patch dependency changes", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        kind: "dependency-change",
        category: "dependencies",
        confidence: "high",
        evidence: [{ file: "package.json", excerpt: '"lodash": "^4.17.22"' }],
        name: "lodash",
        section: "dependencies" as const,
        from: "4.17.21",
        to: "4.17.22",
        impact: "patch",
        findingId: "finding.dependency-change#lodash",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    // Should have no results for patch changes
    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map env var reference to BNR004", () => {
    const findings: Finding[] = [
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [
          {
            file: "src/config.ts",
            excerpt: "const apiKey = process.env.API_KEY;",
          },
        ],
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#apikey",
      },
    ];

    const changeSet = createTestChangeSet();
    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const sarif = renderSarif(facts, changeSet);

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("BNR004");
    expect(results[0].level).toBe("warning");
    expect(results[0].message.text).toContain("API_KEY");
  });

  test("should map Cloudflare config change to BNR005", () => {
    const findings: Finding[] = [
      {
        type: "cloudflare-change",
        kind: "cloudflare-change",
        category: "cloudflare",
        confidence: "high",
        evidence: [{ file: "wrangler.toml", excerpt: "name = 'my-worker'" }],
        area: "wrangler" as const,
        files: ["wrangler.toml"],
        findingId: "finding.cloudflare-change#wrangler",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("BNR005");
    expect(results[0].level).toBe("note");
    expect(results[0].message.text).toContain("wrangler.toml");
  });

  test("should map route change to BNR006", () => {
    const findings: Finding[] = [
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [
          {
            file: "src/routes/api/users/+server.ts",
            excerpt: "export async function GET",
          },
        ],
        routeId: "/api/users",
        file: "src/routes/api/users/+server.ts",
        change: "added",
        routeType: "endpoint",
        methods: ["GET", "POST"],
        findingId: "finding.route-change#users",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    const results = sarif.runs[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("BNR006");
    expect(results[0].level).toBe("note");
    expect(results[0].message.text).toContain("/api/users");
    expect(results[0].message.text).toContain("GET, POST");
  });

  test("should sort results deterministically", () => {
    const findings: Finding[] = [
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "src/routes/api/b/+server.ts", excerpt: "" }],
        routeId: "/api/b",
        file: "src/routes/api/b/+server.ts",
        change: "added",
        routeType: "endpoint",
        findingId: "finding.route-change#b",
      },
      {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence: [{ file: "src/config.ts", excerpt: "" }],
        name: "VAR_A",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#a",
      },
      {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence: [{ file: "src/routes/api/a/+server.ts", excerpt: "" }],
        routeId: "/api/a",
        file: "src/routes/api/a/+server.ts",
        change: "added",
        routeType: "endpoint",
        findingId: "finding.route-change#a",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    // Results should be sorted by type then by findingId
    const resultTypes = sarif.runs[0].results.map((r) =>
      r.partialFingerprints?.findingId
    );
    expect(resultTypes).toEqual([
      "finding.env-var#a",
      "finding.route-change#a",
      "finding.route-change#b",
    ]);
  });

  test("should include partialFingerprints with findingId", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [{ file: "migration.sql", excerpt: "" }],
        tool: "supabase",
        files: ["migration.sql"],
        risk: "low",
        reasons: ["Schema change"],
        findingId: "finding.db-migration#stable123",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(
      sarif.runs[0].results[0].partialFingerprints?.findingId
    ).toBe("finding.db-migration#stable123");
  });

  test("should set uriBaseId for locations", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [{ file: "migration.sql", excerpt: "" }],
        tool: "supabase",
        files: ["migration.sql"],
        risk: "low",
        reasons: ["Schema change"],
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(
      sarif.runs[0].results[0].locations![0].physicalLocation!.artifactLocation
        .uriBaseId
    ).toBe("SRCROOT");
    expect(sarif.runs[0].originalUriBaseIds).toBeDefined();
    expect(sarif.runs[0].originalUriBaseIds!.SRCROOT.uri).toContain(
      "/test/repo"
    );
  });

  test("should handle findings with no evidence", () => {
    const findings: Finding[] = [
      {
        type: "db-migration",
        kind: "db-migration",
        category: "database",
        confidence: "high",
        evidence: [],
        tool: "supabase",
        files: ["migration.sql"],
        risk: "low",
        reasons: ["Schema change"],
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    // Should still generate result with empty locations
    expect(sarif.runs[0].results).toHaveLength(1);
    expect(sarif.runs[0].results[0].locations).toHaveLength(0);
  });
});

describe("SARIF rules", () => {
  test("should have stable rule IDs", () => {
    const ruleIds = Object.keys(SARIF_RULES);
    expect(ruleIds).toEqual([
      "BNR001",
      "BNR002",
      "BNR003",
      "BNR004",
      "BNR005",
      "BNR006",
    ]);
  });

  test("should have required fields for all rules", () => {
    for (const rule of Object.values(SARIF_RULES)) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.shortDescription).toBeTruthy();
      expect(rule.fullDescription).toBeTruthy();
      expect(rule.defaultLevel).toBeTruthy();
      expect(["none", "note", "warning", "error"]).toContain(
        rule.defaultLevel
      );
    }
  });
});
