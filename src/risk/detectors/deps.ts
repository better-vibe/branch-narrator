/**
 * Dependency change detectors.
 */

import * as semver from "semver";
import type { ChangeSet, RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

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
    path === "bun.lockb"
  );
}

/**
 * Get dependencies from package.json object.
 */
function getDeps(pkg: Record<string, unknown> | undefined): Record<string, string> {
  if (!pkg || typeof pkg !== "object") return {};
  const deps = pkg.dependencies as Record<string, string> | undefined;
  return deps && typeof deps === "object" ? deps : {};
}

/**
 * Get devDependencies from package.json object.
 */
function getDevDeps(pkg: Record<string, unknown> | undefined): Record<string, string> {
  if (!pkg || typeof pkg !== "object") return {};
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return devDeps && typeof devDeps === "object" ? devDeps : {};
}

/**
 * Detect new production dependencies.
 */
export const detectNewProdDependency: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const baseDeps = getDeps(changeSet.basePackageJson);
  const headDeps = getDeps(changeSet.headPackageJson);

  const newDeps = Object.keys(headDeps).filter(name => !(name in baseDeps));

  if (newDeps.length > 0) {
    const evidence: RiskFlagEvidence[] = [{
      file: "package.json",
      lines: newDeps.slice(0, 5).map(name => `+ "${name}": "${headDeps[name]}"`),
    }];

    flags.push({
      id: "deps.new_prod_dependency",
      category: "deps",
      score: 15,
      confidence: 0.85,
      title: "New production dependencies added",
      summary: `${newDeps.length} new production ${newDeps.length === 1 ? "dependency" : "dependencies"} added`,
      evidence,
      suggestedChecks: [
        "Review new dependencies for security vulnerabilities",
        "Check license compatibility",
        "Verify dependencies are actively maintained",
      ],
      tags: newDeps,
      effectiveScore: Math.round(15 * 0.85),
    });
  }

  return flags;
};

/**
 * Detect major version bumps in dependencies.
 */
export const detectMajorBump: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const baseDeps = { ...getDeps(changeSet.basePackageJson), ...getDevDeps(changeSet.basePackageJson) };
  const headDeps = { ...getDeps(changeSet.headPackageJson), ...getDevDeps(changeSet.headPackageJson) };

  const majorBumps: Array<{ name: string; from: string; to: string; isRuntime: boolean }> = [];

  for (const [name, toVersion] of Object.entries(headDeps)) {
    const fromVersion = baseDeps[name];
    if (!fromVersion) continue; // New dependency, handled elsewhere

    const fromClean = semver.coerce(fromVersion);
    const toClean = semver.coerce(toVersion);

    if (fromClean && toClean && semver.major(toClean) > semver.major(fromClean)) {
      const isRuntime = name in getDeps(changeSet.headPackageJson);
      majorBumps.push({ name, from: fromVersion, to: toVersion, isRuntime });
    }
  }

  if (majorBumps.length > 0) {
    const runtimeBumps = majorBumps.filter(b => b.isRuntime);
    const score = runtimeBumps.length > 0 ? 25 : 20;

    const evidence: RiskFlagEvidence[] = [{
      file: "package.json",
      lines: majorBumps.slice(0, 5).map(b => `  "${b.name}": "${b.from}" → "${b.to}"`),
    }];

    flags.push({
      id: "deps.major_bump",
      category: "deps",
      score,
      confidence: 0.8,
      title: "Major version bumps detected",
      summary: `${majorBumps.length} major version ${majorBumps.length === 1 ? "bump" : "bumps"} (${runtimeBumps.length} runtime)`,
      evidence,
      suggestedChecks: [
        "Review breaking changes in CHANGELOG",
        "Test thoroughly after major version bumps",
        "Check migration guides from package authors",
      ],
      tags: majorBumps.map(b => b.name),
      effectiveScore: Math.round(score * 0.8),
    });
  }

  return flags;
};

/**
 * Detect lockfile changed without manifest.
 */
export const detectLockfileWithoutManifest: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  
  const lockfileChanged = changeSet.files.some(f => isLockfile(f.path));
  const packageJsonChanged = changeSet.files.some(f => isPackageJson(f.path));

  if (lockfileChanged && !packageJsonChanged) {
    const lockfiles = changeSet.files.filter(f => isLockfile(f.path));
    const evidence: RiskFlagEvidence[] = lockfiles.map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "deps.lockfile_changed_without_manifest",
      category: "deps",
      score: 12,
      confidence: 0.8,
      title: "Lockfile changed without package.json",
      summary: "Lockfile was updated but package.json was not modified",
      evidence,
      suggestedChecks: [
        "Verify this is intentional (e.g., lockfile-only update)",
        "Check if dependencies were updated indirectly",
        "Ensure lockfile is in sync with package.json",
      ],
      effectiveScore: Math.round(12 * 0.8),
    });
  }

  return flags;
};
