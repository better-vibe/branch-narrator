/**
 * Dependency analyzer tests.
 */

import { describe, expect, it } from "vitest";
import {
  compareDependencies,
  dependencyAnalyzer,
  determineImpact,
} from "../src/analyzers/dependencies.js";
import type {
  DependencyChangeFinding,
  RiskFlagFinding,
} from "../src/core/types.js";
import { createChangeSet, samplePackageJson } from "./fixtures/index.js";

describe("determineImpact", () => {
  it("should detect major bump", () => {
    expect(determineImpact("^1.0.0", "^2.0.0")).toBe("major");
    expect(determineImpact("1.5.0", "2.0.0")).toBe("major");
  });

  it("should detect minor bump", () => {
    expect(determineImpact("^1.0.0", "^1.1.0")).toBe("minor");
    expect(determineImpact("1.0.0", "1.5.0")).toBe("minor");
  });

  it("should detect patch bump", () => {
    expect(determineImpact("^1.0.0", "^1.0.1")).toBe("patch");
    expect(determineImpact("1.0.0", "1.0.5")).toBe("patch");
  });

  it("should return unknown for non-semver", () => {
    expect(determineImpact("latest", "^1.0.0")).toBe("unknown");
    expect(determineImpact(undefined, "^1.0.0")).toBe("unknown");
  });
});

describe("compareDependencies", () => {
  it("should detect added dependencies", () => {
    const findings = compareDependencies(
      { dependencies: {} },
      { dependencies: { lodash: "^4.17.21" } }
    );

    const lodashFinding = findings.find((f) => f.name === "lodash");
    expect(lodashFinding).toBeDefined();
    expect(lodashFinding?.from).toBeUndefined();
    expect(lodashFinding?.to).toBe("^4.17.21");
    expect(lodashFinding?.impact).toBe("new");
  });

  it("should detect removed dependencies", () => {
    const findings = compareDependencies(
      { devDependencies: { typescript: "^5.0.0" } },
      { devDependencies: {} }
    );

    const tsFinding = findings.find((f) => f.name === "typescript");
    expect(tsFinding).toBeDefined();
    expect(tsFinding?.from).toBe("^5.0.0");
    expect(tsFinding?.to).toBeUndefined();
    expect(tsFinding?.impact).toBe("removed");
  });

  it("should detect version bumps", () => {
    const findings = compareDependencies(samplePackageJson.base, samplePackageJson.head);

    const kitFinding = findings.find((f) => f.name === "@sveltejs/kit");
    expect(kitFinding).toBeDefined();
    expect(kitFinding?.from).toBe("^1.0.0");
    expect(kitFinding?.to).toBe("^2.0.0");
    expect(kitFinding?.impact).toBe("major");
  });

  it("should identify section correctly", () => {
    const findings = compareDependencies(samplePackageJson.base, samplePackageJson.head);

    const viteFinding = findings.find((f) => f.name === "vite");
    expect(viteFinding?.section).toBe("devDependencies");

    const svelteFinding = findings.find((f) => f.name === "svelte");
    expect(svelteFinding?.section).toBe("dependencies");
  });
});

describe("dependencyAnalyzer", () => {
  it("should analyze package.json changes", () => {
    const changeSet = createChangeSet({
      basePackageJson: samplePackageJson.base,
      headPackageJson: samplePackageJson.head,
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const depFindings = findings.filter(
      (f) => f.type === "dependency-change"
    ) as DependencyChangeFinding[];

    expect(depFindings.length).toBeGreaterThan(0);
    expect(depFindings.some((f) => f.name === "@sveltejs/kit")).toBe(true);
    expect(depFindings.some((f) => f.name === "svelte")).toBe(true);
    expect(depFindings.some((f) => f.name === "lodash")).toBe(true);
  });

  it("should emit risk flags for critical package major bumps", () => {
    const changeSet = createChangeSet({
      basePackageJson: samplePackageJson.base,
      headPackageJson: samplePackageJson.head,
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const riskFindings = findings.filter(
      (f) => f.type === "risk-flag"
    ) as RiskFlagFinding[];

    expect(riskFindings.length).toBeGreaterThan(0);
    expect(
      riskFindings.some((f) => f.evidenceText.includes("@sveltejs/kit"))
    ).toBe(true);
  });

  it("should return empty for no package.json", () => {
    const changeSet = createChangeSet();
    const findings = dependencyAnalyzer.analyze(changeSet);

    expect(findings).toHaveLength(0);
  });

  it("should return empty for identical package.json", () => {
    const changeSet = createChangeSet({
      basePackageJson: samplePackageJson.base,
      headPackageJson: samplePackageJson.base,
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should detect risky auth packages", () => {
    const changeSet = createChangeSet({
      basePackageJson: { dependencies: {} },
      headPackageJson: {
        dependencies: {
          passport: "^0.6.0",
          jsonwebtoken: "^9.0.0",
        },
      },
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const depFindings = findings.filter(
      (f) => f.type === "dependency-change"
    ) as DependencyChangeFinding[];

    const passportFinding = depFindings.find((f) => f.name === "passport");
    expect(passportFinding?.riskCategory).toBe("auth");

    const jwtFinding = depFindings.find((f) => f.name === "jsonwebtoken");
    expect(jwtFinding?.riskCategory).toBe("auth");
  });

  it("should detect risky database packages", () => {
    const changeSet = createChangeSet({
      basePackageJson: { dependencies: {} },
      headPackageJson: {
        dependencies: {
          prisma: "^5.0.0",
          drizzle: "^0.28.0",
        },
        devDependencies: {
          "@prisma/client": "^5.0.0",
        },
      },
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const depFindings = findings.filter(
      (f) => f.type === "dependency-change"
    ) as DependencyChangeFinding[];

    expect(depFindings.some((f) => f.riskCategory === "database")).toBe(true);
  });

  it("should detect risky payment packages", () => {
    const changeSet = createChangeSet({
      basePackageJson: { dependencies: {} },
      headPackageJson: {
        dependencies: {
          stripe: "^12.0.0",
        },
      },
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const depFindings = findings.filter(
      (f) => f.type === "dependency-change"
    ) as DependencyChangeFinding[];

    const stripeFinding = depFindings.find((f) => f.name === "stripe");
    expect(stripeFinding?.riskCategory).toBe("payment");
  });

  it("should emit risk flag for new risky packages", () => {
    const changeSet = createChangeSet({
      basePackageJson: { dependencies: {} },
      headPackageJson: {
        dependencies: {
          stripe: "^12.0.0",
        },
      },
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const riskFindings = findings.filter(
      (f) => f.type === "risk-flag"
    ) as RiskFlagFinding[];

    expect(
      riskFindings.some((f) => f.evidenceText.includes("Payment Processing"))
    ).toBe(true);
  });
});

