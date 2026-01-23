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
import { vueProfile } from "./vue.js";
import { astroProfile } from "./astro.js";
import { angularProfile } from "./angular.js";
import { libraryProfile } from "./library.js";
import { pythonProfile } from "./python.js";
import { viteProfile } from "./vite.js";

// ============================================================================
// Cached filesystem check helpers for improved performance
// ============================================================================

/**
 * Cache for filesystem existence checks.
 * This reduces redundant I/O when detecting profiles.
 */
interface FileExistsCache {
  cache: Map<string, boolean>;
  check(path: string): boolean;
}

/**
 * Create a filesystem check cache for the given cwd.
 * All paths are resolved relative to cwd and results are memoized.
 */
function createFileExistsCache(cwd: string): FileExistsCache {
  const cache = new Map<string, boolean>();

  return {
    cache,
    check(relativePath: string): boolean {
      const fullPath = join(cwd, relativePath);
      if (cache.has(fullPath)) {
        return cache.get(fullPath)!;
      }
      const exists = existsSync(fullPath);
      cache.set(fullPath, exists);
      return exists;
    },
  };
}

/**
 * Batch check multiple paths and cache results.
 * This is useful for preloading commonly checked paths.
 */
function preloadFileExistsCache(
  fsCache: FileExistsCache,
  paths: string[]
): void {
  for (const path of paths) {
    fsCache.check(path);
  }
}

/**
 * All paths that are commonly checked during profile detection.
 * Pre-checking these in one batch reduces repeated filesystem calls.
 */
const COMMON_PROFILE_PATHS = [
  // SvelteKit
  "src/routes",
  // Next.js
  "app",
  "src/app",
  // Nuxt/Vue
  "pages",
  "src/pages",
  // Stencil
  "stencil.config.ts",
  "stencil.config.js",
  // Angular
  "angular.json",
  ".angular-cli.json",
  // Astro
  "astro.config.mjs",
  "astro.config.ts",
  "astro.config.js",
  // Vite
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.mts",
  // Python
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "poetry.lock",
  // Python frameworks
  "manage.py",
  "app/main.py",
  "src/main.py",
  "app/__init__.py",
];

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
 * Check if package.json contains Vue.js dependencies.
 */
export function hasVueDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(deps?.["vue"] || devDeps?.["vue"]);
}

/**
 * Check if package.json contains Nuxt dependency.
 */
export function hasNuxtDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(deps?.["nuxt"] || devDeps?.["nuxt"]);
}

/**
 * Check if project has Nuxt pages directory.
 */
export function isNuxtProject(cwd: string = process.cwd()): boolean {
  return existsSync(join(cwd, "pages")) || existsSync(join(cwd, "src", "pages"));
}

/**
 * Check if package.json contains Astro dependency.
 */
export function hasAstroDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(deps?.["astro"] || devDeps?.["astro"]);
}

/**
 * Check if package.json contains Angular dependencies.
 */
export function hasAngularDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(
    deps?.["@angular/core"] ||
    deps?.["@angular/common"] ||
    devDeps?.["@angular/core"] ||
    devDeps?.["@angular/common"]
  );
}

/**
 * Check if project has Angular config.
 */
export function hasAngularConfig(cwd: string = process.cwd()): boolean {
  return (
    existsSync(join(cwd, "angular.json")) ||
    existsSync(join(cwd, ".angular-cli.json"))
  );
}

/**
 * Check if project has Astro config.
 */
export function hasAstroConfig(cwd: string = process.cwd()): boolean {
  return (
    existsSync(join(cwd, "astro.config.mjs")) ||
    existsSync(join(cwd, "astro.config.ts")) ||
    existsSync(join(cwd, "astro.config.js"))
  );
}

/**
 * Check if project is a library/package (has exports or publishConfig).
 */
export function isLibraryProject(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  // Has exports field (modern package entry points)
  if (packageJson.exports) return true;

  // Has publishConfig (intended for publishing)
  if (packageJson.publishConfig) return true;

  // Has private: false (explicitly public)
  if (packageJson.private === false) return true;

  // Has bin field (CLI tool)
  if (packageJson.bin) return true;

  return false;
}

