/**
 * Vitest analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  vitestAnalyzer,
  isTestFile,
  isVitestConfig,
} from "../src/analyzers/vitest.js";
import type { TestChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("isTestFile", () => {
  it("should identify .test.ts files", () => {
    expect(isTestFile("utils.test.ts")).toBe(true);
    expect(isTestFile("src/utils.test.ts")).toBe(true);
  });

  it("should identify .spec.ts files", () => {
    expect(isTestFile("utils.spec.ts")).toBe(true);
    expect(isTestFile("src/utils.spec.ts")).toBe(true);
  });

  it("should identify .test.js files", () => {
    expect(isTestFile("utils.test.js")).toBe(true);
  });

  it("should identify .spec.js files", () => {
    expect(isTestFile("utils.spec.js")).toBe(true);
  });

  it("should identify files in tests/ directory", () => {
    expect(isTestFile("tests/utils.ts")).toBe(true);
    expect(isTestFile("tests/nested/deep.ts")).toBe(true);
  });

  it("should identify files in test/ directory", () => {
    expect(isTestFile("test/utils.ts")).toBe(true);
  });

  it("should not identify regular source files", () => {
    expect(isTestFile("src/utils.ts")).toBe(false);
    expect(isTestFile("lib/helpers.js")).toBe(false);
  });
});

describe("isVitestConfig", () => {
  it("should identify vitest.config.ts", () => {
    expect(isVitestConfig("vitest.config.ts")).toBe(true);
  });

  it("should identify vitest.config.js", () => {
    expect(isVitestConfig("vitest.config.js")).toBe(true);
  });

  it("should identify vitest.config.mts", () => {
    expect(isVitestConfig("vitest.config.mts")).toBe(true);
  });

  it("should identify vitest.config.mjs", () => {
    expect(isVitestConfig("vitest.config.mjs")).toBe(true);
  });

  it("should identify vitest.config.e2e.ts", () => {
    expect(isVitestConfig("vitest.config.e2e.ts")).toBe(true);
  });

  it("should identify vitest.config.unit.ts", () => {
    expect(isVitestConfig("vitest.config.unit.ts")).toBe(true);
  });

  it("should identify vite.config.ts", () => {
    expect(isVitestConfig("vite.config.ts")).toBe(true);
  });

  it("should identify vite.config.js", () => {
    expect(isVitestConfig("vite.config.js")).toBe(true);
  });

  it("should not identify other config files", () => {
    expect(isVitestConfig("eslint.config.ts")).toBe(false);
    expect(isVitestConfig("tsconfig.json")).toBe(false);
  });

  it("should not identify nested config files", () => {
    expect(isVitestConfig("config/vitest.config.ts")).toBe(false);
  });
});

describe("vitestAnalyzer", () => {
  it("should detect test file changes", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("tests/utils.test.ts", "modified"),
        createFileChange("tests/helpers.test.ts", "added"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TestChangeFinding;
    expect(finding.type).toBe("test-change");
    expect(finding.framework).toBe("vitest");
    expect(finding.files).toHaveLength(2);
  });

  it("should detect vitest config changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("vitest.config.ts", "modified")],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TestChangeFinding;
    expect(finding.type).toBe("test-change");
    expect(finding.files).toContain("vitest.config.ts");
  });

  it("should detect vite config changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("vite.config.ts", "modified")],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);
  });

  it("should detect mixed test and config changes", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("vitest.config.ts", "modified"),
        createFileChange("tests/utils.test.ts", "modified"),
        createFileChange("src/utils.spec.ts", "added"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TestChangeFinding;
    expect(finding.files).toHaveLength(3);
  });

  it("should return empty for non-test files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/index.ts", "modified"),
        createFileChange("package.json", "modified"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should return empty for empty changesets", () => {
    const changeSet = createChangeSet({
      files: [],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should include evidence from test files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("tests/a.test.ts", "modified"),
        createFileChange("tests/b.test.ts", "modified"),
        createFileChange("tests/c.test.ts", "modified"),
        createFileChange("tests/d.test.ts", "modified"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    const finding = findings[0] as TestChangeFinding;

    // Evidence is limited to first 3 files
    expect(finding.evidence.length).toBeLessThanOrEqual(3);
  });

  it("should have correct category and confidence", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("tests/utils.test.ts", "modified")],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    const finding = findings[0] as TestChangeFinding;

    expect(finding.kind).toBe("test-change");
    expect(finding.category).toBe("tests");
    expect(finding.confidence).toBe("high");
  });

  it("should differentiate between added and modified test files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("tests/new.test.ts", "added"),
        createFileChange("tests/existing.test.ts", "modified"),
        createFileChange("tests/another-new.test.ts", "added"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TestChangeFinding;
    expect(finding.files).toHaveLength(3);
    expect(finding.added).toHaveLength(2);
    expect(finding.modified).toHaveLength(1);
    expect(finding.deleted).toHaveLength(0);

    expect(finding.added).toContain("tests/new.test.ts");
    expect(finding.added).toContain("tests/another-new.test.ts");
    expect(finding.modified).toContain("tests/existing.test.ts");
  });

  it("should track deleted test files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("tests/removed.test.ts", "deleted"),
        createFileChange("tests/kept.test.ts", "modified"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TestChangeFinding;
    expect(finding.files).toHaveLength(2);
    expect(finding.added).toHaveLength(0);
    expect(finding.modified).toHaveLength(1);
    expect(finding.deleted).toHaveLength(1);

    expect(finding.deleted).toContain("tests/removed.test.ts");
    expect(finding.modified).toContain("tests/kept.test.ts");
  });

  it("should treat renamed files as modified", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("tests/renamed.test.ts", "renamed"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TestChangeFinding;
    expect(finding.files).toHaveLength(1);
    expect(finding.added).toHaveLength(0);
    expect(finding.modified).toHaveLength(1);
    expect(finding.deleted).toHaveLength(0);

    expect(finding.modified).toContain("tests/renamed.test.ts");
  });

  it("should include status in evidence description", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("tests/new.test.ts", "added"),
        createFileChange("tests/existing.test.ts", "modified"),
      ],
    });

    const findings = vitestAnalyzer.analyze(changeSet);
    const finding = findings[0] as TestChangeFinding;

    // Check that evidence includes status information
    const addedEvidence = finding.evidence.find(e => e.file === "tests/new.test.ts");
    const modifiedEvidence = finding.evidence.find(e => e.file === "tests/existing.test.ts");

    expect(addedEvidence?.excerpt).toContain("added");
    expect(modifiedEvidence?.excerpt).toContain("modified");
  });
});
