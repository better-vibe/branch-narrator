/**
 * Version information for the CLI.
 *
 * This is read from package.json at runtime to ensure consistency.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedVersion: string | null = null;

/**
 * Try to read and parse package.json from a given path.
 */
async function tryReadPackageJson(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Get the current version from package.json.
 * Result is cached for subsequent calls.
 *
 * Tries multiple paths to handle different execution contexts:
 * 1. Bundled CLI in dist/ -> ../package.json
 * 2. Unbundled source in src/core/ -> ../../package.json
 * 3. npm installed package -> package.json relative to dist/
 */
export async function getVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion;
  }

  // Try different paths to find package.json
  const possiblePaths = [
    // Bundled: dist/cli.js -> package.json is at ../package.json
    join(__dirname, "..", "package.json"),
    // Unbundled: src/core/version.ts -> package.json is at ../../package.json
    join(__dirname, "..", "..", "package.json"),
    // npm install: node_modules/@better-vibe/branch-narrator/dist/ -> ../package.json
    join(__dirname, "package.json"),
  ];

  for (const path of possiblePaths) {
    const version = await tryReadPackageJson(path);
    if (version) {
      cachedVersion = version;
      return version;
    }
  }

  // Fallback if we can't find package.json
  return "unknown";
}

/**
 * Get version synchronously (returns cached value or "unknown").
 * Use getVersion() for the first call to ensure version is loaded.
 */
export function getVersionSync(): string {
  return cachedVersion ?? "unknown";
}
