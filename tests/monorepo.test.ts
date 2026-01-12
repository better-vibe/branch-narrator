/**
 * Monorepo config analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  monorepoAnalyzer,
  detectMonorepoTool,
} from "../src/analyzers/monorepo.js";
import type { MonorepoConfigFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("detectMonorepoTool", () => {
  it("should detect Turborepo config", () => {
    expect(detectMonorepoTool("turbo.json")).toBe("turborepo");
  });

  it("should detect pnpm workspace", () => {
    expect(detectMonorepoTool("pnpm-workspace.yaml")).toBe("pnpm");
    expect(detectMonorepoTool("pnpm-workspace.yml")).toBe("pnpm");
  });

  it("should detect Lerna config", () => {
    expect(detectMonorepoTool("lerna.json")).toBe("lerna");
  });

  it("should detect Nx config", () => {
    expect(detectMonorepoTool("nx.json")).toBe("nx");
    expect(detectMonorepoTool("project.json")).toBe("nx");
  });

  it("should detect Yarn config", () => {
    expect(detectMonorepoTool(".yarnrc.yml")).toBe("yarn");
    expect(detectMonorepoTool(".yarnrc")).toBe("yarn");
  });

  it("should detect Changesets config", () => {
    expect(detectMonorepoTool(".changeset/config.json")).toBe("changesets");
  });

  it("should return null for unknown files", () => {
    expect(detectMonorepoTool("package.json")).toBe("npm");
    expect(detectMonorepoTool("config.json")).toBeNull();
  });
});

describe("monorepoAnalyzer", () => {
  it("should detect Turborepo pipeline changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "turbo.json",
          [
            "{",
            '  "pipeline": {',
            '    "build": {',
            '      "dependsOn": ["^build"]',
            "    }",
            "  }",
            "}",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as MonorepoConfigFinding;
    expect(finding.type).toBe("monorepo-config");
    expect(finding.tool).toBe("turborepo");
    expect(finding.affectedFields).toContain("pipeline");
  });

  it("should detect pnpm workspace changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "pnpm-workspace.yaml",
          ["packages:", "  - 'packages/*'", "  - 'apps/*'"],
          [],
          "added"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as MonorepoConfigFinding;
    expect(finding.tool).toBe("pnpm");
    expect(finding.affectedFields).toContain("packages");
  });

  it("should detect Lerna version mode changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "lerna.json",
          ['"version": "independent",'],
          ['"version": "1.0.0",'],
          "modified"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    const finding = findings[0] as MonorepoConfigFinding;

    expect(finding.tool).toBe("lerna");
    expect(finding.impacts.some(i => i.includes("independent"))).toBe(true);
  });

  it("should detect Nx plugin changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "nx.json",
          ['"plugins": ["@nx/react", "@nx/webpack"]'],
          [],
          "modified"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    const finding = findings[0] as MonorepoConfigFinding;

    expect(finding.tool).toBe("nx");
    expect(finding.affectedFields).toContain("plugins");
  });

  it("should skip package.json without workspaces", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "package.json",
          ['"name": "my-package"'],
          [],
          "modified"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should detect package.json workspaces changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "package.json",
          ['"workspaces": ["packages/*"]'],
          [],
          "modified"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as MonorepoConfigFinding;
    expect(finding.tool).toBe("npm");
  });

  it("should detect changeset base branch changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          ".changeset/config.json",
          ['"baseBranch": "main"'],
          ['"baseBranch": "master"'],
          "modified"
        ),
      ],
    });

    const findings = monorepoAnalyzer.analyze(changeSet);
    const finding = findings[0] as MonorepoConfigFinding;

    expect(finding.tool).toBe("changesets");
    expect(finding.impacts.some(i => i.includes("Base branch"))).toBe(true);
  });
});
