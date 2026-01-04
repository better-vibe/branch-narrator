/**
 * Detector tests for risk-report.
 */

import { describe, expect, it } from "bun:test";
import { createChangeSet } from "./fixtures/index.js";
import {
  detectWorkflowPermissionsBroadened,
  detectPullRequestTarget,
  detectRemoteScriptDownload,
  detectCIPipelineChanged,
} from "../src/risk/detectors/security-ci.js";
import {
  detectNewProdDependency,
  detectMajorBump,
  detectLockfileWithoutManifest,
} from "../src/risk/detectors/deps.js";
import {
  detectMigrationsChanged,
  detectDestructiveSQL,
  detectRiskySchemaChange,
  detectUnscopedDataModification,
} from "../src/risk/detectors/database.js";
import { detectLargeDiff } from "../src/risk/detectors/churn.js";
import { detectPossibleTestGap } from "../src/risk/detectors/tests.js";

describe("Security/CI Detectors", () => {
  it("should detect workflow permissions broadened", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: ".github/workflows/ci.yml", status: "modified" }],
      diffs: [
        {
          path: ".github/workflows/ci.yml",
          status: "modified",
          hunks: [
            {
              oldStart: 10,
              oldLines: 3,
              newStart: 10,
              newLines: 5,
              content: `@@ -10,3 +10,5 @@
 jobs:
+  permissions:
+    contents: write
   build:`,
              additions: ["  permissions:", "    contents: write"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const flags = detectWorkflowPermissionsBroadened(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("security.workflow_permissions_broadened");
    expect(flags[0].score).toBe(35);
    expect(flags[0].confidence).toBe(0.9);
    expect(flags[0].effectiveScore).toBe(32); // round(35 * 0.9) = round(31.5) = 32
  });

  it("should detect pull_request_target", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: ".github/workflows/pr.yml", status: "modified" }],
      diffs: [
        {
          path: ".github/workflows/pr.yml",
          status: "modified",
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 2,
              content: "+on: pull_request_target",
              additions: ["on: pull_request_target"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const flags = detectPullRequestTarget(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("security.workflow_uses_pull_request_target");
    expect(flags[0].score).toBe(40);
  });

  it("should detect remote script download", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: ".github/workflows/deploy.yml", status: "modified" }],
      diffs: [
        {
          path: ".github/workflows/deploy.yml",
          status: "modified",
          hunks: [
            {
              oldStart: 20,
              oldLines: 1,
              newStart: 20,
              newLines: 2,
              content: "+  run: curl https://install.sh | bash",
              additions: ["  run: curl https://install.sh | bash"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const flags = detectRemoteScriptDownload(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("security.workflow_downloads_remote_script");
    expect(flags[0].score).toBe(45);
  });

  it("should detect CI pipeline changed", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: ".github/workflows/ci.yml", status: "modified" },
        { path: ".gitlab-ci.yml", status: "modified" },
      ],
      diffs: [],
    });

    const flags = detectCIPipelineChanged(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("ci.pipeline_changed");
    expect(flags[0].category).toBe("ci");
  });
});

describe("Dependency Detectors", () => {
  it("should detect new production dependency", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: "package.json", status: "modified" }],
      diffs: [],
      basePackageJson: {
        dependencies: {},
      },
      headPackageJson: {
        dependencies: {
          "lodash": "^4.17.21",
          "axios": "^1.0.0",
        },
      },
    });

    const flags = detectNewProdDependency(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("deps.new_prod_dependency");
    expect(flags[0].summary).toContain("2 new production dependencies");
  });

  it("should detect major version bump", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: "package.json", status: "modified" }],
      diffs: [],
      basePackageJson: {
        dependencies: {
          "react": "^17.0.0",
        },
        devDependencies: {
          "typescript": "^4.0.0",
        },
      },
      headPackageJson: {
        dependencies: {
          "react": "^18.0.0",
        },
        devDependencies: {
          "typescript": "^5.0.0",
        },
      },
    });

    const flags = detectMajorBump(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("deps.major_bump");
    expect(flags[0].summary).toContain("2 major version bumps");
    expect(flags[0].score).toBe(25); // Has runtime bumps
  });

  it("should detect lockfile changed without manifest", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: "package-lock.json", status: "modified" },
      ],
      diffs: [],
    });

    const flags = detectLockfileWithoutManifest(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("deps.lockfile_changed_without_manifest");
  });
});

describe("Database Detectors", () => {
  it("should detect migrations changed", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: "migrations/001_create_users.sql", status: "added" },
      ],
      diffs: [],
    });

    const flags = detectMigrationsChanged(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("db.migrations_changed");
  });

  it("should detect destructive SQL", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: "migrations/002_cleanup.sql", status: "added" }],
      diffs: [
        {
          path: "migrations/002_cleanup.sql",
          status: "added",
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 2,
              content: "+DROP TABLE old_users;\n+TRUNCATE sessions;",
              additions: ["DROP TABLE old_users;", "TRUNCATE sessions;"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const flags = detectDestructiveSQL(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("db.destructive_sql");
    expect(flags[0].score).toBe(45);
  });

  it("should detect risky schema changes", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: "migrations/003_alter.sql", status: "added" }],
      diffs: [
        {
          path: "migrations/003_alter.sql",
          status: "added",
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 1,
              content: "+ALTER TABLE users ALTER COLUMN email TYPE varchar(500);",
              additions: ["ALTER TABLE users ALTER COLUMN email TYPE varchar(500);"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const flags = detectRiskySchemaChange(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("db.schema_change_risky");
  });

  it("should detect unscoped data modification", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: "migrations/004_update.sql", status: "added" }],
      diffs: [
        {
          path: "migrations/004_update.sql",
          status: "added",
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 1,
              content: "+DELETE FROM sessions;",
              additions: ["DELETE FROM sessions;"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const flags = detectUnscopedDataModification(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("db.data_modification_unscoped");
  });
});

describe("Churn Detector", () => {
  it("should detect large diff by file count", () => {
    const files = Array.from({ length: 60 }, (_, i) => ({
      path: `src/file${i}.ts`,
      status: "modified" as const,
    }));

    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files,
      diffs: [],
    });

    const flags = detectLargeDiff(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("churn.large_diff");
    expect(flags[0].summary).toContain("60 files");
  });

  it("should detect large diff by line count", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [{ path: "src/big.ts", status: "modified" }],
      diffs: [
        {
          path: "src/big.ts",
          status: "modified",
          hunks: [
            {
              oldStart: 1,
              oldLines: 1000,
              newStart: 1,
              newLines: 1000,
              content: "...",
              additions: Array(1000).fill("+ line"),
              deletions: Array(600).fill("- line"),
            },
          ],
        },
      ],
    });

    const flags = detectLargeDiff(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].summary).toContain("1600 lines");
  });
});

describe("Test Detector", () => {
  it("should detect possible test gap", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: "lib/utils.ts", status: "modified" },
        { path: "app/api.ts", status: "modified" },
      ],
      diffs: [],
    });

    const flags = detectPossibleTestGap(changeSet);

    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("tests.possible_gap");
    expect(flags[0].summary).toContain("2 code files changed");
  });

  it("should not flag test gap when tests are changed", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: "lib/utils.ts", status: "modified" },
        { path: "tests/utils.test.ts", status: "modified" },
      ],
      diffs: [],
    });

    const flags = detectPossibleTestGap(changeSet);

    expect(flags).toHaveLength(0);
  });
});
