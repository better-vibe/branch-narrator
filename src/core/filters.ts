/**
 * File filtering utilities to exclude build artifacts and generated files.
 */

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

/**
 * Filter out excluded files from a list of paths.
 */
export function filterExcludedFiles(paths: string[]): string[] {
  return paths.filter((path) => !shouldExcludeFile(path));
}

