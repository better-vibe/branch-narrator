/**
 * File filtering utilities to exclude build artifacts and generated files.
 */

// Default exclusion patterns
export const DEFAULT_EXCLUDES = [
  "**/*.d.ts",
  "**/*.map",
  "**/*.min.js",
  "**/*.min.css",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.svelte-kit/**",
  "**/.nuxt/**",
  "**/out/**",
  "**/.cache/**",
  "**/.parcel-cache/**",
  "**/vendor/**",
  "**/*.log",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lock",
  // Archive files
  "**/*.tgz",
  "**/*.tar.gz",
  "**/*.zip",
];

// Patterns for files that should be excluded from analysis
const EXCLUDED_PATTERNS: RegExp[] = [
  // Build output
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^\.svelte-kit\//,
  /^\.nuxt\//,
  /^out\//,

  // Dependencies
  /^node_modules\//,
  /^vendor\//,

  // Source maps
  /\.map$/,

  // Generated types
  /\.d\.ts$/,

  // Minified files
  /\.min\.(js|css)$/,

  // Bundled files
  /^\.cache\//,
  /^\.parcel-cache\//,
];

/**
 * Check if a file path should be excluded from analysis.
 */
export function shouldExcludeFile(path: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(path));
}


