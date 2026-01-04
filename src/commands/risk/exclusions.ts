/**
 * File exclusion patterns for risk-report.
 */

/**
 * Default file patterns to exclude from evidence extraction.
 */
export const DEFAULT_EXCLUSIONS = [
  // Lockfiles
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  
  // Generated files
  "**/*.d.ts",
  
  // Logs
  "**/*.log",
  
  // Build artifacts
  "dist/**",
  "build/**",
  "coverage/**",
  ".turbo/**",
  ".next/**",
  "out/**",
  ".cache/**",
];

/**
 * Check if a file should be skipped based on exclusion patterns.
 */
export function shouldSkipFile(path: string): { skip: boolean; reason?: string } {
  // Check lockfiles
  if (path === "pnpm-lock.yaml" || path === "package-lock.json" || 
      path === "yarn.lock" || path === "bun.lockb") {
    return { skip: true, reason: "lockfile" };
  }

  // Check generated files
  if (path.endsWith(".d.ts")) {
    return { skip: true, reason: "generated file" };
  }

  // Check logs
  if (path.endsWith(".log")) {
    return { skip: true, reason: "log file" };
  }

  // Check build artifacts
  const buildPatterns = ["dist/", "build/", "coverage/", ".turbo/", ".next/", "out/", ".cache/"];
  for (const pattern of buildPatterns) {
    if (path.includes(pattern)) {
      return { skip: true, reason: "build artifact" };
    }
  }

  return { skip: false };
}
