import { describe, it, expect } from "bun:test";
import { cypressAnalyzer, isCypressConfig, isCypressTestFile, isCypressFixture, isCypressSupportFile } from "../src/analyzers/cypress.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("cypressAnalyzer", () => {
  describe("file pattern detection", () => {
    it("should detect cypress config files", () => {
      expect(isCypressConfig("cypress.config.ts")).toBe(true);
      expect(isCypressConfig("cypress.config.js")).toBe(true);
      expect(isCypressConfig("cypress.config.mjs")).toBe(true);
      expect(isCypressConfig("src/cypress.config.ts")).toBe(true);
    });

    it("should detect cypress test files", () => {
      expect(isCypressTestFile("cypress/e2e/login.cy.ts")).toBe(true);
      expect(isCypressTestFile("cypress/integration/app.spec.js")).toBe(true);
      expect(isCypressTestFile("src/components/Button.cy.tsx")).toBe(true);
    });

    it("should detect cypress fixture files", () => {
      expect(isCypressFixture("cypress/fixtures/users.json")).toBe(true);
      expect(isCypressFixture("cypress/fixtures/data.js")).toBe(true);
    });

    it("should detect cypress support files", () => {
      expect(isCypressSupportFile("cypress/support/commands.ts")).toBe(true);
      expect(isCypressSupportFile("cypress/support/e2e.ts")).toBe(true);
    });
  });

  describe("config analysis", () => {
    it("should detect cypress config changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress.config.ts",
            [
              "import { defineConfig } from 'cypress';",
              "export default defineConfig({",
              "  e2e: {",
              '    baseUrl: "http://localhost:3000",',
              "    viewportWidth: 1280,",
              "    viewportHeight: 720,",
              "  },",
              "});",
            ],
            [],
            "added"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("cypress-config");
      const finding = findings[0] as any;
      expect(finding.affectedSections).toContain("baseUrl");
      expect(finding.affectedSections).toContain("viewportWidth");
    });

    it("should detect breaking baseUrl changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress.config.ts",
            [
              "export default defineConfig({",
              '  baseUrl: "http://localhost:3001",',
              "});",
            ],
            [
              "export default defineConfig({",
              '  baseUrl: "http://localhost:3000",',
              "});",
            ],
            "modified"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.tags).toContain("breaking");
    });

    it("should detect timeout reductions", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress.config.ts",
            [
              "export default defineConfig({",
              "  defaultCommandTimeout: 2000,",
              "});",
            ],
            [
              "export default defineConfig({",
              "  defaultCommandTimeout: 4000,",
              "});",
            ],
            "modified"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
    });
  });

  describe("test file analysis", () => {
    it("should detect test file additions", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress/e2e/login.cy.ts",
            [
              "describe('Login', () => {",
              "  it('should login successfully', () => {",
              "    cy.visit('/login');",
              "    cy.get('[data-cy=submit]').click();",
              "  });",
              "});",
            ],
            [],
            "added"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.testChanges).toHaveLength(1);
      expect(finding.testChanges[0].operation).toBe("added");
    });

    it("should detect test file deletions as medium confidence", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress/e2e/old-test.cy.ts",
            [],
            [
              "describe('Old', () => {",
              "  it('test', () => {});",
              "});",
            ],
            "deleted"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].confidence).toBe("medium");
    });
  });

  describe("fixture analysis", () => {
    it("should detect fixture deletions as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress/fixtures/users.json",
            [],
            ['{ "users": [] }'],
            "deleted"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.fixtureChanges).toHaveLength(1);
    });
  });

  describe("custom command analysis", () => {
    it("should detect custom command removals", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress/support/commands.ts",
            [],
            [
              "Cypress.Commands.add('login', (email, password) => {",
              "  cy.get('input[name=email]').type(email);",
              "});",
            ],
            "modified"
          ),
        ],
        headPackageJson: { devDependencies: { cypress: "^13.0.0" } },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.affectedSections).toContain("custom-commands");
    });
  });

  describe("dependency detection", () => {
    it("should skip projects without cypress", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "cypress.config.ts",
            ["export default {};"],
            [],
            "added"
          ),
        ],
        headPackageJson: { devDependencies: {} },
      });

      const findings = cypressAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });
  });
});
