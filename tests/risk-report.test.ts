/**
 * Risk report tests.
 */

import { describe, expect, it } from "bun:test";
import { generateRiskReport } from "../src/commands/risk/index.js";
import { createChangeSet } from "./fixtures/index.js";

describe("generateRiskReport", () => {
  it("should generate empty report for no changes", async () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [],
      diffs: [],
    });

    const report = await generateRiskReport(changeSet);

    expect(report.schemaVersion).toBe("2.0");
    expect(report.riskScore).toBe(0);
    expect(report.riskLevel).toBe("low");
    expect(report.flags).toEqual([]);
  });

  it("should compute risk scores correctly", async () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: ".github/workflows/ci.yml", status: "modified" },
      ],
      diffs: [
        {
          path: ".github/workflows/ci.yml",
          status: "modified",
          hunks: [
            {
              oldStart: 10,
              oldLines: 5,
              newStart: 10,
              newLines: 7,
              content: `@@ -10,5 +10,7 @@
 - name: Test
+  permissions:
+    contents: write
   run: npm test`,
              additions: ["  permissions:", "    contents: write"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const report = await generateRiskReport(changeSet);

    expect(report.flags.length).toBeGreaterThan(0);
    expect(report.riskScore).toBeGreaterThan(0);
    
    // Check that security flag was detected
    const securityFlag = report.flags.find(f => f.ruleKey === "security.workflow_permissions_broadened");
    expect(securityFlag).toBeDefined();
    expect(securityFlag?.score).toBe(35);
    expect(securityFlag?.confidence).toBe(0.9);
  });

  it("should filter by category with --only", async () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: ".github/workflows/ci.yml", status: "modified" },
        { path: "migrations/001.sql", status: "added" },
      ],
      diffs: [
        {
          path: ".github/workflows/ci.yml",
          status: "modified",
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 2,
              content: "+ on: pull_request_target",
              additions: ["on: pull_request_target"],
              deletions: [],
            },
          ],
        },
        {
          path: "migrations/001.sql",
          status: "added",
          hunks: [],
        },
      ],
    });

    const report = await generateRiskReport(changeSet, { only: ["security"] });

    expect(report.flags.every(f => f.category === "security")).toBe(true);
    expect(report.flags.find(f => f.category === "db")).toBeUndefined();
  });

  it("should exclude categories with --exclude", async () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: ".github/workflows/ci.yml", status: "modified" },
        { path: "migrations/001.sql", status: "added" },
      ],
      diffs: [
        {
          path: ".github/workflows/ci.yml",
          status: "modified",
          hunks: [],
        },
        {
          path: "migrations/001.sql",
          status: "added",
          hunks: [],
        },
      ],
    });

    const report = await generateRiskReport(changeSet, { exclude: ["ci"] });

    expect(report.flags.find(f => f.category === "ci")).toBeUndefined();
  });

  it("should track skipped files", async () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: "package-lock.json", status: "modified" },
        { path: "src/index.ts", status: "modified" },
      ],
      diffs: [],
    });

    const report = await generateRiskReport(changeSet);

    expect(report.skippedFiles.length).toBeGreaterThan(0);
    const lockfileSkip = report.skippedFiles.find(s => s.file === "package-lock.json");
    expect(lockfileSkip).toBeDefined();
    expect(lockfileSkip?.reason).toBe("lockfile");
  });

  it("should include score breakdown when explainScore is true", async () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: ".github/workflows/ci.yml", status: "modified" },
      ],
      diffs: [
        {
          path: ".github/workflows/ci.yml",
          status: "modified",
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 2,
              content: "+ on: pull_request_target",
              additions: ["on: pull_request_target"],
              deletions: [],
            },
          ],
        },
      ],
    });

    const report = await generateRiskReport(changeSet, { explainScore: true });

    expect(report.scoreBreakdown).toBeDefined();
    expect(report.scoreBreakdown?.formula).toContain("riskScore");
    expect(report.scoreBreakdown?.maxCategory).toBeDefined();
  });
});

describe("risk level thresholds", () => {
  it("should classify risk levels correctly", async () => {
    // This would require creating fixtures that produce specific scores
    // For now, we test the basic logic
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [],
      diffs: [],
    });

    const report = await generateRiskReport(changeSet);
    
    // Score of 0 should be "low"
    expect(report.riskLevel).toBe("low");
  });
});
