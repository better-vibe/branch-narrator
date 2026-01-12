/**
 * Tailwind CSS config analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  tailwindAnalyzer,
  isTailwindConfig,
  isPostCSSConfig,
} from "../src/analyzers/tailwind.js";
import type { TailwindConfigFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("isTailwindConfig", () => {
  it("should identify tailwind config files", () => {
    expect(isTailwindConfig("tailwind.config.js")).toBe(true);
    expect(isTailwindConfig("tailwind.config.ts")).toBe(true);
    expect(isTailwindConfig("tailwind.config.cjs")).toBe(true);
    expect(isTailwindConfig("tailwind.config.mjs")).toBe(true);
  });

  it("should identify nested tailwind config files", () => {
    expect(isTailwindConfig("packages/ui/tailwind.config.js")).toBe(true);
  });

  it("should reject non-tailwind config files", () => {
    expect(isTailwindConfig("config.js")).toBe(false);
    expect(isTailwindConfig("tailwind.css")).toBe(false);
  });
});

describe("isPostCSSConfig", () => {
  it("should identify postcss config files", () => {
    expect(isPostCSSConfig("postcss.config.js")).toBe(true);
    expect(isPostCSSConfig("postcss.config.cjs")).toBe(true);
    expect(isPostCSSConfig("postcss.config.mjs")).toBe(true);
  });

  it("should reject non-postcss config files", () => {
    expect(isPostCSSConfig("tailwind.config.js")).toBe(false);
  });
});

describe("tailwindAnalyzer", () => {
  it("should detect tailwind config changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tailwind.config.js",
          [
            "module.exports = {",
            "  content: ['./src/**/*.{js,jsx}'],",
            "  theme: {",
            "    extend: {},",
            "  },",
            "}",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TailwindConfigFinding;
    expect(finding.type).toBe("tailwind-config");
    expect(finding.configType).toBe("tailwind");
    expect(finding.affectedSections).toContain("content");
    expect(finding.affectedSections).toContain("theme");
  });

  it("should detect breaking content path changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tailwind.config.ts",
          ["content: ['./src/**/*.tsx'],"],
          ["content: ['./app/**/*.tsx'],"],
          "modified"
        ),
      ],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);
    const finding = findings[0] as TailwindConfigFinding;

    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons.some(r => r.includes("Content paths"))).toBe(true);
  });

  it("should detect theme color changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tailwind.config.js",
          [],
          [
            "colors: {",
            "  primary: '#ff0000',",
            "},",
          ],
          "modified"
        ),
      ],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);
    const finding = findings[0] as TailwindConfigFinding;

    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons.some(r => r.includes("colors"))).toBe(true);
  });

  it("should detect plugin changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "tailwind.config.js",
          [],
          [
            "plugins: [",
            "  require('@tailwindcss/forms'),",
            "],",
          ],
          "modified"
        ),
      ],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);
    const finding = findings[0] as TailwindConfigFinding;

    expect(finding.affectedSections).toContain("plugins");
  });

  it("should detect postcss config changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "postcss.config.js",
          ["plugins: { tailwindcss: {}, autoprefixer: {} }"],
          [],
          "added"
        ),
      ],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as TailwindConfigFinding;
    expect(finding.configType).toBe("postcss");
  });

  it("should return empty for non-tailwind files", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          ["export default {}"],
          [],
          "added"
        ),
      ],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });
});
