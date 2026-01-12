/**
 * Infrastructure analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeInfra } from "../src/analyzers/infra.js";
import type { InfraChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("analyzeInfra", () => {
  describe("Dockerfile detection", () => {
    it("should detect Dockerfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("Dockerfile", "added")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.type).toBe("infra-change");
      expect(finding.infraType).toBe("dockerfile");
      expect(finding.files).toContain("Dockerfile");
    });

    it("should detect dockerfile (lowercase)", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("dockerfile", "added")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("dockerfile");
    });

    it("should detect nested Dockerfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("docker/Dockerfile.prod", "modified")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("dockerfile");
    });

    it("should group multiple Dockerfiles together", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("Dockerfile", "modified"),
          createFileChange("Dockerfile.dev", "added"),
          createFileChange("docker/Dockerfile.prod", "modified"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("dockerfile");
      expect(finding.files).toHaveLength(3);
    });
  });

  describe("Terraform detection", () => {
    it("should detect .tf files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("main.tf", "added")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.type).toBe("infra-change");
      expect(finding.infraType).toBe("terraform");
      expect(finding.files).toContain("main.tf");
    });

    it("should detect .tfvars files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("terraform.tfvars", "modified")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("terraform");
    });

    it("should group multiple Terraform files together", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("main.tf", "modified"),
          createFileChange("variables.tf", "modified"),
          createFileChange("outputs.tf", "added"),
          createFileChange("terraform.tfvars", "modified"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("terraform");
      expect(finding.files).toHaveLength(4);
    });
  });

  describe("Kubernetes detection", () => {
    it("should detect files in kubernetes/ directory", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("kubernetes/deployment.yaml", "added")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.type).toBe("infra-change");
      expect(finding.infraType).toBe("k8s");
    });

    it("should detect files in k8s/ directory", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("k8s/service.yaml", "modified")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("k8s");
    });

    it("should detect deployment.yaml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("deployment.yaml", "added")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("k8s");
    });

    it("should detect service.yaml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("service.yaml", "added")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("k8s");
    });

    it("should detect ingress.yaml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("ingress.yaml", "modified")],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("k8s");
    });

    it("should group multiple k8s files together", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("k8s/deployment.yaml", "modified"),
          createFileChange("k8s/service.yaml", "modified"),
          createFileChange("kubernetes/ingress.yaml", "added"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as InfraChangeFinding;
      expect(finding.infraType).toBe("k8s");
      expect(finding.files).toHaveLength(3);
    });
  });

  describe("multiple infra types", () => {
    it("should detect Docker and Terraform separately", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("Dockerfile", "modified"),
          createFileChange("main.tf", "modified"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(2);

      const types = findings.map((f) => (f as InfraChangeFinding).infraType);
      expect(types).toContain("dockerfile");
      expect(types).toContain("terraform");
    });

    it("should detect all three infra types", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("Dockerfile", "added"),
          createFileChange("main.tf", "added"),
          createFileChange("k8s/deployment.yaml", "added"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(3);

      const types = findings.map((f) => (f as InfraChangeFinding).infraType);
      expect(types).toContain("dockerfile");
      expect(types).toContain("terraform");
      expect(types).toContain("k8s");
    });
  });

  describe("non-infra files", () => {
    it("should return empty for non-infra files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/index.ts", "modified"),
          createFileChange("package.json", "modified"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not detect random YAML files as k8s", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("config.yaml", "modified"),
          createFileChange("settings.yaml", "added"),
        ],
      });

      const findings = analyzeInfra.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
