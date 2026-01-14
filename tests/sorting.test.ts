/**
 * Tests for sorting utilities.
 */

import { describe, expect, it } from "bun:test";
import {
  normalizePath,
  comparePaths,
  sortRiskFlags,
  sortFindings,
  sortEvidence,
  sortRiskFlagEvidence,
  sortFilePaths,
  createSortedObject,
} from "../src/core/sorting.js";
import type { RiskFlag, Finding, Evidence, RiskFlagEvidence } from "../src/core/types.js";

describe("Sorting Utilities", () => {
  describe("normalizePath", () => {
    it("should convert backslashes to forward slashes", () => {
      expect(normalizePath("src\\test\\file.ts")).toBe("src/test/file.ts");
    });

    it("should lowercase the path", () => {
      expect(normalizePath("Src/Test/FILE.ts")).toBe("src/test/file.ts");
    });

    it("should handle mixed separators", () => {
      expect(normalizePath("Src\\Test/FILE.ts")).toBe("src/test/file.ts");
    });
  });

  describe("comparePaths", () => {
    it("should sort paths lexicographically", () => {
      const paths = ["src/z.ts", "src/a.ts", "src/m.ts"];
      paths.sort(comparePaths);
      expect(paths).toEqual(["src/a.ts", "src/m.ts", "src/z.ts"]);
    });

    it("should be case-insensitive", () => {
      const paths = ["Src/B.ts", "src/a.ts", "SRC/c.ts"];
      paths.sort(comparePaths);
      expect(paths).toEqual(["src/a.ts", "Src/B.ts", "SRC/c.ts"]);
    });
  });

  describe("sortRiskFlags", () => {
    it("should sort by category ascending", () => {
      const flags: RiskFlag[] = [
        {
          ruleKey: "test-1",
          flagId: "flag.test-1#000000000000",
          relatedFindingIds: ["finding.test#000000000000"],
          category: "security",
          title: "Test 1",
          summary: "Summary 1",
          score: 50,
          confidence: 0.8,
          effectiveScore: 40,
          evidence: [],
          suggestedChecks: [],
        },
        {
          ruleKey: "test-2",
          flagId: "flag.test-2#000000000000",
          relatedFindingIds: ["finding.test#000000000000"],
          category: "deps",
          title: "Test 2",
          summary: "Summary 2",
          score: 50,
          confidence: 0.8,
          effectiveScore: 40,
          evidence: [],
          suggestedChecks: [],
        },
      ];

      const sorted = sortRiskFlags(flags);
      expect(sorted[0]!.category).toBe("deps");
      expect(sorted[1]!.category).toBe("security");
    });

    it("should sort by effectiveScore descending within same category", () => {
      const flags: RiskFlag[] = [
        {
          ruleKey: "test-1",
          flagId: "flag.test-1#000000000000",
          relatedFindingIds: ["finding.test#000000000000"],
          category: "security",
          title: "Test 1",
          summary: "Summary 1",
          score: 50,
          confidence: 0.5,
          effectiveScore: 25,
          evidence: [],
          suggestedChecks: [],
        },
        {
          ruleKey: "test-2",
          flagId: "flag.test-2#000000000000",
          relatedFindingIds: ["finding.test#000000000000"],
          category: "security",
          title: "Test 2",
          summary: "Summary 2",
          score: 50,
          confidence: 0.9,
          effectiveScore: 45,
          evidence: [],
          suggestedChecks: [],
        },
      ];

      const sorted = sortRiskFlags(flags);
      expect(sorted[0]!.effectiveScore).toBe(45);
      expect(sorted[1]!.effectiveScore).toBe(25);
    });

    it("should sort by ruleKey ascending as final tiebreaker", () => {
      const flags: RiskFlag[] = [
        {
          ruleKey: "test-z",
          flagId: "flag.test-z#000000000000",
          relatedFindingIds: ["finding.test#000000000000"],
          category: "security",
          title: "Test Z",
          summary: "Summary Z",
          score: 50,
          confidence: 0.8,
          effectiveScore: 40,
          evidence: [],
          suggestedChecks: [],
        },
        {
          ruleKey: "test-a",
          flagId: "flag.test-a#000000000000",
          relatedFindingIds: ["finding.test#000000000000"],
          category: "security",
          title: "Test A",
          summary: "Summary A",
          score: 50,
          confidence: 0.8,
          effectiveScore: 40,
          evidence: [],
          suggestedChecks: [],
        },
      ];

      const sorted = sortRiskFlags(flags);
      expect(sorted[0]!.ruleKey).toBe("test-a");
      expect(sorted[1]!.ruleKey).toBe("test-z");
    });
  });

  describe("sortFindings", () => {
    it("should sort by type ascending", () => {
      const findings: Finding[] = [
        {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence: [],
          file: "routes/a.ts",
          path: "/a",
          routeType: "page",
          methods: [],
        },
        {
          type: "dependency-change",
          kind: "dependency-change",
          category: "dependencies",
          confidence: "high",
          evidence: [],
          name: "package-a",
          section: "dependencies",
          impact: "minor",
        },
      ];

      const sorted = sortFindings(findings);
      expect(sorted[0]!.type).toBe("dependency-change");
      expect(sorted[1]!.type).toBe("route-change");
    });

    it("should sort by file within same type", () => {
      const findings: Finding[] = [
        {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence: [{ file: "routes/z.ts", excerpt: "" }],
          file: "routes/z.ts",
          path: "/z",
          routeType: "page",
          methods: [],
        },
        {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence: [{ file: "routes/a.ts", excerpt: "" }],
          file: "routes/a.ts",
          path: "/a",
          routeType: "page",
          methods: [],
        },
      ];

      const sorted = sortFindings(findings);
      expect(sorted[0]!.evidence[0]!.file).toBe("routes/a.ts");
      expect(sorted[1]!.evidence[0]!.file).toBe("routes/z.ts");
    });
  });

  describe("sortEvidence", () => {
    it("should sort by file ascending", () => {
      const evidence: Evidence[] = [
        { file: "src/z.ts", excerpt: "test z" },
        { file: "src/a.ts", excerpt: "test a" },
        { file: "src/m.ts", excerpt: "test m" },
      ];

      const sorted = sortEvidence(evidence);
      expect(sorted[0]!.file).toBe("src/a.ts");
      expect(sorted[1]!.file).toBe("src/m.ts");
      expect(sorted[2]!.file).toBe("src/z.ts");
    });

    it("should sort by line number within same file", () => {
      const evidence: Evidence[] = [
        { file: "src/a.ts", excerpt: "test", line: 50 },
        { file: "src/a.ts", excerpt: "test", line: 10 },
        { file: "src/a.ts", excerpt: "test", line: 30 },
      ];

      const sorted = sortEvidence(evidence);
      expect(sorted[0]!.line).toBe(10);
      expect(sorted[1]!.line).toBe(30);
      expect(sorted[2]!.line).toBe(50);
    });
  });

  describe("sortRiskFlagEvidence", () => {
    it("should sort by file ascending", () => {
      const evidence: RiskFlagEvidence[] = [
        { file: "src/z.ts", lines: ["line 1"] },
        { file: "src/a.ts", lines: ["line 1"] },
        { file: "src/m.ts", lines: ["line 1"] },
      ];

      const sorted = sortRiskFlagEvidence(evidence);
      expect(sorted[0]!.file).toBe("src/a.ts");
      expect(sorted[1]!.file).toBe("src/m.ts");
      expect(sorted[2]!.file).toBe("src/z.ts");
    });

    it("should sort by hunk line number within same file", () => {
      const evidence: RiskFlagEvidence[] = [
        { file: "src/a.ts", hunk: "@@ -1,2 +50,3 @@", lines: ["line 1"] },
        { file: "src/a.ts", hunk: "@@ -1,2 +10,3 @@", lines: ["line 1"] },
        { file: "src/a.ts", hunk: "@@ -1,2 +30,3 @@", lines: ["line 1"] },
      ];

      const sorted = sortRiskFlagEvidence(evidence);
      expect(sorted[0]!.hunk).toContain("+10");
      expect(sorted[1]!.hunk).toContain("+30");
      expect(sorted[2]!.hunk).toContain("+50");
    });
  });

  describe("sortFilePaths", () => {
    it("should sort paths lexicographically", () => {
      const paths = ["src/z.ts", "src/a.ts", "src/m.ts", "Src/B.ts"];
      const sorted = sortFilePaths(paths);
      expect(sorted).toEqual(["src/a.ts", "Src/B.ts", "src/m.ts", "src/z.ts"]);
    });
  });

  describe("createSortedObject", () => {
    it("should create object with sorted keys", () => {
      const entries: Array<[string, number]> = [
        ["zebra", 1],
        ["apple", 2],
        ["mango", 3],
      ];

      const obj = createSortedObject(entries);
      const keys = Object.keys(obj);
      expect(keys).toEqual(["apple", "mango", "zebra"]);
    });

    it("should preserve values", () => {
      const entries: Array<[string, number]> = [
        ["zebra", 26],
        ["apple", 1],
        ["mango", 13],
      ];

      const obj = createSortedObject(entries);
      expect(obj.zebra).toBe(26);
      expect(obj.apple).toBe(1);
      expect(obj.mango).toBe(13);
    });
  });
});
