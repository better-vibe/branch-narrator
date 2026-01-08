/**
 * Profile detection and management.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangeSet, Profile, ProfileName } from "../core/types.js";
import { defaultProfile } from "./default.js";
import { sveltekitProfile } from "./sveltekit.js";
import { reactProfile } from "./react.js";
import { stencilProfile } from "./stencil.js";
import { nextProfile } from "./next.js";

/**
 * Result of profile detection with reasons.
 */
export interface ProfileDetectionResult {
  profile: ProfileName;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

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
 * Check if package.json contains Stencil dependency.
 */
export function hasStencilDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(deps?.["@stencil/core"] || devDeps?.["@stencil/core"]);
}

/**
 * Check if Stencil config exists.
 */
export function hasStencilConfig(cwd: string = process.cwd()): boolean {
  return existsSync(join(cwd, "stencil.config.ts")) || existsSync(join(cwd, "stencil.config.js"));
}

/**
 * Check if a project has Next.js App Router directory.
 */
export function isNextAppDir(cwd: string = process.cwd()): boolean {
  // Check for app/ directory (Next.js 13+ App Router)
  if (existsSync(join(cwd, "app"))) {
    return true;
  }
  // Check for src/app/ directory
  if (existsSync(join(cwd, "src", "app"))) {
    return true;
  }
  return false;
}

/**
 * Detect the appropriate profile for a project with reasons.
 */
export function detectProfileWithReasons(
  changeSet: ChangeSet,
  cwd: string = process.cwd()
): ProfileDetectionResult {
  const reasons: string[] = [];

  // Check for SvelteKit
  const hasSvelteRoutes = isSvelteKitProject(cwd);
  const hasSvelteDep = hasSvelteKitDependency(changeSet.headPackageJson);

  if (hasSvelteRoutes || hasSvelteDep) {
    if (hasSvelteRoutes) {
      reasons.push("Found src/routes/ directory (SvelteKit file-based routing)");
    }
    if (hasSvelteDep) {
      reasons.push("Found @sveltejs/kit in package.json dependencies");
    }
    return {
      profile: "sveltekit",
      confidence: hasSvelteRoutes && hasSvelteDep ? "high" : "high",
      reasons,
    };
  }

  // Check for Stencil
  const hasStencilDep = hasStencilDependency(changeSet.headPackageJson);
  const hasStencilConf = hasStencilConfig(cwd);

  if (hasStencilDep || hasStencilConf) {
    if (hasStencilDep) {
      reasons.push("Found @stencil/core in package.json dependencies");
    }
    if (hasStencilConf) {
      reasons.push("Found stencil.config.ts or stencil.config.js");
    }
    return {
      profile: "stencil",
      confidence: hasStencilDep && hasStencilConf ? "high" : "high",
      reasons,
    };
  }

  // Check for Next.js with App Router
  const hasNext = hasNextDependency(changeSet.headPackageJson);
  const hasAppDir = isNextAppDir(cwd);

  if (hasNext && hasAppDir) {
    reasons.push("Found next in package.json dependencies");
    reasons.push("Found app/ directory (Next.js App Router)");
    return {
      profile: "next",
      confidence: "high",
      reasons,
    };
  }

  if (hasNext) {
    reasons.push("Found next in package.json dependencies");
    return {
      profile: "next",
      confidence: "medium",
      reasons,
    };
  }

  // Check for React with React Router (only if not Next.js)
  const hasReact = hasReactDependency(changeSet.headPackageJson);
  const hasRouter = hasReactRouterDependency(changeSet.headPackageJson);

  if (hasReact && hasRouter) {
    reasons.push("Found react and react-dom in package.json dependencies");
    reasons.push("Found react-router or react-router-dom in package.json dependencies");
    return {
      profile: "react",
      confidence: "high",
      reasons,
    };
  }

  // Default profile
  reasons.push("No framework-specific markers detected, using default analyzers");
  return {
    profile: "auto",
    confidence: "medium",
    reasons,
  };
}

/**
 * Detect the appropriate profile for a project.
 * @deprecated Use detectProfileWithReasons for more detailed information.
 */
export function detectProfile(
  changeSet: ChangeSet,
  cwd: string = process.cwd()
): ProfileName {
  return detectProfileWithReasons(changeSet, cwd).profile;
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
    case "stencil":
      return stencilProfile;
    case "next":
      return nextProfile;
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

export { defaultProfile, sveltekitProfile, reactProfile, stencilProfile, nextProfile };

