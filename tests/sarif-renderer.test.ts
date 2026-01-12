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

  // ============================================================================
  // BNR007-BNR017 Tests (New Rules)
  // ============================================================================

  test("should map ci-workflow permissions_broadened to BNR007 with error level", () => {
    const findings: Finding[] = [
      {
        type: "ci-workflow",
        kind: "ci-workflow",
        category: "ci",
        confidence: "high",
        evidence: [
          {
            file: ".github/workflows/ci.yml",
            excerpt: "permissions: write-all",
            line: 10,
          },
        ],
        file: ".github/workflows/ci.yml",
        riskType: "permissions_broadened",
        details: "Workflow now has write-all permissions",
        findingId: "finding.ci-workflow#perms",
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
    expect(results[0].ruleId).toBe("BNR007");
    expect(results[0].level).toBe("error");
    expect(results[0].message.text).toContain("permissions broadened");
  });

  test("should map ci-workflow pull_request_target to BNR008 with error level", () => {
    const findings: Finding[] = [
      {
        type: "ci-workflow",
        kind: "ci-workflow",
        category: "ci",
        confidence: "high",
        evidence: [
          {
            file: ".github/workflows/pr.yml",
            excerpt: "on: pull_request_target",
            line: 3,
          },
        ],
        file: ".github/workflows/pr.yml",
        riskType: "pull_request_target",
        details: "Workflow uses pull_request_target trigger",
        findingId: "finding.ci-workflow#prt",
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
    expect(results[0].ruleId).toBe("BNR008");
    expect(results[0].level).toBe("error");
    expect(results[0].message.text).toContain("pull_request_target");
  });

  test("should not map ci-workflow pipeline_changed to SARIF", () => {
    const findings: Finding[] = [
      {
        type: "ci-workflow",
        kind: "ci-workflow",
        category: "ci",
        confidence: "high",
        evidence: [{ file: ".github/workflows/ci.yml", excerpt: "" }],
        file: ".github/workflows/ci.yml",
        riskType: "pipeline_changed",
        details: "Workflow modified",
        findingId: "finding.ci-workflow#changed",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    // pipeline_changed is not mapped to SARIF
    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map security-file to BNR009 with warning level", () => {
    const findings: Finding[] = [
      {
        type: "security-file",
        kind: "security-file",
        category: "security",
        confidence: "high",
        evidence: [
          {
            file: "src/auth/middleware.ts",
            excerpt: "export function checkAuth",
          },
        ],
        files: ["src/auth/middleware.ts"],
        reasons: ["middleware"],
        findingId: "finding.security-file#auth",
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
    expect(results[0].ruleId).toBe("BNR009");
    expect(results[0].level).toBe("warning");
    expect(results[0].message.text).toContain("Security-sensitive");
  });

  test("should map breaking graphql-change to BNR010 with error level", () => {
    const findings: Finding[] = [
      {
        type: "graphql-change",
        kind: "graphql-change",
        category: "api",
        confidence: "high",
        evidence: [
          {
            file: "schema.graphql",
            excerpt: "type Query { ... }",
            line: 1,
          },
        ],
        file: "schema.graphql",
        status: "modified",
        isBreaking: true,
        breakingChanges: ["Removed field User.email", "Removed type Address"],
        addedElements: [],
        findingId: "finding.graphql-change#breaking",
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
    expect(results[0].ruleId).toBe("BNR010");
    expect(results[0].level).toBe("error");
    expect(results[0].message.text).toContain("Breaking GraphQL");
    expect(results[0].message.text).toContain("Removed field User.email");
  });

  test("should not map non-breaking graphql-change to SARIF", () => {
    const findings: Finding[] = [
      {
        type: "graphql-change",
        kind: "graphql-change",
        category: "api",
        confidence: "high",
        evidence: [{ file: "schema.graphql", excerpt: "" }],
        file: "schema.graphql",
        status: "modified",
        isBreaking: false,
        breakingChanges: [],
        addedElements: ["Added field User.phone"],
        findingId: "finding.graphql-change#safe",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map breaking package-exports to BNR011 with error level", () => {
    const findings: Finding[] = [
      {
        type: "package-exports",
        kind: "package-exports",
        category: "api",
        confidence: "high",
        evidence: [{ file: "package.json", excerpt: '"exports": {...}' }],
        isBreaking: true,
        addedExports: [],
        removedExports: ["./utils", "./helpers"],
        legacyFieldChanges: [],
        binChanges: { added: [], removed: [] },
        findingId: "finding.package-exports#breaking",
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
    expect(results[0].ruleId).toBe("BNR011");
    expect(results[0].level).toBe("error");
    expect(results[0].message.text).toContain("Breaking package exports");
    expect(results[0].message.text).toContain("./utils");
  });

  test("should not map non-breaking package-exports to SARIF", () => {
    const findings: Finding[] = [
      {
        type: "package-exports",
        kind: "package-exports",
        category: "api",
        confidence: "high",
        evidence: [{ file: "package.json", excerpt: "" }],
        isBreaking: false,
        addedExports: ["./new-feature"],
        removedExports: [],
        legacyFieldChanges: [],
        binChanges: { added: [], removed: [] },
        findingId: "finding.package-exports#safe",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map stencil removed prop to BNR012", () => {
    const findings: Finding[] = [
      {
        type: "stencil-prop-change",
        kind: "stencil-prop-change",
        category: "api",
        confidence: "high",
        evidence: [
          {
            file: "src/components/button/button.tsx",
            excerpt: "@Prop() disabled: boolean;",
          },
        ],
        tag: "my-button",
        propName: "disabled",
        change: "removed",
        file: "src/components/button/button.tsx",
        findingId: "finding.stencil-prop#removed",
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
    expect(results[0].ruleId).toBe("BNR012");
    expect(results[0].level).toBe("warning");
    expect(results[0].message.text).toContain("Stencil prop removed");
    expect(results[0].message.text).toContain("my-button");
    expect(results[0].message.text).toContain("disabled");
  });

  test("should not map stencil added prop to SARIF", () => {
    const findings: Finding[] = [
      {
        type: "stencil-prop-change",
        kind: "stencil-prop-change",
        category: "api",
        confidence: "high",
        evidence: [{ file: "src/components/button/button.tsx", excerpt: "" }],
        tag: "my-button",
        propName: "loading",
        change: "added",
        file: "src/components/button/button.tsx",
        findingId: "finding.stencil-prop#added",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map stencil removed component to BNR012", () => {
    const findings: Finding[] = [
      {
        type: "stencil-component-change",
        kind: "stencil-component-change",
        category: "api",
        confidence: "high",
        evidence: [{ file: "src/components/old/old.tsx", excerpt: "" }],
        tag: "my-old-component",
        change: "removed",
        file: "src/components/old/old.tsx",
        findingId: "finding.stencil-component#removed",
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
    expect(results[0].ruleId).toBe("BNR012");
    expect(results[0].message.text).toContain("Stencil component removed");
    expect(results[0].message.text).toContain("my-old-component");
  });

  test("should map stencil removed event to BNR012", () => {
    const findings: Finding[] = [
      {
        type: "stencil-event-change",
        kind: "stencil-event-change",
        category: "api",
        confidence: "high",
        evidence: [{ file: "src/components/button/button.tsx", excerpt: "" }],
        tag: "my-button",
        eventName: "myClick",
        change: "removed",
        file: "src/components/button/button.tsx",
        findingId: "finding.stencil-event#removed",
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
    expect(results[0].ruleId).toBe("BNR012");
    expect(results[0].message.text).toContain("Stencil event removed");
  });

  test("should map stencil removed method to BNR012", () => {
    const findings: Finding[] = [
      {
        type: "stencil-method-change",
        kind: "stencil-method-change",
        category: "api",
        confidence: "high",
        evidence: [{ file: "src/components/modal/modal.tsx", excerpt: "" }],
        tag: "my-modal",
        methodName: "open",
        change: "removed",
        file: "src/components/modal/modal.tsx",
        findingId: "finding.stencil-method#removed",
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
    expect(results[0].ruleId).toBe("BNR012");
    expect(results[0].message.text).toContain("Stencil method removed");
  });

  test("should map stencil removed slot to BNR012", () => {
    const findings: Finding[] = [
      {
        type: "stencil-slot-change",
        kind: "stencil-slot-change",
        category: "api",
        confidence: "high",
        evidence: [{ file: "src/components/card/card.tsx", excerpt: "" }],
        tag: "my-card",
        slotName: "header",
        change: "removed",
        file: "src/components/card/card.tsx",
        findingId: "finding.stencil-slot#removed",
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
    expect(results[0].ruleId).toBe("BNR012");
    expect(results[0].message.text).toContain('slot "header" removed');
  });

  test("should map breaking typescript-config to BNR013", () => {
    const findings: Finding[] = [
      {
        type: "typescript-config",
        kind: "typescript-config",
        category: "config_env",
        confidence: "high",
        evidence: [{ file: "tsconfig.json", excerpt: '"strict": true' }],
        file: "tsconfig.json",
        status: "modified",
        isBreaking: true,
        changedOptions: {
          added: ["strict"],
          removed: [],
          modified: [],
        },
        strictnessChanges: ["strict mode enabled"],
        findingId: "finding.typescript-config#breaking",
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
    expect(results[0].ruleId).toBe("BNR013");
    expect(results[0].level).toBe("warning");
    expect(results[0].message.text).toContain("Breaking TypeScript config");
  });

  test("should not map non-breaking typescript-config to SARIF", () => {
    const findings: Finding[] = [
      {
        type: "typescript-config",
        kind: "typescript-config",
        category: "config_env",
        confidence: "high",
        evidence: [{ file: "tsconfig.json", excerpt: "" }],
        file: "tsconfig.json",
        status: "modified",
        isBreaking: false,
        changedOptions: {
          added: [],
          removed: [],
          modified: ["target"],
        },
        strictnessChanges: [],
        findingId: "finding.typescript-config#safe",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map destructive sql-risk to BNR014 with error level", () => {
    const findings: Finding[] = [
      {
        type: "sql-risk",
        kind: "sql-risk",
        category: "database",
        confidence: "high",
        evidence: [
          {
            file: "migrations/drop_users.sql",
            excerpt: "DROP TABLE users;",
            line: 1,
          },
        ],
        file: "migrations/drop_users.sql",
        riskType: "destructive",
        details: "DROP TABLE detected",
        findingId: "finding.sql-risk#destructive",
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
    expect(results[0].ruleId).toBe("BNR014");
    expect(results[0].level).toBe("error");
    expect(results[0].message.text).toContain("Destructive SQL");
  });

  test("should not map schema_change sql-risk to SARIF", () => {
    const findings: Finding[] = [
      {
        type: "sql-risk",
        kind: "sql-risk",
        category: "database",
        confidence: "high",
        evidence: [{ file: "migrations/add_column.sql", excerpt: "" }],
        file: "migrations/add_column.sql",
        riskType: "schema_change",
        details: "ALTER TABLE detected",
        findingId: "finding.sql-risk#schema",
      },
    ];

    const facts: FactsOutput = {
      ...baseFactsOutput,
      findings,
    };

    const changeSet = createTestChangeSet();
    const sarif = renderSarif(facts, changeSet);

    expect(sarif.runs[0].results).toHaveLength(0);
  });

  test("should map infra-change to BNR015 with warning level", () => {
    const findings: Finding[] = [
      {
        type: "infra-change",
        kind: "infra-change",
        category: "infra",
        confidence: "high",
        evidence: [{ file: "Dockerfile", excerpt: "FROM node:20" }],
        infraType: "dockerfile",
        files: ["Dockerfile"],
        findingId: "finding.infra-change#docker",
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
    expect(results[0].ruleId).toBe("BNR015");
    expect(results[0].level).toBe("warning");
    expect(results[0].message.text).toContain("Dockerfile");
  });

  test("should map terraform infra-change to BNR015", () => {
    const findings: Finding[] = [
      {
        type: "infra-change",
        kind: "infra-change",
        category: "infra",
        confidence: "high",
        evidence: [{ file: "main.tf", excerpt: "" }],
        infraType: "terraform",
        files: ["main.tf", "variables.tf"],
        findingId: "finding.infra-change#tf",
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
    expect(results[0].ruleId).toBe("BNR015");
    expect(results[0].message.text).toContain("Terraform");
  });

  test("should map k8s infra-change to BNR015", () => {
    const findings: Finding[] = [
      {
        type: "infra-change",
        kind: "infra-change",
        category: "infra",
        confidence: "high",
        evidence: [{ file: "k8s/deployment.yaml", excerpt: "" }],
        infraType: "k8s",
        files: ["k8s/deployment.yaml"],
        findingId: "finding.infra-change#k8s",
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
    expect(results[0].ruleId).toBe("BNR015");
    expect(results[0].message.text).toContain("Kubernetes");
  });

  test("should map test-gap to BNR016 with note level", () => {
    const findings: Finding[] = [
      {
        type: "test-gap",
        kind: "test-gap",
        category: "tests",
        confidence: "high",
        evidence: [{ file: "src/utils.ts", excerpt: "" }],
        prodFilesChanged: 5,
        testFilesChanged: 0,
        findingId: "finding.test-gap#gap",
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
    expect(results[0].ruleId).toBe("BNR016");
    expect(results[0].level).toBe("note");
    expect(results[0].message.text).toContain("Test coverage gap");
    expect(results[0].message.text).toContain("5 production files");
  });

  test("should map large-diff to BNR017 with note level", () => {
    const findings: Finding[] = [
      {
        type: "large-diff",
        kind: "large-diff",
        category: "quality",
        confidence: "high",
        evidence: [{ file: "src/index.ts", excerpt: "" }],
        filesChanged: 50,
        linesChanged: 2500,
        findingId: "finding.large-diff#large",
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
    expect(results[0].ruleId).toBe("BNR017");
    expect(results[0].level).toBe("note");
    expect(results[0].message.text).toContain("Large diff");
    expect(results[0].message.text).toContain("50 files");
    expect(results[0].message.text).toContain("2500 lines");
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
      "BNR007",
      "BNR008",
      "BNR009",
      "BNR010",
      "BNR011",
      "BNR012",
      "BNR013",
      "BNR014",
      "BNR015",
      "BNR016",
      "BNR017",
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
