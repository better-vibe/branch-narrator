/**
 * Core pure functions and types for dump-diff command.
 */

import picomatch from "picomatch";

// ============================================================================
// Types
// ============================================================================

export type DiffStatus = "A" | "M" | "D" | "R" | "C" | "T" | "U" | "?" | "unknown";

export type DiffMode = "branch" | "unstaged" | "staged" | "all";

export interface FileEntry {
  path: string;
  oldPath?: string;
  status: DiffStatus;
  untracked?: boolean;
}

export interface DiffFileEntry extends FileEntry {
  diff: string;
}

export type SkipReason =
  | "excluded-by-default"
  | "excluded-by-user"
  | "excluded-by-glob"
  | "binary"
  | "too-large"
  | "unsupported"
  | "not-found"
  | "not-included"
  | "diff-empty"
  | "patch-for-mismatch";

export interface SkippedEntry {
  path: string;
  status?: DiffStatus;
  reason: SkipReason;
  note?: string;
}

// ============================================================================
// JSON Schema v2.0 Types (unified agent-grade output)
// ============================================================================

export interface DiffLine {
  kind: "add" | "del" | "context";
  text: string;
}

export interface DiffHunk {
  header: string; // "@@ -1,0 +1,10 @@"
  oldStart?: number;
  oldLines?: number;
  newStart?: number;
  newLines?: number;
  lines: DiffLine[];
}

export interface DiffFilePatch {
  text: string;
  hunks?: DiffHunk[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: DiffStatus;
  untracked?: boolean;
  binary?: boolean;
  stats?: { added: number; removed: number };
  patch?: DiffFilePatch;
}

export interface SkippedFile {
  path: string;
  status?: DiffStatus;
  reason: SkipReason;
  note?: string;
}

export interface DumpDiffJsonV2 {
  schemaVersion: "2.0";
  generatedAt?: string; // ISO timestamp, omitted when --no-timestamp
  command: { name: "dump-diff"; args: string[] };
  git: {
    mode: DiffMode;
    base: string | null;
    head: string | null;
    isDirty: boolean;
  };
  options: {
    unified: number;
    include: string[];
    exclude: string[];
    includeUntracked: boolean;
    nameOnly: boolean;
    stat: boolean;
    patchFor: string | null;
  };
  files: DiffFile[];
  skippedFiles: SkippedFile[];
  summary: {
    changedFileCount: number;
    includedFileCount: number;
    skippedFileCount: number;
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
  mode: DiffMode;
  base: string | null;
  head: string | null;
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
// Git Argument Builders (Pure Functions)
// ============================================================================

export interface NameStatusArgsOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
}

/**
 * Build git diff --name-status arguments for a given mode.
 */
export function buildNameStatusArgs(opts: NameStatusArgsOptions): string[] {
  const args = ["diff", "--name-status", "--find-renames"];

  switch (opts.mode) {
    case "branch":
      args.push(`${opts.base}..${opts.head}`);
      break;
    case "unstaged":
      // Working tree vs index (no additional args)
      break;
    case "staged":
      args.push("--staged");
      break;
    case "all":
      args.push("HEAD");
      break;
  }

  return args;
}

export interface PerFileDiffArgsOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  unified: number;
  path: string;
  oldPath?: string;
}

/**
 * Build git diff arguments for a single file in a given mode.
 */
export function buildPerFileDiffArgs(opts: PerFileDiffArgsOptions): string[] {
  const args = ["diff", `--unified=${opts.unified}`, "--find-renames"];

  switch (opts.mode) {
    case "branch":
      args.push(`${opts.base}..${opts.head}`);
      break;
    case "unstaged":
      // Working tree vs index (no additional args)
      break;
    case "staged":
      args.push("--staged");
      break;
    case "all":
      args.push("HEAD");
      break;
  }

  args.push("--");

  // For renames, include both old and new paths
  if (opts.oldPath) {
    args.push(opts.oldPath);
  }
  args.push(opts.path);

  return args;
}

/**
 * Build git diff --no-index arguments for untracked files.
 */
export function buildUntrackedDiffArgs(
  path: string,
  unified: number
): string[] {
  return ["diff", "--no-index", `--unified=${unified}`, "--", "/dev/null", path];
}

/**
 * Parse git ls-files -z output into file paths.
 * Output is null-terminated list of file paths.
 */
export function parseLsFilesOutput(output: string): string[] {
  if (!output) {
    return [];
  }

  // -z uses NUL as separator
  return output.split("\0").filter(Boolean);
}

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
 * Get header title based on mode.
 */
function getModeHeader(options: RenderOptions): string {
  switch (options.mode) {
    case "branch":
      return `Git Diff: ${options.base}..${options.head}`;
    case "unstaged":
      return "Git Diff: Unstaged Changes (working tree vs index)";
    case "staged":
      return "Git Diff: Staged Changes (index vs HEAD)";
    case "all":
      return "Git Diff: All Changes (working tree vs HEAD)";
  }
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
  lines.push(`# ${getModeHeader(options)}`);
  lines.push("");
  lines.push(`**Mode:** ${options.mode}`);
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
    const untrackedLabel = entry.untracked ? " [untracked]" : "";
    lines.push(`- \`${entry.path}\` (${statusLabel}${untrackedLabel})`);
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
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    case "?":
      return "untracked";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
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

// ============================================================================
// Diff Parsing (for structured JSON output)
// ============================================================================

/**
 * Parse a hunk header line like "@@ -1,4 +2,6 @@" into structured data.
 */
export function parseHunkHeader(header: string): {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
} | null {
  // Match: @@ -oldStart[,oldLines] +newStart[,newLines] @@
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return null;
  }

  return {
    oldStart: parseInt(match[1]!, 10),
    oldLines: match[2] ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3]!, 10),
    newLines: match[4] ? parseInt(match[4], 10) : 1,
  };
}

