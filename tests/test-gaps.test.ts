/**
 * Test gaps analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeTestGaps } from "../src/analyzers/test-gaps.js";
import type { TestGapFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("analyzeTestGaps", () => {
  describe("test file detection", () => {
    it("should identify files in /tests/ directory", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("tests/utils.test.ts", "modified"),
        ],
      });

      // Both prod and test changed, no gap
      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should identify files in /__tests__/ directory", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("src/__tests__/utils.test.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should identify .test.ts files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("src/utils.test.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should identify .spec.ts files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("src/utils.spec.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should identify .test.js files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.js", "modified"),
          createFileChange("src/utils.test.js", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("doc file exclusion", () => {
    it("should exclude .md files from prod count", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("README.md", "modified"),
          createFileChange("CHANGELOG.md", "modified"),
          createFileChange("docs/guide.md", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should exclude docs/ files from prod count", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("docs/api.ts", "modified"),
          createFileChange("docs/examples/demo.ts", "added"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("config file exclusion", () => {
    it("should exclude package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should exclude lockfiles", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package-lock.json", "modified"),
          createFileChange("yarn.lock", "modified"),
          createFileChange("pnpm-lock.yaml", "modified"),
          createFileChange("bun.lockb", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should exclude config files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("vite.config.ts", "modified"),
          createFileChange("vitest.config.ts", "modified"),
          createFileChange("eslint.config.js", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should exclude dotfiles in root", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange(".gitignore", "modified"),
          createFileChange(".eslintrc", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should exclude .toml config files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("wrangler.toml", "modified"),
          createFileChange("pyproject.toml", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("test gap detection", () => {
    it("should detect gap when >= 3 prod files change without tests", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("src/helpers.ts", "modified"),
          createFileChange("src/api.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as TestGapFinding;
      expect(finding.type).toBe("test-gap");
      expect(finding.prodFilesChanged).toBe(3);
      expect(finding.testFilesChanged).toBe(0);
    });

    it("should detect gap with more than 3 prod files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/a.ts", "modified"),
          createFileChange("src/b.ts", "modified"),
          createFileChange("src/c.ts", "modified"),
          createFileChange("src/d.ts", "modified"),
          createFileChange("src/e.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as TestGapFinding;
      expect(finding.prodFilesChanged).toBe(5);
    });

    it("should not detect gap with exactly 2 prod files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("src/helpers.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not detect gap when tests accompany prod changes", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/utils.ts", "modified"),
          createFileChange("src/helpers.ts", "modified"),
          createFileChange("src/api.ts", "modified"),
          createFileChange("tests/utils.test.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not detect gap with test-only changes", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("tests/utils.test.ts", "modified"),
          createFileChange("tests/helpers.test.ts", "added"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("evidence generation", () => {
    it("should include prod files in evidence", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/a.ts", "modified"),
          createFileChange("src/b.ts", "modified"),
          createFileChange("src/c.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      const finding = findings[0] as TestGapFinding;

      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.evidence.some((e) => e.file === "src/a.ts")).toBe(true);
    });

    it("should limit evidence to 5 files", () => {
      const files = Array.from({ length: 10 }, (_, i) =>
        createFileChange(`src/file${i}.ts`, "modified")
      );

      const changeSet = createChangeSet({ files });

      const findings = analyzeTestGaps.analyze(changeSet);
      const finding = findings[0] as TestGapFinding;

      expect(finding.evidence.length).toBeLessThanOrEqual(5);
    });
  });

  describe("finding properties", () => {
    it("should have correct category and confidence", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/a.ts", "modified"),
          createFileChange("src/b.ts", "modified"),
          createFileChange("src/c.ts", "modified"),
        ],
      });

      const findings = analyzeTestGaps.analyze(changeSet);
      const finding = findings[0] as TestGapFinding;

      expect(finding.kind).toBe("test-gap");
      expect(finding.category).toBe("quality");
      expect(finding.confidence).toBe("medium");
    });
  });
});
