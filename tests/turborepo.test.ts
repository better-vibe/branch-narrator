import { describe, it, expect } from "bun:test";
import { turborepoAnalyzer, isTurborepoConfig } from "../src/analyzers/turborepo.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("turborepoAnalyzer", () => {
  describe("isTurborepoConfig", () => {
    it("should detect turbo.json", () => {
      expect(isTurborepoConfig("turbo.json")).toBe(true);
      expect(isTurborepoConfig("turbo.jsonc")).toBe(true);
    });

    it("should reject non-turbo files", () => {
      expect(isTurborepoConfig("package.json")).toBe(false);
      expect(isTurborepoConfig("tsconfig.json")).toBe(false);
    });
  });

  describe("analyze", () => {
    it("should detect turbo.json task changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("turbo.json", [
            '{',
            '  "tasks": {',
            '    "build": {',
            '      "dependsOn": ["^build"],',
            '      "outputs": ["dist/**"]',
            '    }',
            '  }',
            '}',
          ]),
        ],
      });

      const findings = turborepoAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("turborepo-config");
      const finding = findings[0] as any;
      expect(finding.affectedSections).toContain("tasks");
    });

    it("should detect breaking changes when tasks are removed", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "turbo.json",
            ['  "tasks": {', '    "build": {}', '  }'],
            ['  "tasks": {', '    "build": {},', '    "test": {}', '  }']
          ),
        ],
      });

      const findings = turborepoAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons).toContain("Task definitions changed");
    });

    it("should detect globalDependencies changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("turbo.json", [
            '  "globalDependencies": [".env"],',
          ]),
        ],
      });

      const findings = turborepoAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.affectedSections).toContain("globalDependencies");
    });

    it("should detect cache disabled as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("turbo.json", [
            '  "tasks": {',
            '    "dev": {',
            '      "cache": false',
            '    }',
            '  }',
          ]),
        ],
      });

      const findings = turborepoAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons).toContain("Caching disabled for task(s)");
    });

    it("should skip turbo.json with no meaningful changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("turbo.json", [
            '  "$schema": "https://turbo.build/schema.json"',
          ]),
        ],
      });

      const findings = turborepoAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should return empty for non-turbo files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("package.json", ['  "name": "test"']),
        ],
      });

      const findings = turborepoAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
