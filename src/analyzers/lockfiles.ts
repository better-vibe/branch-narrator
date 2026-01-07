/**
 * Lockfile analyzer - detects lockfile/manifest mismatches.
 */

import type {
  Analyzer,
  ChangeSet,
  Finding,
  LockfileFinding,
} from "../core/types.js";

/**
 * Check if a file is package.json.
 */
function isPackageJson(path: string): boolean {
  return path === "package.json";
}

/**
 * Check if a file is a lockfile.
 */
function isLockfile(path: string): boolean {
  return (
    path === "package-lock.json" ||
    path === "yarn.lock" ||
    path === "pnpm-lock.yaml" ||
    path === "bun.lockb" ||
    path === "bun.lock"
  );
}

/**
 * Analyze lockfile changes.
 */
export const analyzeLockfiles: Analyzer = {
  name: "lockfiles",
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: LockfileFinding[] = [];

    const manifestChanged = changeSet.files.some(f => isPackageJson(f.path));
    const lockfileChanged = changeSet.files.some(f => isLockfile(f.path));

    // Flag if lockfile changed without manifest or vice versa
    if ((manifestChanged && !lockfileChanged) || (!manifestChanged && lockfileChanged)) {
      findings.push({
        type: "lockfile-mismatch",
        kind: "lockfile-mismatch",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        manifestChanged,
        lockfileChanged,
      });
    }

    return findings;
  },
};
