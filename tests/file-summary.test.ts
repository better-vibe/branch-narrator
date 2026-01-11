/**
 * File summary analyzer tests - focusing on changeDescriptions detection.
 */

import { describe, expect, it } from "bun:test";
import { fileSummaryAnalyzer } from "../src/analyzers/file-summary.js";
import type { FileSummaryFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("fileSummaryAnalyzer", () => {
  describe("basic file tracking", () => {
    it("should track added files", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/new-file.ts", status: "added" }],
        diffs: [createFileDiff("src/new-file.ts", ["export const x = 1;"], [], "added")],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as FileSummaryFinding;
      expect(finding.added).toContain("src/new-file.ts");
    });

    it("should track modified files", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/existing.ts", status: "modified" }],
        diffs: [createFileDiff("src/existing.ts", ["// change"], ["// old"])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.modified).toContain("src/existing.ts");
    });

    it("should track deleted files", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/removed.ts", status: "deleted" }],
        diffs: [],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.deleted).toContain("src/removed.ts");
    });

    it("should track renamed files", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/new-name.ts", status: "renamed", oldPath: "src/old-name.ts" }],
        diffs: [],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.renamed).toContainEqual({ from: "src/old-name.ts", to: "src/new-name.ts" });
    });
  });

  describe("changeDescriptions - function detection", () => {
    it("should detect added function declarations", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/utils.ts", status: "modified" }],
        diffs: [createFileDiff("src/utils.ts", [
          "export function calculateTotal(items: Item[]): number {",
          "  return items.reduce((sum, i) => sum + i.price, 0);",
          "}",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions).toBeDefined();
      expect(finding.changeDescriptions?.[0].description).toContain("calculateTotal");
    });

    it("should detect modified function declarations", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/utils.ts", status: "modified" }],
        diffs: [createFileDiff("src/utils.ts", [
          "export function process(data: Data): Result {",
          "  return { success: true, data };",
          "}",
        ], [
          "export function process(data: Data): Result {",
          "  return { success: false };",
          "}",
        ])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Modified function: process\(\)/);
    });

    it("should detect async function declarations", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/api.ts", status: "modified" }],
        diffs: [createFileDiff("src/api.ts", [
          "export async function fetchData(): Promise<Data> {",
          "  return await fetch('/api/data');",
          "}",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("fetchData");
    });
  });

  describe("changeDescriptions - arrow function exports", () => {
    it("should detect arrow function exports", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/handlers.ts", status: "modified" }],
        diffs: [createFileDiff("src/handlers.ts", [
          "export const handleClick = () => {",
          "  console.log('clicked');",
          "};",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("handleClick");
    });

    it("should detect async arrow function exports", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/api.ts", status: "modified" }],
        diffs: [createFileDiff("src/api.ts", [
          "export const fetchUsers = async () => {",
          "  return await api.get('/users');",
          "};",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("fetchUsers");
    });

    it("should detect arrow functions with type annotations", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/utils.ts", status: "modified" }],
        diffs: [createFileDiff("src/utils.ts", [
          "export const transform = (data: Input): Output => {",
          "  return { result: data.value * 2 };",
          "};",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("transform");
    });
  });

  describe("changeDescriptions - class detection", () => {
    it("should detect added class declarations", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/models/User.ts", status: "added" }],
        diffs: [createFileDiff("src/models/User.ts", [
          "export class User {",
          "  constructor(public name: string) {}",
          "}",
        ], [], "added")],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Added class: User/);
    });

    it("should detect modified class declarations", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/models/User.ts", status: "modified" }],
        diffs: [createFileDiff("src/models/User.ts", [
          "export class UserService {",
          "  getAll() { return []; }",
          "}",
        ], [
          "export class UserService {",
          "  findAll() { return []; }",
          "}",
        ])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Modified class: UserService/);
    });
  });

  describe("changeDescriptions - interface and type detection", () => {
    it("should detect added interface", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/types.ts", status: "modified" }],
        diffs: [createFileDiff("src/types.ts", [
          "export interface UserProfile {",
          "  id: string;",
          "  name: string;",
          "}",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("UserProfile");
    });

    it("should detect added type alias", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/types.ts", status: "modified" }],
        diffs: [createFileDiff("src/types.ts", [
          "export type Status = 'pending' | 'active' | 'completed';",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("Status");
    });
  });

  describe("changeDescriptions - enum detection", () => {
    it("should detect added enum", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/enums.ts", status: "modified" }],
        diffs: [createFileDiff("src/enums.ts", [
          "export enum Priority {",
          "  Low = 'low',",
          "  Medium = 'medium',",
          "  High = 'high',",
          "}",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("Priority");
    });
  });

  describe("changeDescriptions - const exports", () => {
    it("should detect exported const array", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/constants.ts", status: "modified" }],
        diffs: [createFileDiff("src/constants.ts", [
          "export const ALLOWED_ORIGINS = [",
          "  'http://localhost:3000',",
          "  'https://example.com',",
          "];",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("ALLOWED_ORIGINS");
    });

    it("should detect exported const object", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/defaults.ts", status: "modified" }],
        diffs: [createFileDiff("src/defaults.ts", [
          "export const DEFAULT_SETTINGS = {",
          "  timeout: 5000,",
          "  retries: 3,",
          "};",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toContain("DEFAULT_SETTINGS");
    });
  });

  describe("changeDescriptions - re-exports", () => {
    it("should detect star re-exports", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/index.ts", status: "modified" }],
        diffs: [createFileDiff("src/index.ts", [
          "export * from './utils.js';",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Re-exports from:.*utils/);
    });

    it("should detect named re-exports", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/index.ts", status: "modified" }],
        diffs: [createFileDiff("src/index.ts", [
          "export { foo, bar, baz } from './helpers.js';",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Re-exports:.*foo/);
    });
  });

  describe("changeDescriptions - import changes", () => {
    it("should detect new imports", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/component.ts", status: "modified" }],
        diffs: [createFileDiff("src/component.ts", [
          "import { useState, useEffect } from 'react';",
          "import { Button } from './Button';",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/New imports:/);
    });
  });

  describe("changeDescriptions - switch case changes", () => {
    it("should detect new switch cases", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/reducer.ts", status: "modified" }],
        diffs: [createFileDiff("src/reducer.ts", [
          "case 'NEW_ACTION':",
          "  return { ...state, loading: true };",
          "case 'ANOTHER_ACTION':",
          "  return { ...state, data: action.payload };",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Added cases:/);
    });
  });

  describe("changeDescriptions - CLI options", () => {
    it("should detect new CLI options", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/cli.ts", status: "modified" }],
        diffs: [createFileDiff("src/cli.ts", [
          ".option('--verbose', 'Enable verbose output')",
          ".option('--dry-run', 'Run without making changes')",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/Added CLI options:/);
    });
  });

  describe("changeDescriptions - path-based detection", () => {
    it("should detect test file updates", () => {
      const changeSet = createChangeSet({
        files: [{ path: "tests/utils.test.ts", status: "modified" }],
        diffs: [createFileDiff("tests/utils.test.ts", ["it('should work', () => {})"], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toBe("Updated tests");
    });

    it("should detect new test files", () => {
      const changeSet = createChangeSet({
        files: [{ path: "tests/new.test.ts", status: "added" }],
        diffs: [createFileDiff("tests/new.test.ts", ["describe('new', () => {})"], [], "added")],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toBe("New test file");
    });

    it("should detect documentation updates", () => {
      const changeSet = createChangeSet({
        files: [{ path: "docs/guide.md", status: "modified" }],
        diffs: [createFileDiff("docs/guide.md", ["# New section"], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toBe("Documentation update");
    });

    it("should detect configuration updates", () => {
      const changeSet = createChangeSet({
        files: [{ path: "tsconfig.json", status: "modified" }],
        diffs: [createFileDiff("tsconfig.json", ['"strict": true'], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toBe("Configuration update");
    });

    it("should detect new command modules", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/commands/deploy/index.ts", status: "added" }],
        diffs: [createFileDiff("src/commands/deploy/index.ts", ["export const deploy = {}"], [], "added")],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toBe("New command module");
    });
  });

  describe("changeDescriptions - multi-change handling", () => {
    it("should show count for multiple changes", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/utils.ts", status: "modified" }],
        diffs: [createFileDiff("src/utils.ts", [
          "export function foo() {}",
          "export function bar() {}",
          "export function baz() {}",
          "export const CONFIG = {};",
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      expect(finding.changeDescriptions?.[0].description).toMatch(/\+\d+ more/);
    });

    it("should prioritize higher-priority changes", () => {
      const changeSet = createChangeSet({
        files: [{ path: "src/index.ts", status: "modified" }],
        diffs: [createFileDiff("src/index.ts", [
          "export function mainFunction() { return 1; }",  // priority 100
          "import { helper } from './helper';",            // priority 40
        ], [])],
      });

      const findings = fileSummaryAnalyzer.analyze(changeSet);
      const finding = findings[0] as FileSummaryFinding;
      // Should show function (priority 100) not import (priority 40)
      expect(finding.changeDescriptions?.[0].description).toContain("mainFunction");
    });
  });
});
