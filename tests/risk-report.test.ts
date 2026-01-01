/**
 * Risk report tests.
 */

import { describe, expect, it } from "vitest";
import { generateRiskReport } from "../src/risk/index.js";
import { createChangeSet } from "./fixtures/index.js";

describe("generateRiskReport", () => {
  it("should generate empty report for no changes", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [],
      diffs: [],
    });

    const report = generateRiskReport(changeSet);

    expect(report.schemaVersion).toBe("1.0");
    expect(report.riskScore).toBe(0);
    expect(report.riskLevel).toBe("low");
    expect(report.flags).toEqual([]);
  });

  it("should compute risk scores correctly", () => {
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

    const report = generateRiskReport(changeSet);

    expect(report.flags.length).toBeGreaterThan(0);
    expect(report.riskScore).toBeGreaterThan(0);
    
    // Check that security flag was detected
    const securityFlag = report.flags.find(f => f.id === "security.workflow_permissions_broadened");
    expect(securityFlag).toBeDefined();
    expect(securityFlag?.score).toBe(35);
    expect(securityFlag?.confidence).toBe(0.9);
  });

  it("should filter by category with --only", () => {
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

    const report = generateRiskReport(changeSet, { only: ["security"] });

    expect(report.flags.every(f => f.category === "security")).toBe(true);
    expect(report.flags.find(f => f.category === "db")).toBeUndefined();
  });

  it("should exclude categories with --exclude", () => {
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

    const report = generateRiskReport(changeSet, { exclude: ["ci"] });

    expect(report.flags.find(f => f.category === "ci")).toBeUndefined();
  });

  it("should track skipped files", () => {
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [
        { path: "package-lock.json", status: "modified" },
        { path: "src/index.ts", status: "modified" },
      ],
      diffs: [],
    });

    const report = generateRiskReport(changeSet);

    expect(report.skippedFiles.length).toBeGreaterThan(0);
    const lockfileSkip = report.skippedFiles.find(s => s.file === "package-lock.json");
    expect(lockfileSkip).toBeDefined();
    expect(lockfileSkip?.reason).toBe("lockfile");
  });

  it("should include score breakdown when explainScore is true", () => {
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

    const report = generateRiskReport(changeSet, { explainScore: true });

    expect(report.scoreBreakdown).toBeDefined();
    expect(report.scoreBreakdown?.formula).toContain("riskScore");
    expect(report.scoreBreakdown?.maxCategory).toBeDefined();
  });
});

describe("risk level thresholds", () => {
  it("should classify risk levels correctly", () => {
    // This would require creating fixtures that produce specific scores
    // For now, we test the basic logic
    const changeSet = createChangeSet({
      base: "main",
      head: "HEAD",
      files: [],
      diffs: [],
    });

    const report = generateRiskReport(changeSet);
    
    // Score of 0 should be "low"
    expect(report.riskLevel).toBe("low");
  });
});
