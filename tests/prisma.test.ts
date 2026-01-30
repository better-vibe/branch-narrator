import { describe, it, expect } from "bun:test";
import { prismaAnalyzer, isPrismaSchema, isPrismaMigration } from "../src/analyzers/prisma.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("prismaAnalyzer", () => {
  describe("isPrismaSchema", () => {
    it("should detect schema.prisma", () => {
      expect(isPrismaSchema("prisma/schema.prisma")).toBe(true);
      expect(isPrismaSchema("schema.prisma")).toBe(true);
    });

    it("should detect .prisma files", () => {
      expect(isPrismaSchema("prisma/models.prisma")).toBe(true);
    });

    it("should reject non-prisma files", () => {
      expect(isPrismaSchema("src/index.ts")).toBe(false);
    });
  });

  describe("isPrismaMigration", () => {
    it("should detect prisma migration files", () => {
      expect(isPrismaMigration("prisma/migrations/20240101_init/migration.sql")).toBe(true);
    });

    it("should reject non-migration files", () => {
      expect(isPrismaMigration("src/index.ts")).toBe(false);
    });
  });

  describe("analyze", () => {
    it("should detect added models", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("prisma/schema.prisma", [
            "model User {",
            "  id    Int    @id @default(autoincrement())",
            "  email String @unique",
            "}",
          ]),
        ],
      });

      const findings = prismaAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("prisma-schema");
      const finding = findings[0] as any;
      expect(finding.addedModels).toContain("User");
      expect(finding.isBreaking).toBe(false);
    });

    it("should detect removed models as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "prisma/schema.prisma",
            [],
            [
              "model OldUser {",
              "  id Int @id",
              "}",
            ]
          ),
        ],
      });

      const findings = prismaAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.removedModels).toContain("OldUser");
    });

    it("should detect modified models", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "prisma/schema.prisma",
            [
              "model User {",
              "  id    Int    @id",
              "  email String @unique",
              "  name  String",
              "}",
            ],
            [
              "model User {",
              "  id    Int    @id",
              "  email String @unique",
              "}",
            ]
          ),
        ],
      });

      const findings = prismaAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.modifiedModels).toContain("User");
    });

    it("should return empty for non-prisma files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
        headPackageJson: {
          dependencies: { "@prisma/client": "^5.0.0" },
        },
      });

      const findings = prismaAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should skip entirely when project has no prisma dependency and no prisma files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
        headPackageJson: {
          dependencies: { react: "^18.0.0" },
        },
      });

      const findings = prismaAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should still analyze when prisma files are present even without dependency", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("prisma/schema.prisma", [
            "model User {",
            "  id Int @id",
            "}",
          ]),
        ],
        headPackageJson: {
          dependencies: { react: "^18.0.0" },
        },
      });

      const findings = prismaAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should skip migration SQL files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("prisma/migrations/20240101_init/migration.sql", [
            "CREATE TABLE users (id INT);",
          ]),
        ],
      });

      const findings = prismaAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
