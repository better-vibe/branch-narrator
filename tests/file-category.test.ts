/**
 * File category classifier tests.
 */

import { describe, expect, it } from "bun:test";
import {
  categorizeFile,
  fileCategoryAnalyzer,
  getCategoryLabel,
} from "../src/analyzers/file-category.js";
import type { FileCategoryFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("categorizeFile", () => {
  it("should categorize product code", () => {
    expect(categorizeFile("src/lib/utils.ts")).toBe("product");
    expect(categorizeFile("src/routes/+page.svelte")).toBe("product");
    expect(categorizeFile("lib/helpers.js")).toBe("product");
    expect(categorizeFile("app/api/route.ts")).toBe("product");
  });

  it("should categorize test files", () => {
    expect(categorizeFile("tests/unit.test.ts")).toBe("tests");
    expect(categorizeFile("src/lib/utils.test.ts")).toBe("tests");
    expect(categorizeFile("src/lib/utils.spec.ts")).toBe("tests");
    expect(categorizeFile("__tests__/helper.ts")).toBe("tests");
    expect(categorizeFile("vitest.config.ts")).toBe("tests");
    expect(categorizeFile("vitest.config.e2e.ts")).toBe("tests");
  });

  it("should categorize CI files", () => {
    expect(categorizeFile(".github/workflows/ci.yml")).toBe("ci");
    expect(categorizeFile(".github/actions/setup/action.yml")).toBe("ci");
    expect(categorizeFile(".gitlab-ci.yml")).toBe("ci");
    expect(categorizeFile("Jenkinsfile")).toBe("ci");
  });

  it("should categorize infrastructure files", () => {
    expect(categorizeFile("Dockerfile")).toBe("infra");
    expect(categorizeFile("docker-compose.yml")).toBe("infra");
    expect(categorizeFile("helm/values.yaml")).toBe("infra");
    expect(categorizeFile("terraform/main.tf")).toBe("infra");
    expect(categorizeFile("k8s/deployment.yaml")).toBe("infra");
  });

  it("should categorize documentation files", () => {
    expect(categorizeFile("README.md")).toBe("docs");
    expect(categorizeFile("docs/getting-started.md")).toBe("docs");
    expect(categorizeFile("CHANGELOG.md")).toBe("docs");
    expect(categorizeFile("CONTRIBUTING.md")).toBe("docs");
  });

  it("should categorize dependency files", () => {
    expect(categorizeFile("package.json")).toBe("dependencies");
    expect(categorizeFile("package-lock.json")).toBe("dependencies");
    expect(categorizeFile("yarn.lock")).toBe("dependencies");
    expect(categorizeFile("pnpm-lock.yaml")).toBe("dependencies");
    expect(categorizeFile("bun.lock")).toBe("dependencies");
    expect(categorizeFile("requirements.txt")).toBe("dependencies");
    expect(categorizeFile("Cargo.toml")).toBe("dependencies");
  });

  it("should categorize configuration files", () => {
    expect(categorizeFile(".eslintrc.json")).toBe("config");
    expect(categorizeFile("tsconfig.json")).toBe("config");
    expect(categorizeFile("vite.config.ts")).toBe("config");
    expect(categorizeFile(".env.example")).toBe("config");
    expect(categorizeFile("wrangler.toml")).toBe("config");
  });

  it("should categorize unknown files as other", () => {
    expect(categorizeFile("random-file.xyz")).toBe("other");
    expect(categorizeFile("data.csv")).toBe("other");
  });
});

describe("getCategoryLabel", () => {
  it("should return human-readable labels", () => {
    expect(getCategoryLabel("product")).toBe("Product Code");
    expect(getCategoryLabel("tests")).toBe("Tests");
    expect(getCategoryLabel("ci")).toBe("CI/CD");
    expect(getCategoryLabel("infra")).toBe("Infrastructure");
    expect(getCategoryLabel("docs")).toBe("Documentation");
    expect(getCategoryLabel("dependencies")).toBe("Dependencies");
    expect(getCategoryLabel("config")).toBe("Configuration");
    expect(getCategoryLabel("other")).toBe("Other");
  });
});

describe("fileCategoryAnalyzer", () => {
  it("should categorize files from changeSet", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/lib/utils.ts", "modified"),
        createFileChange("tests/utils.test.ts", "added"),
        createFileChange("README.md", "modified"),
        createFileChange("package.json", "modified"),
      ],
    });

    const findings = fileCategoryAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as unknown as FileCategoryFinding;
    expect(finding.type).toBe("file-category");
    expect(finding.categories.product).toContain("src/lib/utils.ts");
    expect(finding.categories.tests).toContain("tests/utils.test.ts");
    expect(finding.categories.docs).toContain("README.md");
    expect(finding.categories.dependencies).toContain("package.json");
  });

  it("should include summary with counts", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/a.ts", "modified"),
        createFileChange("src/b.ts", "modified"),
        createFileChange("src/c.ts", "modified"),
        createFileChange("README.md", "modified"),
      ],
    });

    const findings = fileCategoryAnalyzer.analyze(changeSet);
    const finding = findings[0] as unknown as FileCategoryFinding;

    expect(finding.summary).toContainEqual({ category: "product", count: 3 });
    expect(finding.summary).toContainEqual({ category: "docs", count: 1 });
  });

  it("should return empty for no files", () => {
    const changeSet = createChangeSet({ files: [] });
    const findings = fileCategoryAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });
});