/**
 * Check if a project is a Python project.
 */
export function isPythonProject(cwd: string = process.cwd()): boolean {
  // Check for common Python project files
  const pythonFiles = [
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "Pipfile",
    "poetry.lock",
  ];

  return pythonFiles.some(file => existsSync(join(cwd, file)));
}

/**
 * Check if package.json contains Vite dependency.
 */
export function hasViteDependency(
  packageJson: Record<string, unknown> | undefined
): boolean {
  if (!packageJson) return false;

  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as
    | Record<string, string>
    | undefined;

  return Boolean(deps?.["vite"] || devDeps?.["vite"]);
}

/**
 * Check if project has Vite config.
 */
export function hasViteConfig(cwd: string = process.cwd()): boolean {
  return (
    existsSync(join(cwd, "vite.config.ts")) ||
    existsSync(join(cwd, "vite.config.js")) ||
    existsSync(join(cwd, "vite.config.mjs")) ||
    existsSync(join(cwd, "vite.config.mts"))
  );
}

/**
 * Check if a project has Python web framework markers.
 */
export function hasPythonWebFramework(cwd: string = process.cwd()): boolean {
  // Check for framework-specific directories/files
  const frameworkMarkers = [
    // Django
    "manage.py",
    // FastAPI common patterns
    "app/main.py",
    "src/main.py",
    // Flask
    "app/__init__.py",
  ];

  return frameworkMarkers.some(marker => existsSync(join(cwd, marker)));
}

/**
 * Detect Python framework from changeset files.
 */
export function detectPythonFramework(changeSet: ChangeSet): string | null {
  for (const file of changeSet.files) {
    // Django
    if (file.path.includes("/migrations/") && file.path.endsWith(".py")) {
      return "django";
    }
    if (file.path === "manage.py" || file.path.includes("urls.py")) {
      return "django";
    }

    // FastAPI/Flask detection from file content would need diff analysis
    // For now, check file patterns
    if (file.path.includes("routers/") || file.path.includes("endpoints/")) {
      return "fastapi";
    }

    // Alembic
    if (file.path.includes("alembic/versions/")) {
      return "alembic";
    }
  }

  return null;
}

/**
 * Detect the appropriate profile for a project with reasons.
 * Uses cached filesystem checks for improved performance.
 */
