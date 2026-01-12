/**
 * Large diff analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeLargeDiff } from "../src/analyzers/large-diff.js";
import type { LargeDiffFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("analyzeLargeDiff", () => {
  describe("file count threshold", () => {
    it("should trigger when >30 files changed", () => {
      // Create 31 files
      const files = Array.from({ length: 31 }, (_, i) =>
        createFileChange(`src/file${i}.ts`, "modified")
      );

      const changeSet = createChangeSet({
        files,
        diffs: [],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LargeDiffFinding;
      expect(finding.type).toBe("large-diff");
      expect(finding.filesChanged).toBe(31);
    });

    it("should not trigger at exactly 30 files", () => {
      const files = Array.from({ length: 30 }, (_, i) =>
        createFileChange(`src/file${i}.ts`, "modified")
      );

      const changeSet = createChangeSet({
        files,
        diffs: [],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not trigger below 30 files", () => {
      const files = Array.from({ length: 15 }, (_, i) =>
        createFileChange(`src/file${i}.ts`, "modified")
      );

      const changeSet = createChangeSet({
        files,
        diffs: [],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("line count threshold", () => {
    it("should trigger when >1000 lines changed", () => {
      // Create diffs totaling more than 1000 lines
      const additions = Array.from({ length: 600 }, (_, i) => `line ${i}`);
      const deletions = Array.from({ length: 500 }, (_, i) => `old line ${i}`);

      const changeSet = createChangeSet({
        files: [createFileChange("src/big-file.ts", "modified")],
        diffs: [
          {
            path: "src/big-file.ts",
            status: "modified" as const,
            hunks: [
              {
                oldStart: 1,
                oldLines: 500,
                newStart: 1,
                newLines: 600,
                content: "@@ -1,500 +1,600 @@",
                additions,
                deletions,
              },
            ],
          },
        ],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LargeDiffFinding;
      expect(finding.type).toBe("large-diff");
      expect(finding.linesChanged).toBe(1100);
    });

    it("should not trigger at exactly 1000 lines", () => {
      const additions = Array.from({ length: 500 }, (_, i) => `line ${i}`);
      const deletions = Array.from({ length: 500 }, (_, i) => `old line ${i}`);

      const changeSet = createChangeSet({
        files: [createFileChange("src/file.ts", "modified")],
        diffs: [
          {
            path: "src/file.ts",
            status: "modified" as const,
            hunks: [
              {
                oldStart: 1,
                oldLines: 500,
                newStart: 1,
                newLines: 500,
                content: "@@ -1,500 +1,500 @@",
                additions,
                deletions,
              },
            ],
          },
        ],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should sum lines across multiple files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/file1.ts", "modified"),
          createFileChange("src/file2.ts", "modified"),
        ],
        diffs: [
          {
            path: "src/file1.ts",
            status: "modified" as const,
            hunks: [
              {
                oldStart: 1,
                oldLines: 300,
                newStart: 1,
                newLines: 300,
                content: "@@ -1,300 +1,300 @@",
                additions: Array.from({ length: 300 }, (_, i) => `line ${i}`),
                deletions: Array.from({ length: 300 }, (_, i) => `old ${i}`),
              },
            ],
          },
          {
            path: "src/file2.ts",
            status: "modified" as const,
            hunks: [
              {
                oldStart: 1,
                oldLines: 250,
                newStart: 1,
                newLines: 250,
                content: "@@ -1,250 +1,250 @@",
                additions: Array.from({ length: 250 }, (_, i) => `line ${i}`),
                deletions: Array.from({ length: 250 }, (_, i) => `old ${i}`),
              },
            ],
          },
        ],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LargeDiffFinding;
      expect(finding.linesChanged).toBe(1100); // 600 + 500
    });
  });

  describe("combined thresholds", () => {
    it("should trigger on files even with few lines", () => {
      const files = Array.from({ length: 35 }, (_, i) =>
        createFileChange(`src/file${i}.ts`, "modified")
      );

      const changeSet = createChangeSet({
        files,
        diffs: [
          createFileDiff("src/file0.ts", ["const x = 1;"], [], "modified"),
        ],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LargeDiffFinding;
      expect(finding.filesChanged).toBe(35);
      expect(finding.linesChanged).toBe(1); // Just the one line
    });

    it("should trigger on lines even with few files", () => {
      const additions = Array.from({ length: 600 }, (_, i) => `line ${i}`);
      const deletions = Array.from({ length: 500 }, (_, i) => `old line ${i}`);

      const changeSet = createChangeSet({
        files: [createFileChange("src/massive.ts", "modified")],
        diffs: [
          {
            path: "src/massive.ts",
            status: "modified" as const,
            hunks: [
              {
                oldStart: 1,
                oldLines: 500,
                newStart: 1,
                newLines: 600,
                content: "@@ -1,500 +1,600 @@",
                additions,
                deletions,
              },
            ],
          },
        ],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LargeDiffFinding;
      expect(finding.filesChanged).toBe(1);
      expect(finding.linesChanged).toBe(1100);
    });
  });

  describe("small changes", () => {
    it("should return empty for small changes", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/index.ts", "modified"),
          createFileChange("src/utils.ts", "added"),
        ],
        diffs: [
          createFileDiff("src/index.ts", ["export const x = 1;"], [], "modified"),
          createFileDiff("src/utils.ts", ["export const y = 2;"], [], "added"),
        ],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should return empty for empty changesets", () => {
      const changeSet = createChangeSet({
        files: [],
        diffs: [],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("finding properties", () => {
    it("should include correct category and confidence", () => {
      const files = Array.from({ length: 50 }, (_, i) =>
        createFileChange(`src/file${i}.ts`, "modified")
      );

      const changeSet = createChangeSet({
        files,
        diffs: [],
      });

      const findings = analyzeLargeDiff.analyze(changeSet);
      const finding = findings[0] as LargeDiffFinding;

      expect(finding.kind).toBe("large-diff");
      expect(finding.confidence).toBe("high");
    });
  });
});
