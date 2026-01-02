/**
 * Profile detection and management.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangeSet, Profile, ProfileName } from "../core/types.js";
import { defaultProfile } from "./default.js";
import { sveltekitProfile } from "./sveltekit.js";
import { reactProfile } from "./react.js";

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
 * Check if package.json contains React dependencies.
 */
export function hasReactDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(
    (deps?.["react"] && deps?.["react-dom"]) ||
    (devDeps?.["react"] && devDeps?.["react-dom"])
  );
}

/**
 * Check if package.json contains React Router dependencies.
 */
export function hasReactRouterDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(
    deps?.["react-router"] ||
    deps?.["react-router-dom"] ||
    devDeps?.["react-router"] ||
    devDeps?.["react-router-dom"]
  );
}

/**
 * Check if package.json contains Next.js dependency.
 */
export function hasNextDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(deps?.["next"] || devDeps?.["next"]);
}

/**
 * Detect the appropriate profile for a project.
 */
export function detectProfile(
  changeSet: ChangeSet,
  cwd: string = process.cwd()
): ProfileName {
  // Check for SvelteKit first
  if (
    isSvelteKitProject(cwd) ||
    hasSvelteKitDependency(changeSet.headPackageJson)
  ) {
    return "sveltekit";
  }

  // Check for React with React Router
  // Only use React profile if React Router is present and Next.js is not
  if (
    hasReactDependency(changeSet.headPackageJson) &&
    hasReactRouterDependency(changeSet.headPackageJson) &&
    !hasNextDependency(changeSet.headPackageJson)
  ) {
    return "react";
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
    case "react":
      return reactProfile;
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

export { defaultProfile, sveltekitProfile, reactProfile };

