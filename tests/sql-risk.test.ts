/**
 * Supabase SQL risk scanning tests.
 */

import { describe, expect, it } from "bun:test";
import {
  determineMigrationRisk,
  isMigrationFile,
  isSeedOrConfig,
  scanForDestructivePatterns,
  supabaseAnalyzer,
} from "../src/analyzers/supabase.js";
import type { DbMigrationFinding, RiskFlagFinding } from "../src/core/types.js";
import {
  createChangeSet,
  createFileChange,
  createFileDiff,
  sampleMigrations,
} from "./fixtures/index.js";

describe("isMigrationFile", () => {
  it("should identify migration files", () => {
    expect(isMigrationFile("supabase/migrations/20240101_init.sql")).toBe(true);
    expect(isMigrationFile("supabase/migrations/001_users.sql")).toBe(true);
  });

  it("should reject non-migration files", () => {
    expect(isMigrationFile("supabase/seed.sql")).toBe(false);
    expect(isMigrationFile("migrations/001.sql")).toBe(false);
    expect(isMigrationFile("supabase/config.toml")).toBe(false);
  });
});

describe("isSeedOrConfig", () => {
  it("should identify seed files", () => {
    expect(isSeedOrConfig("supabase/seed.sql")).toBe(true);
    expect(isSeedOrConfig("supabase/seed/users.sql")).toBe(true);
  });

  it("should identify config files", () => {
    expect(isSeedOrConfig("supabase/config.toml")).toBe(true);
  });
});

describe("scanForDestructivePatterns", () => {
  it("should detect DROP TABLE", () => {
    const matches = scanForDestructivePatterns(sampleMigrations.dropTable);
    expect(matches.some((m) => m.description === "DROP TABLE")).toBe(true);
  });

  it("should detect DROP COLUMN", () => {
    const matches = scanForDestructivePatterns(sampleMigrations.dropColumn);
    expect(matches.some((m) => m.description === "DROP COLUMN")).toBe(true);
  });

  it("should detect TRUNCATE", () => {
    const matches = scanForDestructivePatterns(sampleMigrations.truncate);
    expect(matches.some((m) => m.description === "TRUNCATE")).toBe(true);
  });

  it("should detect DELETE without WHERE", () => {
    const matches = scanForDestructivePatterns(
      sampleMigrations.deleteWithoutWhere
    );
    expect(matches.some((m) => m.description === "DELETE without WHERE")).toBe(
      true
    );
  });

  it("should NOT flag DELETE with WHERE", () => {
    const matches = scanForDestructivePatterns(sampleMigrations.deleteWithWhere);
    expect(matches.some((m) => m.description === "DELETE without WHERE")).toBe(
      false
    );
  });

  it("should detect ALTER TYPE", () => {
    const matches = scanForDestructivePatterns(sampleMigrations.alterType);
    expect(matches.some((m) => m.description === "ALTER TYPE")).toBe(true);
  });

  it("should return empty for safe migrations", () => {
    const matches = scanForDestructivePatterns(sampleMigrations.safe);
    expect(matches).toHaveLength(0);
  });
});

describe("determineMigrationRisk", () => {
  it("should return high risk for destructive patterns", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "supabase/migrations/001.sql",
          sampleMigrations.dropTable.split("\n"),
          [],
          "added"
        ),
      ],
    });

    const result = determineMigrationRisk(
      ["supabase/migrations/001.sql"],
      changeSet
    );

    expect(result.risk).toBe("high");
    expect(result.reasons.some((r) => r.includes("DROP TABLE"))).toBe(true);
  });

  it("should return medium risk for safe migrations", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "supabase/migrations/001.sql",
          sampleMigrations.safe.split("\n"),
          [],
          "added"
        ),
      ],
    });

    const result = determineMigrationRisk(
      ["supabase/migrations/001.sql"],
      changeSet
    );

    expect(result.risk).toBe("medium");
  });

  it("should return low risk for only seed files", () => {
    const result = determineMigrationRisk(
      ["supabase/seed.sql"],
      createChangeSet()
    );

    expect(result.risk).toBe("low");
    expect(result.reasons).toContain("Only seed/config files changed");
  });
});

describe("supabaseAnalyzer", () => {
  it("should detect migration files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("supabase/migrations/001.sql", "added"),
      ],
      diffs: [
        createFileDiff(
          "supabase/migrations/001.sql",
          sampleMigrations.safe.split("\n"),
          [],
          "added"
        ),
      ],
    });

    const findings = supabaseAnalyzer.analyze(changeSet);
    const migrationFinding = findings.find(
      (f) => f.type === "db-migration"
    ) as DbMigrationFinding;

    expect(migrationFinding).toBeDefined();
    expect(migrationFinding.tool).toBe("supabase");
    expect(migrationFinding.files).toContain("supabase/migrations/001.sql");
  });

  it("should emit risk flag for high risk", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("supabase/migrations/001.sql", "added")],
      diffs: [
        createFileDiff(
          "supabase/migrations/001.sql",
          sampleMigrations.dropTable.split("\n"),
          [],
          "added"
        ),
      ],
    });

    const findings = supabaseAnalyzer.analyze(changeSet);
    const riskFinding = findings.find(
      (f) => f.type === "risk-flag"
    ) as RiskFlagFinding;

    expect(riskFinding).toBeDefined();
    expect(riskFinding.risk).toBe("high");
    expect(riskFinding.evidenceText).toContain("Destructive SQL");
  });

  it("should return empty for no supabase files", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/lib/utils.ts", "modified")],
    });

    const findings = supabaseAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });
});

