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
 * Get the current version from package.json.
 * Result is cached for subsequent calls.
 */
export async function getVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    // Read package.json from project root
    const packagePath = join(__dirname, "..", "..", "package.json");
    const packageContent = await readFile(packagePath, "utf-8");
    const packageJson = JSON.parse(packageContent);
    
    cachedVersion = packageJson.version || "unknown";
    return cachedVersion;
  } catch (error) {
    // Fallback if we can't read package.json
    return "unknown";
  }
}

/**
 * Get version synchronously (returns cached value or "unknown").
 * Use getVersion() for the first call to ensure version is loaded.
 */
export function getVersionSync(): string {
  return cachedVersion ?? "unknown";
}
