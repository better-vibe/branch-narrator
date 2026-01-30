import { describe, it, expect } from "bun:test";
import { playwrightAnalyzer, isPlaywrightConfig } from "../src/analyzers/playwright.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("playwrightAnalyzer", () => {
  describe("isPlaywrightConfig", () => {
    it("should detect playwright config files", () => {
      expect(isPlaywrightConfig("playwright.config.ts")).toBe(true);
      expect(isPlaywrightConfig("playwright.config.js")).toBe(true);
      expect(isPlaywrightConfig("playwright.config.mjs")).toBe(true);
    });

    it("should detect component testing config", () => {
      expect(isPlaywrightConfig("playwright.ct.config.ts")).toBe(true);
    });

    it("should reject non-playwright files", () => {
      expect(isPlaywrightConfig("src/index.ts")).toBe(false);
      expect(isPlaywrightConfig("vitest.config.ts")).toBe(false);
    });
  });

  describe("analyze", () => {
    it("should detect playwright config changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("playwright.config.ts", [
            "export default defineConfig({",
            '  testDir: "./e2e",',
            "  use: {",
            '    baseURL: "http://localhost:3000",',
            "  },",
            "});",
          ]),
        ],
      });

      const findings = playwrightAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("playwright-config");
      const finding = findings[0] as any;
      expect(finding.affectedSections).toContain("testDir");
      expect(finding.affectedSections).toContain("use");
      expect(finding.affectedSections).toContain("baseURL");
    });

    it("should detect breaking changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "playwright.config.ts",
            ['  testDir: "./tests",'],
            ['  testDir: "./e2e",']
          ),
        ],
      });

      const findings = playwrightAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons).toContain("Test directory changed");
    });

    it("should return empty for non-playwright files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
        headPackageJson: {
          devDependencies: { "@playwright/test": "^1.40.0" },
        },
      });

      const findings = playwrightAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should skip entirely when project has no playwright dependency and no playwright files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
        headPackageJson: {
          devDependencies: { vitest: "^1.0.0" },
        },
      });

      const findings = playwrightAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should still analyze when playwright files are present even without dependency", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("playwright.config.ts", [
            "export default defineConfig({",
            '  testDir: "./e2e",',
            "});",
          ]),
        ],
        headPackageJson: {
          devDependencies: { jest: "^29.0.0" },
        },
      });

      const findings = playwrightAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });
});
