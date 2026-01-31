import { describe, it, expect } from "bun:test";
import { i18nAnalyzer, isI18nFile } from "../src/analyzers/i18n.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("i18nAnalyzer", () => {
  describe("file pattern detection", () => {
    it("should detect locale JSON files", () => {
      expect(isI18nFile("locales/en.json")).toBe(true);
      expect(isI18nFile("locales/en-US.json")).toBe(true);
      expect(isI18nFile("public/locales/fr.json")).toBe(true);
    });

    it("should detect i18n directory files", () => {
      expect(isI18nFile("i18n/en.json")).toBe(true);
      expect(isI18nFile("src/i18n/config.ts")).toBe(true);
    });

    it("should detect translation files", () => {
      expect(isI18nFile("translations/de.json")).toBe(true);
      expect(isI18nFile("translations/en.yml")).toBe(true);
    });

    it("should detect locale files", () => {
      expect(isI18nFile("config.locale.ts")).toBe(true);
      expect(isI18nFile("settings.locale.js")).toBe(true);
    });

    it("should reject non-i18n files", () => {
      expect(isI18nFile("src/components/Button.tsx")).toBe(false);
      expect(isI18nFile("package.json")).toBe(false);
    });
  });

  describe("translation key detection", () => {
    it("should detect added translation keys", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            [
              "{",
              '  "welcome": "Welcome",',
              '  "goodbye": "Goodbye",',
              '  "nested.key": "Value"',
              "}",
            ],
            ["{}"],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.keyChanges).toHaveLength(3);
      expect(finding.keyChanges.every((c: any) => c.operation === "added")).toBe(true);
    });

    it("should detect removed translation keys as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            ['{ "keep": "Keep" }'],
            [
              "{",
              '  "keep": "Keep",',
              '  "remove": "Remove"',
              "}",
            ],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const removedChange = finding.keyChanges.find((c: any) => c.key === "remove");
      expect(removedChange?.operation).toBe("removed");
      expect(removedChange?.isBreaking).toBe(true);
      expect(finding.isBreaking).toBe(true);
    });

    it("should detect modified translation values", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            ['{ "greeting": "Hello there" }'],
            ['{ "greeting": "Hello" }'],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const modifiedChange = finding.keyChanges.find((c: any) => c.key === "greeting");
      expect(modifiedChange?.operation).toBe("modified");
    });

    it("should detect interpolation changes as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            ['{ "welcome": "Hello {{name}}" }'],
            ['{ "welcome": "Hello" }'],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const modifiedChange = finding.keyChanges.find((c: any) => c.key === "welcome");
      expect(modifiedChange?.isBreaking).toBe(true);
    });
  });

  describe("nested key handling", () => {
    it("should flatten nested translation keys", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            [
              "{",
              '  "nav": {',
              '    "home": "Home",',
              '    "about": "About"',
              "  }",
              "}",
            ],
            ["{}"],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      const navHome = finding.keyChanges.find((c: any) => c.key === "nav.home");
      const navAbout = finding.keyChanges.find((c: any) => c.key === "nav.about");
      expect(navHome).toBeDefined();
      expect(navAbout).toBeDefined();
    });
  });

  describe("locale detection", () => {
    it("should extract locale from file path", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/de.json",
            ['{ "test": "Test" }'],
            [],
            "added"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].locale).toBe("de");
    });

    it("should handle locale with region code", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en-US.json",
            ['{ "test": "Test" }'],
            [],
            "added"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].locale).toBe("en-US");
    });

    it("should detect locale file additions", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/es.json",
            ['{ "test": "Test" }'],
            [],
            "added"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.localeAdded).toContain("es");
    });
  });

  describe("confidence levels", () => {
    it("should assign high confidence to removed keys", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            ["{}"],
            ['{ "key": "value" }'],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("should assign medium confidence to modified keys", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            ['{ "key": "new value" }'],
            ['{ "key": "old value" }'],
            "modified"
          ),
        ],
        headPackageJson: { dependencies: { "react-i18next": "^13.0.0" } },
      });

      const findings = i18nAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("medium");
    });
  });

  describe("dependency detection", () => {
    it("should skip projects without i18n libraries", async () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "locales/en.json",
            ['{ "key": "value" }'],
            [],
            "added"
          ),
        ],
        headPackageJson: { dependencies: {} },
      });

      const findings = await i18nAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("should detect various i18n libraries", async () => {
      const libs = [
        "react-i18next",
        "vue-i18n",
        "svelte-i18n",
        "react-intl",
        "i18next",
        "next-intl",
      ];

      for (const lib of libs) {
        const changeSet = createChangeSet({
          diffs: [
            createFileDiff(
              "locales/en.json",
              ['{ "key": "value" }'],
              [],
              "added"
            ),
          ],
          headPackageJson: { dependencies: { [lib]: "^1.0.0" } },
        });

        const findings = await i18nAnalyzer.analyze(changeSet);
        expect(findings.length).toBeGreaterThan(0);
      }
    });
  });
});
