/**
 * Tests for the Drizzle ORM analyzer.
 */

import { describe, it, expect } from "bun:test";
import { drizzleAnalyzer, isDrizzleSchema, isDrizzleMigration, isDrizzleConfig } from "../src/analyzers/drizzle.js";
import type { ChangeSet, FileDiff, DrizzleSchemaFinding } from "../src/core/types.js";

function createChangeSet(diffs: FileDiff[], packageJson?: Record<string, unknown> | null): ChangeSet {
  return {
    base: "main",
    head: "feature",
    files: diffs.map((d) => ({
      path: d.path,
      status: d.status,
      oldPath: d.oldPath,
    })),
    diffs,
    headPackageJson: packageJson || undefined,
  };
}

function createFileDiff(path: string, content: string, status: "added" | "modified" | "deleted" = "modified"): FileDiff {
  return {
    path,
    status,
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: content.split("\n").length,
        content,
        additions: content.split("\n"),
        deletions: [],
      },
    ],
  };
}

describe("drizzleAnalyzer", () => {
  describe("file pattern detection", () => {
    it("detects schema.ts files", () => {
      expect(isDrizzleSchema("db/schema.ts")).toBe(true);
      expect(isDrizzleSchema("src/db/schema.ts")).toBe(true);
      expect(isDrizzleSchema("app/users.schema.ts")).toBe(true);
      expect(isDrizzleSchema("db/schema.js")).toBe(false);
      expect(isDrizzleSchema("random.ts")).toBe(false);
    });

    it("detects migration SQL files", () => {
      expect(isDrizzleMigration("drizzle/migrations/0001_init.sql")).toBe(true);
      expect(isDrizzleMigration("db/drizzle/migrations/0002_add_users.sql")).toBe(true);
      expect(isDrizzleMigration("migrations/0001_init.sql")).toBe(false);
    });

    it("detects config files", () => {
      expect(isDrizzleConfig("drizzle.config.ts")).toBe(true);
      expect(isDrizzleConfig("drizzle.config.js")).toBe(true);
      expect(isDrizzleConfig("drizzle.config.mjs")).toBe(true);
      expect(isDrizzleConfig("config.ts")).toBe(false);
    });
  });

  describe("schema analysis", () => {
    it("detects added tables", async () => {
      const content = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  name: text("name"),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  userId: integer("user_id").references(() => users.id),
});
`;
      const diff = createFileDiff("db/schema.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "drizzle-orm": "^0.30.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("drizzle-schema");
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.addedTables).toContain("users");
      expect(finding.addedTables).toContain("posts");
      expect(finding.isBreaking).toBe(false);
    });

    it("detects removed tables as breaking", async () => {
      const content = `export const oldTable = pgTable("old_table", { id: serial("id").primaryKey() });`;
      const diff: FileDiff = {
        path: "db/schema.ts",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "drizzle-orm": "^0.30.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("drizzle-schema");
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.removedTables).toContain("old_table");
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingChanges.some((bc: string) => bc.includes("old_table"))).toBe(true);
    });

    it("detects modified tables", async () => {
      const baseContent = `export const users = pgTable("users", { id: serial("id").primaryKey() });`;
      const headContent = `export const users = pgTable("users", { id: serial("id").primaryKey(), email: varchar("email").notNull() });`;

      const diff: FileDiff = {
        path: "db/schema.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "drizzle-orm": "^0.30.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.modifiedTables).toContain("users");
    });

    it("skips non-Drizzle projects without Drizzle files", async () => {
      const content = `export const data = { id: 1 };`;
      const diff = createFileDiff("src/data.ts", content);
      const changeSet = createChangeSet([diff], {
        dependencies: {},
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("processes Drizzle files even without dependency detection", async () => {
      const content = `export const users = pgTable("users", { id: serial("id").primaryKey() });`;
      const diff = createFileDiff("db/schema.ts", content);
      const changeSet = createChangeSet([diff], null);

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.addedTables).toContain("users");
    });
  });

  describe("migration analysis", () => {
    it("detects destructive migration operations", async () => {
      const content = `
DROP TABLE users;
ALTER TABLE posts DROP COLUMN title;
`;
      const diff = createFileDiff("drizzle/migrations/0001_destructive.sql", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { "drizzle-kit": "^0.20.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("drizzle-schema");
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.isBreaking).toBe(true);
      expect(finding.tags).toContain("destructive");
      expect(finding.breakingChanges.some((bc: string) => bc.includes("DROP TABLE"))).toBe(true);
    });

    it("ignores safe migrations", async () => {
      const content = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
`;
      const diff = createFileDiff("drizzle/migrations/0001_init.sql", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "drizzle-orm": "^0.30.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });
  });

  describe("config file analysis", () => {
    it("detects drizzle config changes", async () => {
      const content = `
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
});
`;
      const diff = createFileDiff("drizzle.config.ts", content, "modified");
      const changeSet = createChangeSet([diff], {
        devDependencies: { "drizzle-kit": "^0.20.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("drizzle-schema");
      expect(findings[0].tags).toContain("drizzle-config");
    });
  });

  describe("breaking change detection", () => {
    it("detects removed columns", async () => {
      const deletions = [
        "email: varchar(\"email\", { length: 255 }).notNull(),",
      ];
      const diff: FileDiff = {
        path: "db/schema.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 0,
            content: "",
            additions: [],
            deletions,
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "drizzle-orm": "^0.30.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.breakingChanges.some((bc: string) => bc.includes("Columns"))).toBe(true);
    });

    it("detects removed unique constraints", async () => {
      const deletions = ['.unique("email"),'];
      const diff: FileDiff = {
        path: "db/schema.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 0,
            content: "",
            additions: [],
            deletions,
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "drizzle-orm": "^0.30.0" },
      });

      const findings = await drizzleAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as DrizzleSchemaFinding;
      expect(finding.breakingChanges.some((bc: string) => bc.includes("Unique constraint"))).toBe(true);
    });
  });
});
