import { describe, it, expect } from "bun:test";
import { linterConfigAnalyzer, detectLinterTool } from "../src/analyzers/linter-config.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("linterConfigAnalyzer", () => {
  describe("detectLinterTool", () => {
    it("should detect ESLint configs", () => {
      expect(detectLinterTool(".eslintrc.json")).toBe("eslint");
      expect(detectLinterTool(".eslintrc.js")).toBe("eslint");
      expect(detectLinterTool("eslint.config.mjs")).toBe("eslint");
      expect(detectLinterTool(".eslintignore")).toBe("eslint");
    });

    it("should detect Biome configs", () => {
      expect(detectLinterTool("biome.json")).toBe("biome");
      expect(detectLinterTool("biome.jsonc")).toBe("biome");
    });

    it("should detect Prettier configs", () => {
      expect(detectLinterTool(".prettierrc")).toBe("prettier");
      expect(detectLinterTool(".prettierrc.json")).toBe("prettier");
      expect(detectLinterTool("prettier.config.js")).toBe("prettier");
      expect(detectLinterTool(".prettierignore")).toBe("prettier");
    });

    it("should detect Stylelint configs", () => {
      expect(detectLinterTool(".stylelintrc.json")).toBe("stylelint");
      expect(detectLinterTool("stylelint.config.js")).toBe("stylelint");
    });

    it("should detect oxlint configs", () => {
      expect(detectLinterTool(".oxlintrc.json")).toBe("oxlint");
      expect(detectLinterTool("oxlint.json")).toBe("oxlint");
    });

    it("should return null for non-linter files", () => {
      expect(detectLinterTool("src/index.ts")).toBeNull();
    });
  });

  describe("analyze", () => {
    it("should detect ESLint config changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("eslint.config.mjs", [
            'import eslint from "@eslint/js";',
            "export default [eslint.configs.recommended];",
          ]),
        ],
      });

      const findings = linterConfigAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("linter-config");
      const finding = findings[0] as any;
      expect(finding.tool).toBe("eslint");
    });

    it("should detect breaking ESLint changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            ".eslintrc.json",
            ['  "extends": ["plugin:react/recommended"]'],
            ['  "extends": ["eslint:recommended"]']
          ),
        ],
      });

      const findings = linterConfigAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
    });

    it("should detect Biome config changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("biome.json", [
            '  "linter": {',
            '    "enabled": true',
            '  }',
          ]),
        ],
      });

      const findings = linterConfigAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.tool).toBe("biome");
    });

    it("should return empty for non-linter files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
      });

      const findings = linterConfigAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
