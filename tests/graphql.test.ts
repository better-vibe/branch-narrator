/**
 * GraphQL schema analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  graphqlAnalyzer,
  isGraphQLSchema,
} from "../src/analyzers/graphql.js";
import type { GraphQLChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("isGraphQLSchema", () => {
  it("should identify .graphql files", () => {
    expect(isGraphQLSchema("schema.graphql")).toBe(true);
    expect(isGraphQLSchema("src/schema.graphql")).toBe(true);
    expect(isGraphQLSchema("api/types.graphql")).toBe(true);
  });

  it("should identify .gql files", () => {
    expect(isGraphQLSchema("schema.gql")).toBe(true);
    expect(isGraphQLSchema("src/queries.gql")).toBe(true);
  });

  it("should identify schema.graphqls and schema.sdl", () => {
    expect(isGraphQLSchema("schema.graphqls")).toBe(true);
    expect(isGraphQLSchema("schema.sdl")).toBe(true);
  });

  it("should reject non-GraphQL files", () => {
    expect(isGraphQLSchema("schema.json")).toBe(false);
    expect(isGraphQLSchema("graphql.ts")).toBe(false);
    expect(isGraphQLSchema("resolvers.ts")).toBe(false);
  });
});

describe("graphqlAnalyzer", () => {
  it("should detect GraphQL schema additions", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "schema.graphql",
          [
            "type User {",
            "  id: ID!",
            "  name: String!",
            "  email: String!",
            "}",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = graphqlAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as GraphQLChangeFinding;
    expect(finding.type).toBe("graphql-change");
    expect(finding.file).toBe("schema.graphql");
    expect(finding.isBreaking).toBe(false);
    expect(finding.addedElements).toContain("Added type: User");
  });

  it("should detect breaking changes (removed type)", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "schema.graphql",
          [],
          [
            "type OldUser {",
            "  id: ID!",
            "  name: String!",
            "}",
          ],
          "modified"
        ),
      ],
    });

    const findings = graphqlAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as GraphQLChangeFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingChanges).toContain("Removed type: OldUser");
    expect(finding.confidence).toBe("high");
  });

  it("should detect removed enum as breaking", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "schema.graphql",
          [],
          [
            "enum Status {",
            "  ACTIVE",
            "  INACTIVE",
            "}",
          ],
          "modified"
        ),
      ],
    });

    const findings = graphqlAnalyzer.analyze(changeSet);
    const finding = findings[0] as GraphQLChangeFinding;

    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingChanges).toContain("Removed enum: Status");
  });

  it("should detect removed interface as breaking", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "schema.graphql",
          [],
          [
            "interface Node {",
            "  id: ID!",
            "}",
          ],
          "modified"
        ),
      ],
    });

    const findings = graphqlAnalyzer.analyze(changeSet);
    const finding = findings[0] as GraphQLChangeFinding;

    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingChanges).toContain("Removed interface: Node");
  });

  it("should return empty for non-GraphQL files", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "src/resolvers.ts",
          ["export const resolvers = {}"],
          [],
          "added"
        ),
      ],
    });

    const findings = graphqlAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should have low confidence for additive-only changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "schema.gql",
          [
            "enum NewStatus {",
            "  PENDING",
            "  APPROVED",
            "}",
          ],
          [],
          "modified"
        ),
      ],
    });

    const findings = graphqlAnalyzer.analyze(changeSet);
    const finding = findings[0] as GraphQLChangeFinding;

    expect(finding.isBreaking).toBe(false);
    expect(finding.confidence).toBe("low");
  });
});
