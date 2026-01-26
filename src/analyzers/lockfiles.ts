/**
 * Lockfile analyzer - detects lockfile/manifest mismatches.
 */

import type {
  Analyzer,
  ChangeSet,
  FileDiff,
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
 * Dependency field names that require lockfile updates.
 */
const DEPENDENCY_FIELDS = [
  '"dependencies"',
  '"devDependencies"',
  '"peerDependencies"',
  '"optionalDependencies"',
  '"bundledDependencies"',
  '"bundleDependencies"',
];

/**
 * Top-level package.json field names that should NOT trigger lockfile mismatch.
 * These are metadata fields, not dependency specifications.
 */
const NON_DEPENDENCY_FIELDS = [
  "name",
  "version",
  "description",
  "main",
  "module",
  "types",
  "typings",
  "exports",
  "bin",
  "scripts",
  "repository",
  "keywords",
  "author",
  "license",
  "bugs",
  "homepage",
  "funding",
  "files",
  "engines",
  "os",
  "cpu",
  "private",
  "publishConfig",
  "workspaces",
  "packageManager",
  "type",
  "sideEffects",
  "browser",
  "unpkg",
  "jsdelivr",
];

/**
 * Version specifier patterns that indicate a dependency line.
 * These patterns appear in the value part of dependency entries.
 */
const VERSION_PATTERNS = [
  // Semver ranges: ^1.0.0, ~1.0.0, >=1.0.0, <=1.0.0, >1.0.0, <1.0.0, =1.0.0
  /"\s*[\^~>=<]?\d+\.\d+/,
  // Wildcard versions: *, x, 1.x, 1.x.x
  /"\s*[\*x]\s*"/,
  /"\s*\d+\.x/,
  // npm protocol: npm:package@version
  /"\s*npm:/,
  // Git URLs: git://, git+https://, git+ssh://
  /"\s*git(\+https?|\+ssh)?:/,
  // GitHub shorthand: github:user/repo, user/repo#tag
  /"\s*github:/,
  // File/link protocol: file:, link:
  /"\s*(file|link):/,
  // Workspace protocol: workspace:
  /"\s*workspace:/,
  // URL dependencies: https://, http://
  /"\s*https?:\/\//,
];

/**
 * Extract the field name from a JSON line like '"fieldName": value'.
 */
function extractFieldName(line: string): string | null {
  const match = line.match(/^\s*"([^"]+)"\s*:/);
  return match ? match[1] : null;
}

/**
 * Check if a line looks like a dependency entry (package with version).
 */
function isDependencyLine(line: string): boolean {
  // Must have the pattern: "package-name": "version-specifier"
  if (!/^\s*"[^"]+"\s*:\s*"/.test(line)) {
    return false;
  }

  // Exclude known top-level package.json fields
  const fieldName = extractFieldName(line);
  if (fieldName && NON_DEPENDENCY_FIELDS.includes(fieldName)) {
    return false;
  }

  // Check if value matches known version patterns
  return VERSION_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Check if a diff contains changes to dependency fields.
 * Returns true if any dependency-related field was added, removed, or modified.
 */
function hasDependencyChanges(diff: FileDiff): boolean {
  for (const hunk of diff.hunks) {
    const allChangedLines = [...hunk.additions, ...hunk.deletions];
    for (const line of allChangedLines) {
      // Check for dependency field declarations
      for (const field of DEPENDENCY_FIELDS) {
        if (line.includes(field)) {
          return true;
        }
      }
      // Check for package version patterns (e.g., "lodash": "^4.17.21")
      // This catches individual dependency additions/removals within a dependency block
      if (isDependencyLine(line)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Analyze lockfile changes.
 */
export const analyzeLockfiles: Analyzer = {
  name: "lockfiles",
  cacheScope: "files",
  filePatterns: [
    "package.json",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "bun.lock",
  ],
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: LockfileFinding[] = [];

    const manifestFile = changeSet.files.find(f => isPackageJson(f.path));
    const lockfileChanged = changeSet.files.some(f => isLockfile(f.path));

    // Check if dependencies actually changed in package.json
    let dependenciesChanged = false;
    if (manifestFile) {
      const manifestDiff = changeSet.diffs.find(d => isPackageJson(d.path));
      if (manifestDiff) {
        // Check diff content for dependency changes
        dependenciesChanged = hasDependencyChanges(manifestDiff);
      } else {
        // If we have a file change but no diff (e.g., newly added file),
        // assume dependencies could have changed
        dependenciesChanged = manifestFile.status === "added";
      }
    }

    // Flag if dependencies changed without lockfile or lockfile changed without manifest
    if ((dependenciesChanged && !lockfileChanged) || (!manifestFile && lockfileChanged)) {
      findings.push({
        type: "lockfile-mismatch",
        kind: "lockfile-mismatch",
        category: "dependencies",
        confidence: "high",
        evidence: [],
        manifestChanged: !!manifestFile,
        lockfileChanged,
      });
    }

    return findings;
  },
};
