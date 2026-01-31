import { describe, it, expect } from "bun:test";
import { cssAnalyzer, isCSSModuleFile, isCSSThemeFile, isCSSGlobalFile } from "../src/analyzers/css.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("cssAnalyzer", () => {
  describe("file pattern detection", () => {
    it("should detect CSS Module files", () => {
      expect(isCSSModuleFile("Button.module.css")).toBe(true);
      expect(isCSSModuleFile("Button.module.scss")).toBe(true);
      expect(isCSSModuleFile("styles.module.less")).toBe(true);
      expect(isCSSModuleFile("Button.styled.ts")).toBe(true);
    });

    it("should detect theme files", () => {
      expect(isCSSThemeFile("theme.ts")).toBe(true);
      expect(isCSSThemeFile("colors.js")).toBe(true);
      expect(isCSSThemeFile("tokens.ts")).toBe(true);
      expect(isCSSThemeFile("src/theme/index.ts")).toBe(true);
    });

    it("should detect global CSS files", () => {
      expect(isCSSGlobalFile("global.css")).toBe(true);
      expect(isCSSGlobalFile("reset.scss")).toBe(true);
      expect(isCSSGlobalFile("index.css")).toBe(true);
    });
  });

  describe("CSS Module analysis", () => {
    it("should detect added CSS classes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.module.css",
            [
              ".button { padding: 10px; color: blue; }",
              ".primary { background: blue; }",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.classChanges).toHaveLength(2);
      expect(finding.classChanges.every((c: any) => c.operation === "added")).toBe(true);
    });

    it("should detect removed CSS classes as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.module.css",
            [],
            [".button { padding: 10px; }"],
            "deleted"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.classChanges[0].isBreaking).toBe(true);
    });

    it("should detect modified CSS properties", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.module.css",
            [".button { padding: 20px; color: red; }"],
            [".button { padding: 10px; color: blue; }"],
            "modified"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const modified = finding.classChanges.find((c: any) => c.className === "button");
      expect(modified?.operation).toBe("modified");
      expect(modified?.propertiesChanged.length).toBeGreaterThan(0);
    });

    it("should flag breaking layout property changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Layout.module.css",
            [".container { display: grid; }"],
            [".container { display: flex; }"],
            "modified"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const modified = finding.classChanges.find((c: any) => c.className === "container");
      expect(modified?.isBreaking).toBe(true);
    });

    it("should detect CSS property value changes with change details", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.module.css",
            [".button { padding: 20px; color: red; }"],
            [".button { padding: 10px; color: blue; }"],
            "modified"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const modified = finding.classChanges.find((c: any) => c.className === "button");
      expect(modified?.operation).toBe("modified");
      // Should detect value changes in format: "property: oldValue → newValue"
      expect(modified?.propertiesChanged).toContain("padding: 10px → 20px");
      expect(modified?.propertiesChanged).toContain("color: blue → red");
    });
  });

  describe("styled-components analysis", () => {
    it("should detect styled-component changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.styled.ts",
            [
              "export const Button = styled.button`",
              "  padding: 10px;",
              "  background: blue;",
              "`;",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].fileType).toBe("styled-component");
    });
  });

  describe("theme analysis", () => {
    it("should detect theme token changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "theme.ts",
            [
              "export const theme = {",
              "  primary: '#007bff',",
              "  secondary: '#6c757d',",
              "};",
            ],
            [
              "export const theme = {",
              "  primary: '#0056b3',",
              "  secondary: '#6c757d',",
              "};",
            ],
            "modified"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.fileType).toBe("theme");
      expect(finding.themeChanges.some((t: string) => t.includes("primary"))).toBe(true);
    });

    it("should detect theme token removals as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "theme.ts",
            ["export const theme = { primary: '#007bff' };"],
            [
              "export const theme = {",
              "  primary: '#007bff',",
              "  deprecated: '#fff',",
              "};",
            ],
            "modified"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.themeChanges.some((t: string) => t.includes("Removed"))).toBe(true);
    });
  });

  describe("confidence levels", () => {
    it("should assign high confidence to breaking changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.module.css",
            [],
            [".button { display: block; }"],
            "deleted"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("should assign medium confidence to modifications", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Button.module.css",
            [".button { color: red; }"],
            [".button { color: blue; }"],
            "modified"
          ),
        ],
      });

      const findings = cssAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("medium");
    });
  });
});
