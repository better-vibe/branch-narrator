/**
 * Lockfile analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { analyzeLockfiles } from "../src/analyzers/lockfiles.js";
import type { LockfileFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange, createFileDiff } from "./fixtures/index.js";

describe("analyzeLockfiles", () => {
  describe("lockfile detection", () => {
    it("should recognize package-lock.json", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("package-lock.json", "modified"),
        ],
        diffs: [
          createFileDiff("package.json", ['"lodash": "^4.17.21"']),
          createFileDiff("package-lock.json", ["lockfile content"]),
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
        diffs: [
          createFileDiff("package.json", ['"dependencies": {']),
          createFileDiff("yarn.lock", ["lockfile content"]),
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
        diffs: [
          createFileDiff("package.json", ['"devDependencies": {']),
          createFileDiff("pnpm-lock.yaml", ["lockfile content"]),
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
        diffs: [
          createFileDiff("package.json", ['"peerDependencies": {']),
          createFileDiff("bun.lockb", []),
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
        diffs: [
          createFileDiff("package.json", ['"optionalDependencies": {']),
          createFileDiff("bun.lock", ["lockfile content"]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("manifest without lockfile mismatch", () => {
    it("should detect dependency changes without lockfile update", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"lodash": "^4.17.21"']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.type).toBe("lockfile-mismatch");
      expect(finding.manifestChanged).toBe(true);
      expect(finding.lockfileChanged).toBe(false);
    });

    it("should detect devDependencies changes without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"devDependencies": {']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.manifestChanged).toBe(true);
    });

    it("should detect peerDependencies changes without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"peerDependencies": {']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect package.json added without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "added")],
        // New files may not have diffs, assume dependencies exist
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);

      const finding = findings[0] as LockfileFinding;
      expect(finding.manifestChanged).toBe(true);
      expect(finding.lockfileChanged).toBe(false);
    });

    it("should detect bundledDependencies changes without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"bundledDependencies": [']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });

  describe("lockfile without manifest mismatch", () => {
    it("should detect lockfile changed without package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package-lock.json", "modified")],
        diffs: [
          createFileDiff("package-lock.json", ["lockfile content"]),
        ],
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
        diffs: [
          createFileDiff("yarn.lock", ["lockfile content"]),
        ],
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
        diffs: [
          createFileDiff("pnpm-lock.yaml", ["lockfile content"]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect bun.lockb changed without package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("bun.lockb", "modified")],
        diffs: [
          createFileDiff("bun.lockb", []),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });

  describe("no mismatch cases", () => {
    it("should not flag when both manifest dependencies and lockfile change", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("package-lock.json", "modified"),
        ],
        diffs: [
          createFileDiff("package.json", ['"lodash": "^4.17.21"']),
          createFileDiff("package-lock.json", ["lockfile content"]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when multiple lockfiles change with manifest dependencies", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("yarn.lock", "modified"),
          createFileChange("pnpm-lock.yaml", "deleted"),
        ],
        diffs: [
          createFileDiff("package.json", ['"dependencies": {']),
          createFileDiff("yarn.lock", ["lockfile content"]),
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
        diffs: [
          createFileDiff("src/index.ts", ["code changes"]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag empty changesets", () => {
      const changeSet = createChangeSet({
        files: [],
        diffs: [],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("scripts-only changes (should NOT flag)", () => {
    it("should not flag when only scripts change in package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [
            '"scripts": {',
            '  "build": "tsc",',
            '  "test": "vitest"',
            '}',
          ]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when only name changes in package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"name": "my-package"']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when only version changes in package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"version": "2.0.0"']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when only description changes in package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", ['"description": "A great package"']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when only main/exports change in package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [
            '"main": "./dist/index.js"',
            '"exports": {',
            '  ".": "./dist/index.js"',
            '}',
          ]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when only repository/author/license change", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [
            '"repository": "github:user/repo"',
            '"author": "John Doe"',
            '"license": "MIT"',
          ]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when only keywords change in package.json", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [
            '"keywords": ["cli", "tool"]',
          ]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });

    it("should not flag when engines field changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [
            '"engines": {',
            '  "node": ">=18"',
            '}',
          ]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("mixed changes", () => {
    it("should flag when scripts AND dependencies change without lockfile", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [
            '"scripts": {',
            '  "test": "vitest"',
            '}',
            '"dependencies": {',
            '  "lodash": "^4.17.21"',
            '}',
          ]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should not flag when scripts AND dependencies change WITH lockfile", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("package.json", "modified"),
          createFileChange("package-lock.json", "modified"),
        ],
        diffs: [
          createFileDiff("package.json", [
            '"scripts": {',
            '  "test": "vitest"',
            '}',
            '"dependencies": {',
            '  "lodash": "^4.17.21"',
            '}',
          ]),
          createFileDiff("package-lock.json", ["lockfile content"]),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });

  describe("nested package.json", () => {
    it("should not detect nested package.json as root manifest", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("packages/core/package.json", "modified")],
        diffs: [
          createFileDiff("packages/core/package.json", ['"lodash": "^4.17.21"']),
        ],
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
        diffs: [
          createFileDiff("package.json", ['"dependencies": {']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      const finding = findings[0] as LockfileFinding;

      expect(finding.kind).toBe("lockfile-mismatch");
      expect(finding.category).toBe("dependencies");
      expect(finding.confidence).toBe("high");
    });
  });

  describe("dependency deletion detection", () => {
    it("should detect dependency removal without lockfile update", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [], ['"lodash": "^4.17.21"']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });

    it("should detect dependencies block removal", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("package.json", "modified")],
        diffs: [
          createFileDiff("package.json", [], ['"devDependencies": {']),
        ],
      });

      const findings = analyzeLockfiles.analyze(changeSet);
      expect(findings).toHaveLength(1);
    });
  });
});
