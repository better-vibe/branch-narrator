/**
 * Core pure functions and types for dump-diff command.
 */

import picomatch from "picomatch";

// ============================================================================
// Types
// ============================================================================

export type DiffStatus = "A" | "M" | "D" | "R";

export interface FileEntry {
  path: string;
  oldPath?: string;
  status: DiffStatus;
}

export interface DiffFileEntry extends FileEntry {
  diff: string;
}

export type SkipReason =
  | "excluded-by-default"
  | "excluded-by-glob"
  | "binary"
  | "not-included";

export interface SkippedEntry {
  path: string;
  reason: SkipReason;
}

export interface DumpDiffOutput {
  schemaVersion: "1.0";
  base: string;
  head: string;
  unified: number;
  included: DiffFileEntry[];
  skipped: SkippedEntry[];
  stats: {
    filesConsidered: number;
    filesIncluded: number;
    filesSkipped: number;
    chars: number;
  };
}

export interface FilterResult {
  included: FileEntry[];
  skipped: SkippedEntry[];
}

export interface FilterOptions {
  files: FileEntry[];
  includeGlobs: string[];
  excludeGlobs: string[];
  defaultExcludes: string[];
}

export interface RenderOptions {
  base: string;
  head: string;
  unified: number;
  excludePatterns: string[];
}

// ============================================================================
// Default Exclusions
// ============================================================================

export const DEFAULT_EXCLUDES = [
  // Lockfiles
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/bun.lockb",
  // Type declarations
  "**/*.d.ts",
  // Logs
  "**/*.log",
  "**/*.logs",
  // Build/cache directories
  "**/dist/**",
  "**/build/**",
  "**/.svelte-kit/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/.cache/**",
  // Minified files
  "**/*.min.*",
  // Sourcemaps
  "**/*.map",
];

// ============================================================================
// Path Filtering
// ============================================================================

/**
 * Create a matcher function from glob patterns.
 */
function createMatcher(patterns: string[]): (path: string) => boolean {
  if (patterns.length === 0) {
    return () => false;
  }
  const matchers = patterns.map((p) => picomatch(p, { dot: true }));
  return (path: string) => matchers.some((m) => m(path));
}

/**
 * Filter file paths based on include/exclude globs.
 *
 * Precedence:
 * 1. If include globs are provided, file must match at least one
 * 2. Exclude globs always exclude (even if included)
 * 3. Default excludes apply unless file matches an include glob
 */
export function filterPaths(options: FilterOptions): FilterResult {
  const { files, includeGlobs, excludeGlobs, defaultExcludes } = options;

  const matchInclude = createMatcher(includeGlobs);
  const matchExclude = createMatcher(excludeGlobs);
  const matchDefaultExclude = createMatcher(defaultExcludes);

  const hasIncludeGlobs = includeGlobs.length > 0;

  const included: FileEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const file of files) {
    const path = file.path;

    // Check explicit excludes first (highest priority)
    if (matchExclude(path)) {
      skipped.push({ path, reason: "excluded-by-glob" });
      continue;
    }

    // If include globs are set, file must match one
    if (hasIncludeGlobs) {
      if (!matchInclude(path)) {
        skipped.push({ path, reason: "not-included" });
        continue;
      }
      // If explicitly included, skip default exclude check
      included.push(file);
      continue;
    }

    // No include globs - apply default excludes
    if (matchDefaultExclude(path)) {
      skipped.push({ path, reason: "excluded-by-default" });
      continue;
    }

    included.push(file);
  }

  // Sort included files by path for deterministic output
  included.sort((a, b) => a.path.localeCompare(b.path));

  return { included, skipped };
}

// ============================================================================
// Chunking
// ============================================================================

/**
 * Split diff entries into chunks that fit within a character budget.
 * Splits at file boundaries only.
 */
export function chunkByBudget(
  items: DiffFileEntry[],
  maxChars: number
): DiffFileEntry[][] {
  if (items.length === 0) {
    return [];
  }

  const chunks: DiffFileEntry[][] = [];
  let currentChunk: DiffFileEntry[] = [];
  let currentSize = 0;

  for (const item of items) {
    const itemSize = item.diff.length;

    // If single item exceeds budget, put it in its own chunk
    if (itemSize > maxChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      chunks.push([item]);
      continue;
    }

    // If adding this item would exceed budget, start new chunk
    if (currentSize + itemSize > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(item);
    currentSize += itemSize;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// ============================================================================
// Renderers
// ============================================================================

/**
 * Render entries as plain unified diff text.
 */
export function renderText(entries: DiffFileEntry[]): string {
  return entries.map((e) => e.diff).join("\n");
}

/**
 * Render entries as markdown with fenced code block.
 */
export function renderMarkdown(
  entries: DiffFileEntry[],
  options: RenderOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Git Diff: ${options.base}..${options.head}`);
  lines.push("");
  lines.push(`**Unified context:** ${options.unified} lines`);

  if (options.excludePatterns.length > 0) {
    lines.push(`**Excluded patterns:** ${options.excludePatterns.join(", ")}`);
  }

  lines.push(`**Files included:** ${entries.length}`);
  lines.push("");

  // File list
  lines.push("## Files");
  lines.push("");
  for (const entry of entries) {
    const statusLabel = getStatusLabel(entry.status);
    lines.push(`- \`${entry.path}\` (${statusLabel})`);
  }
  lines.push("");

  // Diff content
  lines.push("## Diff");
  lines.push("");
  lines.push("```diff");
  lines.push(entries.map((e) => e.diff).join("\n"));
  lines.push("```");

  return lines.join("\n");
}

/**
 * Render full output as JSON.
 */
export function renderJson(output: DumpDiffOutput): string {
  return JSON.stringify(output, null, 2);
}

/**
 * Get human-readable label for status.
 */
function getStatusLabel(status: DiffStatus): string {
  switch (status) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
  }
}

// ============================================================================
// Stats
// ============================================================================

/**
 * Calculate total character count of all diffs.
 */
export function calculateTotalChars(entries: DiffFileEntry[]): number {
  return entries.reduce((sum, e) => sum + e.diff.length, 0);
}

