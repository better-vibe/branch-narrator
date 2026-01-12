/**
 * Cloudflare analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  cloudflareAnalyzer,
  isWranglerConfig,
  isGitHubWorkflow,
  workflowMentionsCloudflare,
} from "../src/analyzers/cloudflare.js";
import type { CloudflareChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("isWranglerConfig", () => {
  it("should identify wrangler.toml", () => {
    expect(isWranglerConfig("wrangler.toml")).toBe(true);
  });

  it("should identify wrangler.json", () => {
    expect(isWranglerConfig("wrangler.json")).toBe(true);
  });

  it("should reject non-wrangler files", () => {
    expect(isWranglerConfig("package.json")).toBe(false);
    expect(isWranglerConfig("wrangler.config.js")).toBe(false);
    expect(isWranglerConfig("src/wrangler.toml")).toBe(false);
  });
});

describe("isGitHubWorkflow", () => {
  it("should identify .github/workflows/*.yml files", () => {
    expect(isGitHubWorkflow(".github/workflows/ci.yml")).toBe(true);
    expect(isGitHubWorkflow(".github/workflows/deploy.yml")).toBe(true);
  });

  it("should identify .github/workflows/*.yaml files", () => {
    expect(isGitHubWorkflow(".github/workflows/ci.yaml")).toBe(true);
  });

  it("should reject non-workflow files", () => {
    expect(isGitHubWorkflow(".github/CODEOWNERS")).toBe(false);
    expect(isGitHubWorkflow("workflows/ci.yml")).toBe(false);
    expect(isGitHubWorkflow(".github/workflows/README.md")).toBe(false);
  });
});

describe("workflowMentionsCloudflare", () => {
  it("should detect wrangler keyword", () => {
    expect(workflowMentionsCloudflare("run: wrangler deploy")).toBe(true);
  });

  it("should detect cloudflare keyword", () => {
    expect(workflowMentionsCloudflare("uses: cloudflare/action")).toBe(true);
  });

  it("should detect workers keyword", () => {
    expect(workflowMentionsCloudflare("deploy to workers")).toBe(true);
  });

  it("should detect pages keyword", () => {
    expect(workflowMentionsCloudflare("cloudflare pages deployment")).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(workflowMentionsCloudflare("WRANGLER")).toBe(true);
    expect(workflowMentionsCloudflare("Cloudflare")).toBe(true);
  });

  it("should return false for unrelated content", () => {
    expect(workflowMentionsCloudflare("npm run build")).toBe(false);
    expect(workflowMentionsCloudflare("uses: actions/checkout@v4")).toBe(false);
  });
});

describe("cloudflareAnalyzer", () => {
  it("should detect wrangler.toml changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("wrangler.toml", "added")],
      diffs: [
        createFileDiff(
          "wrangler.toml",
          ['name = "my-worker"', 'main = "src/index.ts"'],
          [],
          "added"
        ),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as CloudflareChangeFinding;
    expect(finding.type).toBe("cloudflare-change");
    expect(finding.area).toBe("wrangler");
    expect(finding.files).toContain("wrangler.toml");
  });

  it("should detect wrangler.json changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("wrangler.json", "modified")],
      diffs: [
        createFileDiff(
          "wrangler.json",
          ['{ "name": "my-worker" }'],
          [],
          "modified"
        ),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as CloudflareChangeFinding;
    expect(finding.area).toBe("wrangler");
  });

  it("should detect CI workflows mentioning Cloudflare", () => {
    const changeSet = createChangeSet({
      files: [createFileChange(".github/workflows/deploy.yml", "added")],
      diffs: [
        createFileDiff(
          ".github/workflows/deploy.yml",
          [
            "name: Deploy",
            "jobs:",
            "  deploy:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - run: wrangler deploy",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as CloudflareChangeFinding;
    expect(finding.type).toBe("cloudflare-change");
    expect(finding.area).toBe("ci");
    expect(finding.files).toContain(".github/workflows/deploy.yml");
  });

  it("should not detect CI workflows without Cloudflare mentions", () => {
    const changeSet = createChangeSet({
      files: [createFileChange(".github/workflows/ci.yml", "added")],
      diffs: [
        createFileDiff(
          ".github/workflows/ci.yml",
          ["name: CI", "on: [push]", "jobs:", "  test:", "    run: npm test"],
          [],
          "added"
        ),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should detect both wrangler and CI changes separately", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("wrangler.toml", "modified"),
        createFileChange(".github/workflows/deploy.yml", "modified"),
      ],
      diffs: [
        createFileDiff("wrangler.toml", ['name = "worker"'], [], "modified"),
        createFileDiff(
          ".github/workflows/deploy.yml",
          ["run: wrangler publish"],
          [],
          "modified"
        ),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(2);

    const areas = findings.map((f) => (f as CloudflareChangeFinding).area);
    expect(areas).toContain("wrangler");
    expect(areas).toContain("ci");
  });

  it("should return empty for non-cloudflare files", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/index.ts", "modified")],
      diffs: [
        createFileDiff("src/index.ts", ["export const x = 1;"], [], "modified"),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should group multiple wrangler files together", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("wrangler.toml", "modified"),
        createFileChange("wrangler.json", "added"),
      ],
      diffs: [
        createFileDiff("wrangler.toml", ['name = "worker1"'], [], "modified"),
        createFileDiff("wrangler.json", ['{"name": "worker2"}'], [], "added"),
      ],
    });

    const findings = cloudflareAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as CloudflareChangeFinding;
    expect(finding.area).toBe("wrangler");
    expect(finding.files).toHaveLength(2);
    expect(finding.files).toContain("wrangler.toml");
    expect(finding.files).toContain("wrangler.json");
  });
});