export function detectProfileWithReasons(
  changeSet: ChangeSet,
  cwd: string = process.cwd()
): ProfileDetectionResult {
  const reasons: string[] = [];

  // Create filesystem cache and preload common paths in one batch
  const fsCache = createFileExistsCache(cwd);
  preloadFileExistsCache(fsCache, COMMON_PROFILE_PATHS);

  // Use cached checks for all filesystem operations
  const hasSvelteRoutes = fsCache.check("src/routes");
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

  // Check for Stencil (using cached checks)
  const hasStencilDep = hasStencilDependency(changeSet.headPackageJson);
  const hasStencilConf = fsCache.check("stencil.config.ts") || fsCache.check("stencil.config.js");

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

  // Check for Next.js with App Router (using cached checks)
  const hasNext = hasNextDependency(changeSet.headPackageJson);
  const hasAppDir = fsCache.check("app") || fsCache.check("src/app");

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

  // Check for Vue/Nuxt (using cached checks)
  const hasVue = hasVueDependency(changeSet.headPackageJson);
  const hasNuxt = hasNuxtDependency(changeSet.headPackageJson);
  const isNuxt = fsCache.check("pages") || fsCache.check("src/pages");

  if (hasNuxt || (hasVue && isNuxt)) {
    if (hasNuxt) {
      reasons.push("Found nuxt in package.json dependencies");
    }
    if (hasVue) {
      reasons.push("Found vue in package.json dependencies");
    }
    if (isNuxt) {
      reasons.push("Found pages/ directory (Nuxt file-based routing)");
    }
    return {
      profile: "vue",
      confidence: "high",
      reasons,
    };
  }

  if (hasVue) {
    reasons.push("Found vue in package.json dependencies");
    return {
      profile: "vue",
      confidence: "medium",
      reasons,
    };
  }

  // Check for Astro (using cached checks)
  const hasAstro = hasAstroDependency(changeSet.headPackageJson);
  const hasAstroConf = fsCache.check("astro.config.mjs") ||
    fsCache.check("astro.config.ts") ||
    fsCache.check("astro.config.js");

  if (hasAstro || hasAstroConf) {
    if (hasAstro) {
      reasons.push("Found astro in package.json dependencies");
    }
    if (hasAstroConf) {
      reasons.push("Found astro.config.{mjs,ts,js}");
    }
    return {
      profile: "astro",
      confidence: hasAstro && hasAstroConf ? "high" : "medium",
      reasons,
    };
  }

  // Check for Angular (using cached checks)
  const hasAngular = hasAngularDependency(changeSet.headPackageJson);
  const hasAngularConf = fsCache.check("angular.json") || fsCache.check(".angular-cli.json");

  if (hasAngular || hasAngularConf) {
    if (hasAngular) {
      reasons.push("Found @angular/core or @angular/common in package.json dependencies");
    }
    if (hasAngularConf) {
      reasons.push("Found angular.json or .angular-cli.json");
    }
    return {
      profile: "angular",
      confidence: hasAngular && hasAngularConf ? "high" : "medium",
      reasons,
    };
  }

  // Check for Vite (using cached checks)
  const hasVite = hasViteDependency(changeSet.headPackageJson);
  const hasViteConf = fsCache.check("vite.config.ts") ||
    fsCache.check("vite.config.js") ||
    fsCache.check("vite.config.mjs") ||
    fsCache.check("vite.config.mts");

  if (hasVite && hasViteConf) {
    reasons.push("Found vite in package.json dependencies");
    reasons.push("Found vite.config.{ts,js,mjs,mts}");
    return {
      profile: "vite",
      confidence: "high",
      reasons,
    };
  }

  if (hasVite) {
    reasons.push("Found vite in package.json dependencies");
    return {
      profile: "vite",
      confidence: "medium",
      reasons,
    };
  }

  // Check for Library project (should be last before default for JS projects)
  const isLibrary = isLibraryProject(changeSet.headPackageJson);

  if (isLibrary) {
    if (changeSet.headPackageJson?.exports) {
      reasons.push("Found exports field in package.json");
    }
    if (changeSet.headPackageJson?.publishConfig) {
      reasons.push("Found publishConfig in package.json");
    }
    if (changeSet.headPackageJson?.bin) {
      reasons.push("Found bin field in package.json (CLI tool)");
    }
    if (changeSet.headPackageJson?.private === false) {
      reasons.push("Package marked as public (private: false)");
    }
    return {
      profile: "library",
      confidence: "medium",
      reasons,
    };
  }

  // Check for Python project (using cached checks)
  const isPython = fsCache.check("pyproject.toml") ||
    fsCache.check("setup.py") ||
    fsCache.check("setup.cfg") ||
    fsCache.check("requirements.txt") ||
    fsCache.check("Pipfile") ||
    fsCache.check("poetry.lock");

  const hasPythonFramework = fsCache.check("manage.py") ||
    fsCache.check("app/main.py") ||
    fsCache.check("src/main.py") ||
    fsCache.check("app/__init__.py");

  const pythonFramework = detectPythonFramework(changeSet);

  if (isPython || hasPythonFramework || pythonFramework) {
    if (isPython) {
      reasons.push("Found Python project files (pyproject.toml, requirements.txt, etc.)");
    }
    if (hasPythonFramework) {
      reasons.push("Found Python web framework markers (manage.py, main.py, etc.)");
    }
    if (pythonFramework) {
      reasons.push(`Detected ${pythonFramework} framework from changed files`);
    }
    return {
      profile: "python",
      confidence: isPython && (hasPythonFramework || pythonFramework) ? "high" : "medium",
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
    case "vue":
      return vueProfile;
    case "astro":
      return astroProfile;
    case "angular":
      return angularProfile;
    case "library":
      return libraryProfile;
    case "python":
      return pythonProfile;
    case "vite":
      return viteProfile;
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

export { defaultProfile, sveltekitProfile, reactProfile, stencilProfile, nextProfile, vueProfile, astroProfile, angularProfile, libraryProfile, pythonProfile, viteProfile };

