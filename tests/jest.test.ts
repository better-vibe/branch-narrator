import { describe, it, expect } from "bun:test";
import { jestAnalyzer, isJestConfig } from "../src/analyzers/jest.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("jestAnalyzer", () => {
  describe("isJestConfig", () => {
    it("should detect jest config files", () => {
      expect(isJestConfig("jest.config.ts")).toBe(true);
      expect(isJestConfig("jest.config.js")).toBe(true);
      expect(isJestConfig("jest.config.mjs")).toBe(true);
      expect(isJestConfig("jest.config.json")).toBe(true);
      expect(isJestConfig("jest.config.e2e.ts")).toBe(true);
    });

    it("should detect jest setup files", () => {
      expect(isJestConfig("jest.setup.ts")).toBe(true);
      expect(isJestConfig("jest.setup.js")).toBe(true);
    });

    it("should reject non-jest files", () => {
      expect(isJestConfig("src/index.ts")).toBe(false);
      expect(isJestConfig("vitest.config.ts")).toBe(false);
    });
  });

  describe("analyze", () => {
    it("should detect jest config changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("jest.config.ts", [
            'export default {',
            '  testEnvironment: "jsdom",',
            '};',
          ]),
        ],
      });

      const findings = jestAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("jest-config");
    });

    it("should detect breaking changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "jest.config.ts",
            ['  testEnvironment: "node",'],
            ['  testEnvironment: "jsdom",']
          ),
        ],
      });

      const findings = jestAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons).toContain("Test environment changed");
    });

    it("should detect affected sections", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("jest.config.ts", [
            '  transform: {',
            '    "^.+\\.tsx?$": "ts-jest",',
            '  },',
          ]),
        ],
      });

      const findings = jestAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.affectedSections).toContain("transform");
    });

    it("should return empty for non-jest files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
      });

      const findings = jestAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
