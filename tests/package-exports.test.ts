/**
 * Package exports analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { packageExportsAnalyzer } from "../src/analyzers/package-exports.js";
import type { PackageExportsFinding } from "../src/core/types.js";
import { createChangeSet } from "./fixtures/index.js";

describe("packageExportsAnalyzer", () => {
  it("should detect added exports", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        exports: {
          ".": "./dist/index.js",
        },
      },
      headPackageJson: {
        name: "my-lib",
        exports: {
          ".": "./dist/index.js",
          "./utils": "./dist/utils.js",
        },
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as PackageExportsFinding;
    expect(finding.type).toBe("package-exports");
    expect(finding.addedExports).toContain("./utils");
    expect(finding.isBreaking).toBe(false);
  });

  it("should detect removed exports as breaking", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        exports: {
          ".": "./dist/index.js",
          "./utils": "./dist/utils.js",
        },
      },
      headPackageJson: {
        name: "my-lib",
        exports: {
          ".": "./dist/index.js",
        },
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    const finding = findings[0] as PackageExportsFinding;

    expect(finding.removedExports).toContain("./utils");
    expect(finding.isBreaking).toBe(true);
    expect(finding.confidence).toBe("high");
  });

  it("should detect main field changes", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        main: "./dist/index.cjs",
      },
      headPackageJson: {
        name: "my-lib",
        main: "./dist/index.js",
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    const finding = findings[0] as PackageExportsFinding;

    expect(finding.legacyFieldChanges).toContainEqual({
      field: "main",
      from: "./dist/index.cjs",
      to: "./dist/index.js",
    });
  });

  it("should detect module field removal as breaking", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        main: "./dist/index.js",
        module: "./dist/index.mjs",
      },
      headPackageJson: {
        name: "my-lib",
        main: "./dist/index.js",
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    const finding = findings[0] as PackageExportsFinding;

    expect(finding.legacyFieldChanges.some(c => c.field === "module" && c.to === undefined)).toBe(true);
    expect(finding.isBreaking).toBe(true);
  });

  it("should detect bin field changes", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-cli",
        bin: {
          mycli: "./bin/cli.js",
        },
      },
      headPackageJson: {
        name: "my-cli",
        bin: {
          mycli: "./bin/cli.js",
          "mycli-debug": "./bin/debug.js",
        },
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    const finding = findings[0] as PackageExportsFinding;

    expect(finding.binChanges.added).toContain("mycli-debug");
  });

  it("should detect bin field removal as breaking", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-cli",
        bin: {
          mycli: "./bin/cli.js",
          "mycli-old": "./bin/old.js",
        },
      },
      headPackageJson: {
        name: "my-cli",
        bin: {
          mycli: "./bin/cli.js",
        },
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    const finding = findings[0] as PackageExportsFinding;

    expect(finding.binChanges.removed).toContain("mycli-old");
    expect(finding.isBreaking).toBe(true);
  });

  it("should return empty when no package.json changes", () => {
    const changeSet = createChangeSet({
      basePackageJson: undefined,
      headPackageJson: undefined,
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should return empty when no export changes", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        version: "1.0.0",
        exports: { ".": "./index.js" },
      },
      headPackageJson: {
        name: "my-lib",
        version: "1.0.1",
        exports: { ".": "./index.js" },
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should handle conditional exports", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        exports: {
          ".": {
            import: "./dist/index.mjs",
            require: "./dist/index.cjs",
          },
        },
      },
      headPackageJson: {
        name: "my-lib",
        exports: {
          ".": {
            import: "./dist/index.mjs",
            require: "./dist/index.cjs",
            types: "./dist/index.d.ts",
          },
        },
      },
    });

    // No subpath changes, so no findings
    const findings = packageExportsAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should detect new subpath with conditional exports", () => {
    const changeSet = createChangeSet({
      basePackageJson: {
        name: "my-lib",
        exports: {
          ".": {
            import: "./dist/index.mjs",
          },
        },
      },
      headPackageJson: {
        name: "my-lib",
        exports: {
          ".": {
            import: "./dist/index.mjs",
          },
          "./utils": {
            import: "./dist/utils.mjs",
          },
        },
      },
    });

    const findings = packageExportsAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as PackageExportsFinding;
    expect(finding.addedExports).toContain("./utils");
  });
});
