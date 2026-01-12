/**
 * TypeScript config analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  typescriptConfigAnalyzer,
  isTsConfig,
} from "../src/analyzers/typescript-config.js";
import type { TypeScriptConfigFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("isTsConfig", () => {
  it("should identify tsconfig.json files", () => {
    expect(isTsConfig("tsconfig.json")).toBe(true);
    expect(isTsConfig("packages/core/tsconfig.json")).toBe(true);
  });

  it("should identify named tsconfig files", () => {
    expect(isTsConfig("tsconfig.build.json")).toBe(true);
    expect(isTsConfig("tsconfig.node.json")).toBe(true);
    expect(isTsConfig("src/tsconfig.lib.json")).toBe(true);
  });

  it("should reject non-tsconfig files", () => {
    expect(isTsConfig("config.json")).toBe(false);
    expect(isTsConfig("package.json")).toBe(false);
    expect(isTsConfig("tsconfig.ts")).toBe(false);
  });
});

describe("typescriptConfigAnalyzer", () => {
  it("should detect strictness option additions", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tsconfig.json",
          [
            '"strict": true,',
            '"strictNullChecks": true,',
          ],
          [],
          "modified"
        ),
      ],
    });

    const findings = typescriptConfigAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TypeScriptConfigFinding;
    expect(finding.type).toBe("typescript-config");
    expect(finding.changedOptions.added).toContain("strict");
    expect(finding.changedOptions.added).toContain("strictNullChecks");
    expect(finding.isBreaking).toBe(true);
  });

  it("should detect option removal", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tsconfig.json",
          [],
          [
            '"noImplicitAny": true,',
          ],
          "modified"
        ),
      ],
    });

    const findings = typescriptConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as TypeScriptConfigFinding;

    expect(finding.changedOptions.removed).toContain("noImplicitAny");
    expect(finding.isBreaking).toBe(true);
  });

  it("should detect option modification", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tsconfig.json",
          ['"target": "ES2022",'],
          ['"target": "ES2020",'],
          "modified"
        ),
      ],
    });

    const findings = typescriptConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as TypeScriptConfigFinding;

    expect(finding.changedOptions.modified).toContain("target");
    expect(finding.isBreaking).toBe(true);
  });

  it("should identify strictness changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tsconfig.json",
          ['"strict": true,'],
          ['"strictNullChecks": false,'],
          "modified"
        ),
      ],
    });

    const findings = typescriptConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as TypeScriptConfigFinding;

    expect(finding.strictnessChanges.length).toBeGreaterThan(0);
  });

  it("should return empty for non-tsconfig files", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "package.json",
          ['"name": "my-package"'],
          [],
          "modified"
        ),
      ],
    });

    const findings = typescriptConfigAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should have high confidence for breaking changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tsconfig.json",
          ['"module": "ESNext",'],
          ['"module": "CommonJS",'],
          "modified"
        ),
      ],
    });

    const findings = typescriptConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as TypeScriptConfigFinding;

    expect(finding.confidence).toBe("high");
  });
});
