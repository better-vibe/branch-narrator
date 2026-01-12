/**
 * Lockfile analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeLockfiles } from "../src/analyzers/lockfiles.js";
import type { LockfileFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("analyzeLockfiles", () => {
  describe("lockfile detection", () => {
    it("should recognize package-lock.json", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("package-lock.json", "modified"),
        ],
      });

      // Both changed, so no mismatch
      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should recognize yarn.lock", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("yarn.lock", "modified"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should recognize pnpm-lock.yaml", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("pnpm-lock.yaml", "modified"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should recognize bun.lockb", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("bun.lockb", "modified"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should recognize bun.lock", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("bun.lock", "modified"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("manifest without lockfile mismatch", () => {
    it("should detect package.json changed without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.type).toBe("lockfile-mismatch");
      expect(finding.manifestChanged).toBe(true);
      expect(finding.lockfileChanged).toBe(false);
    });

    it("should detect package.json added without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "added")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.manifestChanged).toBe(true);
      expect(finding.lockfileChanged).toBe(false);
    });
  });

  describe("lockfile without manifest mismatch", () => {
    it("should detect lockfile changed without package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package-lock.json", "modified")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.type).toBe("lockfile-mismatch");
      expect(finding.manifestChanged).toBe(false);
      expect(finding.lockfileChanged).toBe(true);
    });

    it("should detect yarn.lock changed without package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("yarn.lock", "modified")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.lockfileChanged).toBe(true);
      expect(finding.manifestChanged).toBe(false);
    });

    it("should detect pnpm-lock.yaml changed without package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("pnpm-lock.yaml", "modified")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect bun.lockb changed without package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("bun.lockb", "modified")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });

  describe("no mismatch cases", () => {
    it("should not flag when both manifest and lockfile change", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("package-lock.json", "modified"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when multiple lockfiles change with manifest", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("yarn.lock", "modified"),
          createFileChange("pnpm-lock.yaml", "deleted"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when neither manifest nor lockfile changes", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("src/index.ts", "modified"),
          createFileChange("README.md", "modified"),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag empty changesets", () => {
      const changeSet = createChangeSet({
        files: [],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("nested package.json", () => {
    it("should not detect nested package.json as root manifest", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("packages/core/package.json", "modified")],
      });

      // Should not trigger because it's not root package.json
      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("finding properties", () => {
    it("should have correct category and confidence", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      const finding = findings[0] as LockfileFinding;

      expect(finding.kind).toBe("lockfile-mismatch");
      expect(finding.category).toBe("dependencies");
      expect(finding.confidence).toBe("high");
    });
  });
});
