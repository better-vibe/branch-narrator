/**
 * Tests for Python migrations analyzer.
 */

import { describe, it, expect } from "bun:test";
import {
  pythonMigrationsAnalyzer,
  isAlembicMigration,
  isDjangoMigration,
  detectMigrationTool,
} from "../src/analyzers/python-migrations.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("pythonMigrationsAnalyzer", () => {
  describe("isAlembicMigration", () => {
    it("should detect Alembic migration files", () => {
      expect(isAlembicMigration("alembic/versions/abc123_initial.py")).toBe(true);
      expect(isAlembicMigration("migrations/versions/abc123_add_users.py")).toBe(true);
      expect(isAlembicMigration("db/versions/001_create_tables.py")).toBe(true);
    });

    it("should not detect non-Alembic files", () => {
      expect(isAlembicMigration("alembic/env.py")).toBe(false);
      expect(isAlembicMigration("migrations/models.py")).toBe(false);
    });
  });

  describe("isDjangoMigration", () => {
    it("should detect Django migration files", () => {
      expect(isDjangoMigration("myapp/migrations/0001_initial.py")).toBe(true);
      expect(isDjangoMigration("users/migrations/0002_add_email.py")).toBe(true);
    });

    it("should not detect non-Django migration files", () => {
      expect(isDjangoMigration("myapp/migrations/__init__.py")).toBe(false);
      expect(isDjangoMigration("myapp/models.py")).toBe(false);
    });
  });

  describe("detectMigrationTool", () => {
    it("should detect Alembic", () => {
      expect(detectMigrationTool("alembic/versions/abc.py")).toBe("alembic");
    });

    it("should detect Django", () => {
      expect(detectMigrationTool("myapp/migrations/0001_initial.py")).toBe("django");
    });

    it("should return null for non-migration files", () => {
      expect(detectMigrationTool("models.py")).toBe(null);
    });
  });

  describe("analyze - Alembic", () => {
    it("should detect Alembic migrations", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("alembic/versions/abc123_initial.py", "added")],
        diffs: [
          createFileDiff(
            "alembic/versions/abc123_initial.py",
            [
              "def upgrade():",
              "    op.create_table('users',",
              "        sa.Column('id', sa.Integer(), primary_key=True),",
              "    )",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect(findings[0].type).toBe("python-migration");
      expect((findings[0] as any).tool).toBe("alembic");
      expect((findings[0] as any).risk).toBe("medium");
    });

    it("should detect high-risk Alembic migrations with drop_table", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("alembic/versions/xyz789_drop.py", "added")],
        diffs: [
          createFileDiff(
            "alembic/versions/xyz789_drop.py",
            [
              "def upgrade():",
              "    op.drop_table('old_users')",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(2); // Migration finding + risk flag
      expect((findings[0] as any).risk).toBe("high");
      expect((findings[0] as any).reasons).toContain("drop_table detected in alembic/versions/xyz789_drop.py");
      expect(findings[1].type).toBe("risk-flag");
    });

    it("should detect high-risk Alembic migrations with drop_column", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("alembic/versions/drop_col.py", "added")],
        diffs: [
          createFileDiff(
            "alembic/versions/drop_col.py",
            [
              "def upgrade():",
              "    op.drop_column('users', 'legacy_field')",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect((findings[0] as any).risk).toBe("high");
    });
  });

  describe("analyze - Django", () => {
    it("should detect Django migrations", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("myapp/migrations/0001_initial.py", "added")],
        diffs: [
          createFileDiff(
            "myapp/migrations/0001_initial.py",
            [
              "class Migration(migrations.Migration):",
              "    operations = [",
              "        migrations.CreateModel(",
              "            name='User',",
              "        ),",
              "    ]",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect(findings[0].type).toBe("python-migration");
      expect((findings[0] as any).tool).toBe("django");
    });

    it("should detect high-risk Django migrations with DeleteModel", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("myapp/migrations/0002_delete.py", "added")],
        diffs: [
          createFileDiff(
            "myapp/migrations/0002_delete.py",
            [
              "class Migration(migrations.Migration):",
              "    operations = [",
              "        migrations.DeleteModel(",
              "            name='OldModel',",
              "        ),",
              "    ]",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect((findings[0] as any).risk).toBe("high");
    });

    it("should detect high-risk Django migrations with RemoveField", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("myapp/migrations/0003_remove.py", "added")],
        diffs: [
          createFileDiff(
            "myapp/migrations/0003_remove.py",
            [
              "class Migration(migrations.Migration):",
              "    operations = [",
              "        migrations.RemoveField(",
              "            model_name='user',",
              "            name='old_field',",
              "        ),",
              "    ]",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect((findings[0] as any).risk).toBe("high");
    });
  });

  describe("analyze - mixed", () => {
    it("should detect both Alembic and Django migrations", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("alembic/versions/abc.py", "added"),
          createFileChange("myapp/migrations/0001_initial.py", "added"),
        ],
        diffs: [
          createFileDiff(
            "alembic/versions/abc.py",
            ["op.create_table('table1')"],
            [],
            "added"
          ),
          createFileDiff(
            "myapp/migrations/0001_initial.py",
            ["migrations.CreateModel(name='Model1')"],
            [],
            "added"
          ),
        ],
      });

      const findings = pythonMigrationsAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(2);
      const tools = findings.map((f: any) => f.tool);
      expect(tools).toContain("alembic");
      expect(tools).toContain("django");
    });
  });
});
