/**
 * Profile detection and management.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangeSet, Profile, ProfileName } from "../core/types.js";
import { defaultProfile } from "./default.js";
import { sveltekitProfile } from "./sveltekit.js";

/**
 * Check if a project is a SvelteKit project.
 */
export function isSvelteKitProject(cwd: string = process.cwd()): boolean {
  // Check for src/routes directory
  if (existsSync(join(cwd, "src", "routes"))) {
    return true;
  }

  return false;
}

/**
 * Check if package.json contains @sveltejs/kit.
 */
export function hasSvelteKitDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(
    deps?.["@sveltejs/kit"] || devDeps?.["@sveltejs/kit"]
  );
}

/**
 * Detect the appropriate profile for a project.
 */
export function detectProfile(
  changeSet: ChangeSet,
  cwd: string = process.cwd()
): ProfileName {
  // Check for SvelteKit
  if (
    isSvelteKitProject(cwd) ||
    hasSvelteKitDependency(changeSet.headPackageJson)
  ) {
    return "sveltekit";
  }

  // Default to auto (generic profile)
  return "auto";
}

/**
 * Get profile by name.
 */
export function getProfile(name: ProfileName): Profile {
  switch (name) {
    case "sveltekit":
      return sveltekitProfile;
    case "auto":
      return defaultProfile;
    default:
      return defaultProfile;
  }
}

/**
 * Resolve profile name (handle 'auto').
 */
export function resolveProfileName(
  name: ProfileName,
  changeSet: ChangeSet,
  cwd: string = process.cwd()
): ProfileName {
  if (name === "auto") {
    return detectProfile(changeSet, cwd);
  }
  return name;
}

export { defaultProfile, sveltekitProfile };

