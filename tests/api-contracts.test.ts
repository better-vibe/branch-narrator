/**
 * API contracts analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeAPIContracts } from "../src/analyzers/api-contracts.js";
import type { APIContractChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";


describe("analyzeAPIContracts", () => {
  describe("OpenAPI/Swagger detection", () => {
    it("should detect openapi.yaml", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("openapi.yaml", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as APIContractChangeFinding;
      expect(finding.type).toBe("api-contract-change");
      expect(finding.files).toContain("openapi.yaml");
    });

    it("should detect openapi.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("openapi.json", "added")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as APIContractChangeFinding;
      expect(finding.files).toContain("openapi.json");
    });

    it("should detect swagger.yaml", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("swagger.yaml", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect swagger.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("swagger.json", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect nested openapi files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("docs/openapi/spec.yaml", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });

  describe("Protobuf detection", () => {
    it("should detect .proto files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("api/service.proto", "added")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as APIContractChangeFinding;
      expect(finding.files).toContain("api/service.proto");
    });

    it("should detect multiple .proto files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("proto/users.proto", "modified"),
          createFileChange("proto/orders.proto", "added"),
        ],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as APIContractChangeFinding;
      expect(finding.files).toHaveLength(2);
    });
  });

  describe("API directory detection", () => {
    it("should detect /api/*.yaml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("src/api/users.yaml", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect /api/*.yml files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("src/api/orders.yml", "added")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect /api/*.json files", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("src/api/schema.json", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect nested /api/ paths", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("docs/api/v2/spec.yaml", "added")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });

  describe("multiple contract files", () => {
    it("should group all contract files together", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("openapi.yaml", "modified"),
          createFileChange("protos/users.proto", "added"),
          createFileChange("src/api/schemas.json", "modified"),
        ],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as APIContractChangeFinding;
      expect(finding.files).toHaveLength(3);
    });
  });

  describe("non-contract files", () => {
    it("should return empty for non-contract files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/index.ts", "modified"),
          createFileChange("package.json", "modified"),
        ],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not detect random yaml files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("config.yaml", "modified"),
          createFileChange(".github/workflows/ci.yaml", "modified"),
        ],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not detect yaml outside api directory", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("src/config/settings.yaml", "modified")],
      });

      const findings = analyzeAPIContracts.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