/**
 * Parse a unified diff string into structured hunks.
 * This handles the diff content for a single file.
 */
export function parseDiffIntoHunks(diff: string): DiffHunk[] {
  if (!diff.trim()) {
    return [];
  }

  const lines = diff.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    // Check if this is a hunk header
    if (line.startsWith("@@")) {
      // Save previous hunk if exists
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      // Parse header
      const parsed = parseHunkHeader(line);
      currentHunk = {
        header: line,
        oldStart: parsed?.oldStart,
        oldLines: parsed?.oldLines,
        newStart: parsed?.newStart,
        newLines: parsed?.newLines,
        lines: [],
      };
    } else if (currentHunk) {
      // Skip special git diff lines (e.g., "\ No newline at end of file")
      if (line.startsWith("\\")) {
        continue;
      }

      // Add line to current hunk
      let kind: "add" | "del" | "context";
      if (line.startsWith("+")) {
        kind = "add";
      } else if (line.startsWith("-")) {
        kind = "del";
      } else {
        kind = "context";
      }

      currentHunk.lines.push({ kind, text: line });
    }
    // Ignore lines before first hunk (file headers, etc.)
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

// ============================================================================
// JSON Builder (v2.0 unified schema)
// ============================================================================

export interface BuildDumpDiffJsonV2Options {
  mode: DiffMode;
  base: string;
  head: string;
  unified: number;
  include: string[];
  exclude: string[];
  includeUntracked: boolean;
  nameOnly: boolean;
  stat: boolean;
  patchFor: string | null;
  noTimestamp: boolean;
}

/**
 * Build the command args array for JSON output metadata.
 */
function buildCommandArgs(options: BuildDumpDiffJsonV2Options): string[] {
  const args: string[] = [];

  args.push("--mode", options.mode);

  if (options.mode === "branch") {
    args.push("--base", options.base);
    args.push("--head", options.head);
  }

  args.push("--format", "json");

  if (options.unified !== 0) {
    args.push("--unified", String(options.unified));
  }

  for (const glob of options.include) {
    args.push("--include", glob);
  }

  for (const glob of options.exclude) {
    args.push("--exclude", glob);
  }

  if (!options.includeUntracked) {
    args.push("--no-untracked");
  }

  if (options.nameOnly) {
    args.push("--name-only");
  }

  if (options.stat) {
    args.push("--stat");
  }

  if (options.patchFor) {
    args.push("--patch-for", options.patchFor);
  }

  return args;
}

/**
 * Build unified v2.0 JSON output for dump-diff command.
 */
export function buildDumpDiffJsonV2(
  options: BuildDumpDiffJsonV2Options,
  files: DiffFile[],
  skippedFiles: SkippedFile[],
  changedFileCount: number
): DumpDiffJsonV2 {
  const output: DumpDiffJsonV2 = {
    schemaVersion: "2.0",
    generatedAt: options.noTimestamp ? undefined : new Date().toISOString(),
    command: {
      name: "dump-diff",
      args: buildCommandArgs(options),
    },
    git: {
      mode: options.mode,
      base: options.mode === "branch" ? options.base : null,
      head: options.mode === "branch" ? options.head : null,
      isDirty: options.mode !== "branch",
    },
    options: {
      unified: options.unified,
      include: options.include,
      exclude: options.exclude,
      includeUntracked: options.includeUntracked,
      nameOnly: options.nameOnly,
      stat: options.stat,
      patchFor: options.patchFor,
    },
    files,
    skippedFiles,
    summary: {
      changedFileCount,
      includedFileCount: files.length,
      skippedFileCount: skippedFiles.length,
    },
  };

  // Remove undefined generatedAt for cleaner output
  if (output.generatedAt === undefined) {
    delete output.generatedAt;
  }

  return output;
}

/**
 * Render DumpDiffJsonV2 as JSON string.
 */
export function renderDumpDiffJson(output: DumpDiffJsonV2, pretty: boolean = false): string {
  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}

// ============================================================================
// Diff Splitting Utility
// ============================================================================

export interface SplitDiffEntry {
  path: string;
  oldPath?: string;
  diffText: string;
}

/**
 * Split a full unified diff into per-file chunks.
 * 
 * Parses unified diff output from git and splits it into individual file patches.
 * Handles rename headers and correctly identifies file boundaries using "diff --git" markers.
 * 
 * @param fullDiff - The complete unified diff output from git diff
 * @returns Array of per-file diff entries with path and diff text
 */
export function splitFullDiff(fullDiff: string): SplitDiffEntry[] {
  if (!fullDiff.trim()) {
    return [];
  }

  const entries: SplitDiffEntry[] = [];
  const lines = fullDiff.split("\n");
  
  let currentPath: string | null = null;
  let currentOldPath: string | undefined;
  let currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentPath && currentLines.length > 0) {
      entries.push({
        path: currentPath,
        oldPath: currentOldPath,
        diffText: currentLines.join("\n"),
      });
    }
    currentPath = null;
    currentOldPath = undefined;
    currentLines = [];
  };

  for (const line of lines) {
    // Check for new file boundary: "diff --git a/... b/..."
    if (line.startsWith("diff --git ")) {
      // Save previous file if exists
      flushCurrent();

      // Parse file paths from "diff --git a/old b/new"
      const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      if (match) {
        const oldPath = match[1]!;
        const newPath = match[2]!;
        
        // If paths differ, it might be a rename
        if (oldPath !== newPath) {
          currentOldPath = oldPath;
          currentPath = newPath;
        } else {
          currentPath = newPath;
          currentOldPath = undefined;
        }
      }
      currentLines.push(line);
    } else if (currentPath) {
      // Add line to current file's diff
      currentLines.push(line);
    }
    // Ignore lines before first "diff --git" marker
  }

  // Don't forget the last file
  flushCurrent();

  return entries;
}

// ============================================================================
// Concurrency Limiting Utility
// ============================================================================

/**
 * Simple concurrency limiter for parallel async operations.
 * Limits the number of concurrent promises running at once.
 * 
 * @param tasks - Array of task functions that return promises
 * @param limit - Maximum number of concurrent tasks (default: 4)
 * @returns Promise that resolves to array of results in original order
 */
export async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number = 4
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;
  let activeCount = 0;

  return new Promise((resolve, reject) => {
    const startNext = () => {
      // Check if all tasks are done
      if (currentIndex >= tasks.length && activeCount === 0) {
        resolve(results);
        return;
      }

      // Start new tasks up to the limit
      while (activeCount < limit && currentIndex < tasks.length) {
        const index = currentIndex++;
        const task = tasks[index]!;
        
        activeCount++;
        task()
          .then((result) => {
            results[index] = result;
            activeCount--;
            startNext();
          })
          .catch(reject);
      }
    };

    startNext();
  });
}

