/**
 * dump-diff command implementation.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BranchNarratorError } from "../../core/errors.js";
import { warn, info } from "../../core/logger.js";
import { getRepoRoot } from "../../git/collector.js";
import {
  buildDumpDiffJsonV2,
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  limitConcurrency,
  parseDiffIntoHunks,
  renderDumpDiffJson,
  renderMarkdown,
  renderText,
  splitFullDiff,
  type DiffFile,
  type DiffFileEntry,
  type DiffMode,
  type FileEntry,
  type SkippedEntry,
  type SkippedFile,
} from "./core.js";
import {
  getFileDiff,
  getFullDiff,
  getNameStatusList,
  getNumStats,
  getUntrackedFileDiff,
  getUntrackedFiles,
  isUntrackedBinaryFile,
} from "./git.js";

// ============================================================================
// Types
// ============================================================================

export interface DumpDiffOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  out?: string;
  format: "text" | "md" | "json";
  unified: number;
  include: string[];
  exclude: string[];
  maxChars?: number;
  chunkDir: string;
  name: string;
  dryRun: boolean;
  includeUntracked: boolean;
  cwd?: string;
  nameOnly?: boolean;
  stat?: boolean;
  patchFor?: string;
  pretty?: boolean;
  noTimestamp?: boolean;
}

export interface DryRunResult {
  included: FileEntry[];
  skipped: SkippedEntry[];
  estimatedChars: number;
  wouldChunk: boolean;
  chunkCount?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of concurrent operations for untracked file processing.
 * This prevents spawning hundreds of concurrent git processes when dealing
 * with many untracked files (binary checks and diff generation).
 */
const UNTRACKED_CONCURRENCY_LIMIT = 8;

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Execute the dump-diff command.
 */
export async function executeDumpDiff(options: DumpDiffOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const gitCwd = await getRepoRoot(cwd);

  // Warn if base/head provided with non-branch mode
  if (options.mode !== "branch") {
    const baseProvided = options.base !== "main";
    const headProvided = options.head !== "HEAD";
    if (baseProvided || headProvided) {
      warn(
        `Warning: --base and --head are ignored when --mode is "${options.mode}"`
      );
    }
  }

  // Route to specialized handlers for new modes
  if (options.patchFor) {
    await handlePatchFor(options, gitCwd);
    return;
  }

  if (options.nameOnly) {
    await handleNameOnly(options, gitCwd);
    return;
  }

  if (options.stat) {
    await handleStat(options, gitCwd);
    return;
  }

  // Default: full diff mode (original behavior)
  await handleFullDiff(options, gitCwd);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Handle full diff mode (default behavior).
 */
async function handleFullDiff(options: DumpDiffOptions, cwd: string): Promise<void> {
  // Get file list from git
  const allFiles = await getNameStatusList({
    mode: options.mode,
    base: options.base,
    head: options.head,
    cwd,
  });

  // Get untracked files if requested
  let untrackedFiles: FileEntry[] = [];
  if (options.includeUntracked && options.mode !== "branch") {
    const untrackedPaths = await getUntrackedFiles(cwd);
    untrackedFiles = untrackedPaths.map((path) => ({
      path,
      status: "A" as const,
      untracked: true,
    }));
  }

  const combinedFiles = [...allFiles, ...untrackedFiles];

  if (combinedFiles.length === 0) {
    // In JSON mode, output valid JSON instead of plain text
    if (options.format === "json") {
      const output = buildDumpDiffJsonV2(
        {
          mode: options.mode,
          base: options.base,
          head: options.head,
          unified: options.unified,
          include: options.include,
          exclude: options.exclude,
          includeUntracked: options.includeUntracked,
          nameOnly: false,
          stat: false,
          patchFor: null,
          noTimestamp: options.noTimestamp ?? false,
        },
        [],
        [],
        0
      );
      const json = renderDumpDiffJson(output, options.pretty);
      if (options.out) {
        await writeOutput(options.out, json);
        info(`Wrote JSON output to ${options.out}`);
      } else {
        console.log(json);
      }
      return;
    }

    // For non-JSON formats, output plain text
    console.log("No changes found.");
    return;
  }

  // Filter files
  const { included, skipped } = filterPaths({
    files: combinedFiles,
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    defaultExcludes: DEFAULT_EXCLUDES,
  });

  // Detect binary files and move them to skipped
  const textFiles: FileEntry[] = [];
  const binarySkipped: SkippedEntry[] = [];

  // Batch binary detection for tracked files using numstat
  const trackedFiles = included.filter((f) => !f.untracked);
  const untrackedFilesFiltered = included.filter((f) => f.untracked);

  let statsMap: Map<string, import("./git.js").FileStats> = new Map();
  if (trackedFiles.length > 0) {
    statsMap = await getNumStats({
      mode: options.mode,
      base: options.base,
      head: options.head,
      cwd,
    });
  }

  // Check tracked files against numstat results
  for (const file of trackedFiles) {
    const stats = statsMap.get(file.path);
    if (stats?.binary) {
      binarySkipped.push({ path: file.path, reason: "binary" });
    } else {
      textFiles.push(file);
    }
  }

  // Check untracked files individually with concurrency limit
  if (untrackedFilesFiltered.length > 0) {
    const untrackedBinaryChecks = untrackedFilesFiltered.map((file) => async () => {
      const isBinary = await isUntrackedBinaryFile(file.path, cwd);
      return { file, isBinary };
    });

    const untrackedResults = await limitConcurrency(untrackedBinaryChecks, UNTRACKED_CONCURRENCY_LIMIT);
    for (const { file, isBinary } of untrackedResults) {
      if (isBinary) {
        binarySkipped.push({ path: file.path, reason: "binary" });
      } else {
        textFiles.push(file);
      }
    }
  }

  const allSkipped = [...skipped, ...binarySkipped];

  // Dry run - just show what would happen
  if (options.dryRun) {
    await handleDryRun(options, textFiles, allSkipped, cwd);
    return;
  }

  // Fetch diffs for included files
  const rawEntries = await fetchDiffs(options, textFiles, cwd);

  // Move empty diffs to skipped (these are likely directories or other edge cases)
  const entries: DiffFileEntry[] = [];
  const emptyDiffSkipped: SkippedEntry[] = [];

  for (const entry of rawEntries) {
    if (entry.diff.trim() === "") {
      emptyDiffSkipped.push({ path: entry.path, reason: "diff-empty" });
    } else {
      entries.push(entry);
    }
  }

  const finalSkipped = [...allSkipped, ...emptyDiffSkipped];

  // Handle output based on format
  if (options.format === "json") {
    const totalChars = calculateTotalChars(entries);

    // Check if chunking would be needed
    if (options.maxChars !== undefined && totalChars > options.maxChars) {
      throw new BranchNarratorError(
        `JSON output (${totalChars.toLocaleString()} chars) exceeds --max-chars ` +
          `(${options.maxChars.toLocaleString()}). JSON format does not support chunking. ` +
          `Use --format text or --format md for chunked output, or increase --max-chars.`,
        1
      );
    }

    // Convert DiffFileEntry[] to DiffFile[] with patch.text
    const files: DiffFile[] = entries.map((entry) => ({
      path: entry.path,
      oldPath: entry.oldPath,
      status: entry.status,
      untracked: entry.untracked,
      patch: { text: entry.diff },
    }));

    // Convert SkippedEntry[] to SkippedFile[]
    const skippedFiles: SkippedFile[] = finalSkipped.map((s) => ({
      path: s.path,
      status: s.status,
      reason: s.reason,
      note: s.note,
    }));

    const output = buildDumpDiffJsonV2(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        includeUntracked: options.includeUntracked,
        nameOnly: false,
        stat: false,
        patchFor: null,
        noTimestamp: options.noTimestamp ?? false,
      },
      files,
      skippedFiles,
      combinedFiles.length
    );

    const json = renderDumpDiffJson(output, options.pretty);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
  } else {
    await handleTextOrMdOutput(options, entries, finalSkipped, combinedFiles.length, cwd);
  }
}

/**
 * Handle --name-only mode (just list files).
 */
async function handleNameOnly(options: DumpDiffOptions, cwd: string): Promise<void> {
  // Get file list from git
  const allFiles = await getNameStatusList({
    mode: options.mode,
    base: options.base,
    head: options.head,
    cwd,
  });

  // Get untracked files if requested
  let untrackedFiles: FileEntry[] = [];
  if (options.includeUntracked && options.mode !== "branch") {
    const untrackedPaths = await getUntrackedFiles(cwd);
    untrackedFiles = untrackedPaths.map((path) => ({
      path,
      status: "A" as const,
      untracked: true,
    }));
  }

  const combinedFiles = [...allFiles, ...untrackedFiles];

  // Filter files
  const { included, skipped } = filterPaths({
    files: combinedFiles,
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    defaultExcludes: DEFAULT_EXCLUDES,
  });

  // Detect binary files and add to skipped
  // Batch binary detection for tracked files using numstat
  const trackedFiles = included.filter((f) => !f.untracked);
  const untrackedFilesFiltered = included.filter((f) => f.untracked);

  let statsMap: Map<string, import("./git.js").FileStats> = new Map();
  if (trackedFiles.length > 0) {
    statsMap = await getNumStats({
      mode: options.mode,
      base: options.base,
      head: options.head,
      cwd,
    });
  }

  // Check tracked files against numstat results
  for (const file of trackedFiles) {
    const stats = statsMap.get(file.path);
    if (stats?.binary) {
      skipped.push({
        path: file.path,
        status: file.status,
        reason: "binary",
      });
    }
  }

  // Check untracked files individually with concurrency limit
  if (untrackedFilesFiltered.length > 0) {
    const untrackedBinaryChecks = untrackedFilesFiltered.map((file) => async () => {
      const isBinary = await isUntrackedBinaryFile(file.path, cwd);
      return { file, isBinary };
    });

    const untrackedResults = await limitConcurrency(untrackedBinaryChecks, UNTRACKED_CONCURRENCY_LIMIT);
    for (const { file, isBinary } of untrackedResults) {
      if (isBinary) {
        skipped.push({
          path: file.path,
          status: file.status,
          reason: "binary",
        });
      }
    }
  }

  // Filter out binary files from included list
  const nonBinaryFiles = included.filter((f) => {
    return !skipped.some((s) => s.path === f.path && s.reason === "binary");
  });

  // Sort for deterministic output
  const sortedIncluded = nonBinaryFiles.sort((a, b) => a.path.localeCompare(b.path));
  const sortedSkipped = skipped.sort((a, b) => a.path.localeCompare(b.path));

  // Output based on format
  if (options.format === "json") {
    // Convert FileEntry[] to DiffFile[] (no patch for name-only)
    const files: DiffFile[] = sortedIncluded.map((f) => ({
      path: f.path,
      oldPath: f.oldPath,
      status: f.status,
      untracked: f.untracked,
    }));

    // Convert SkippedEntry[] to SkippedFile[]
    const skippedFiles: SkippedFile[] = sortedSkipped.map((s) => ({
      path: s.path,
      status: s.status,
      reason: s.reason,
      note: s.note,
    }));

    const output = buildDumpDiffJsonV2(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        includeUntracked: options.includeUntracked,
        nameOnly: true,
        stat: false,
        patchFor: null,
        noTimestamp: options.noTimestamp ?? false,
      },
      files,
      skippedFiles,
      combinedFiles.length
    );

    const json = renderDumpDiffJson(output, options.pretty);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
  } else if (options.format === "md") {
    const lines: string[] = [];
    lines.push("# Changed Files\n");
    for (const file of sortedIncluded) {
      lines.push(`- \`${file.path}\``);
    }
    const output = lines.join("\n");
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote markdown output to ${options.out}`);
    } else {
      console.log(output);
    }
  } else {
    // text format
    const lines = sortedIncluded.map((f) => f.path);
    const output = lines.join("\n");
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote text output to ${options.out}`);
    } else {
      console.log(output);
    }
  }
}

/**
 * Handle --stat mode (file statistics).
 */
async function handleStat(options: DumpDiffOptions, cwd: string): Promise<void> {
  // Get file list from git
  const allFiles = await getNameStatusList({
    mode: options.mode,
    base: options.base,
    head: options.head,
    cwd,
  });

  // Get untracked files if requested
  let untrackedFiles: FileEntry[] = [];
  if (options.includeUntracked && options.mode !== "branch") {
    const untrackedPaths = await getUntrackedFiles(cwd);
    untrackedFiles = untrackedPaths.map((path) => ({
      path,
      status: "A" as const,
      untracked: true,
    }));
  }

  const combinedFiles = [...allFiles, ...untrackedFiles];

  // Get stats from git
  const statsMap = await getNumStats({
    mode: options.mode,
    base: options.base,
    head: options.head,
    cwd,
  });

  // Filter files
  const { included, skipped } = filterPaths({
    files: combinedFiles,
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    defaultExcludes: DEFAULT_EXCLUDES,
  });

  // Add binary files to skipped
  for (const file of included) {
    const stats = statsMap.get(file.path);
    if (stats?.binary) {
      skipped.push({
        path: file.path,
        status: file.status,
        reason: "binary",
      });
    }
  }

  // Build file list with stats (excluding binaries)
  const filesWithStats = included
    .filter((f) => {
      const stats = statsMap.get(f.path);
      return !stats?.binary;
    })
    .map((f) => {
      const stats = statsMap.get(f.path);
      return {
        path: f.path,
        oldPath: f.oldPath,
        status: f.status,
        stats: stats
          ? { added: stats.added, removed: stats.removed }
          : { added: 0, removed: 0 },
      };
    });

  // Sort for deterministic output
  const sortedFiles = filesWithStats.sort((a, b) => a.path.localeCompare(b.path));
  const sortedSkipped = skipped.sort((a, b) => a.path.localeCompare(b.path));

  // Output based on format
  if (options.format === "json") {
    // Convert to DiffFile[] with stats
    const files: DiffFile[] = sortedFiles.map((f) => ({
      path: f.path,
      oldPath: f.oldPath,
      status: f.status,
      stats: f.stats,
    }));

    // Convert SkippedEntry[] to SkippedFile[]
    const skippedFilesOutput: SkippedFile[] = sortedSkipped.map((s) => ({
      path: s.path,
      status: s.status,
      reason: s.reason,
      note: s.note,
    }));

    const output = buildDumpDiffJsonV2(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        includeUntracked: options.includeUntracked,
        nameOnly: false,
        stat: true,
        patchFor: null,
        noTimestamp: options.noTimestamp ?? false,
      },
      files,
      skippedFilesOutput,
      combinedFiles.length
    );

    const json = renderDumpDiffJson(output, options.pretty);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
  } else if (options.format === "md") {
    const lines: string[] = [];
    lines.push("# File Statistics\n");
    lines.push("| File | Added | Removed |");
    lines.push("| ---- | -----:| -------:|");
    for (const file of sortedFiles) {
      lines.push(
        `| \`${file.path}\` | ${file.stats.added} | ${file.stats.removed} |`
      );
    }
    const output = lines.join("\n");
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote markdown output to ${options.out}`);
    } else {
      console.log(output);
    }
  } else {
    // text format (numstat-like: added<TAB>removed<TAB>path)
    const lines = sortedFiles.map(
      (f) => `${f.stats.added}\t${f.stats.removed}\t${f.path}`
    );
    const output = lines.join("\n");
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote text output to ${options.out}`);
    } else {
      console.log(output);
    }
  }
}

export interface PatchTargetResolution {
  kind: "file" | "directory";
  targets: FileEntry[];
}

/**
 * Normalize a patch selector path for matching.
 * Uses repo-relative slash-separated paths.
 */
export function normalizePatchSelectorPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (normalized === "." || normalized === "") {
    return ".";
  }
  return normalized.replace(/\/+$/, "");
}

/**
 * Check whether a file path is within a requested directory selector.
 */
export function pathMatchesPatchDirectory(
  candidatePath: string | undefined,
  directorySelector: string
): boolean {
  if (!candidatePath) {
    return false;
  }
  if (directorySelector === ".") {
    return true;
  }
  return candidatePath === directorySelector || candidatePath.startsWith(`${directorySelector}/`);
}

/**
 * Resolve --patch-for selector to one file or a directory set.
 * Exact file match takes precedence over directory expansion.
 */
export function resolvePatchTargets(
  files: FileEntry[],
  requestedPath: string
): PatchTargetResolution | null {
  const normalizedRequested = normalizePatchSelectorPath(requestedPath);
  const explicitDirectory = requestedPath.endsWith("/");

  if (!explicitDirectory) {
    const exactMatch = files.find((file) => {
      const normalizedPath = normalizePatchSelectorPath(file.path);
      const normalizedOldPath = file.oldPath
        ? normalizePatchSelectorPath(file.oldPath)
        : undefined;
      return (
        normalizedPath === normalizedRequested ||
        normalizedOldPath === normalizedRequested
      );
    });

    if (exactMatch) {
      return { kind: "file", targets: [exactMatch] };
    }
  }

  const directoryTargets = files.filter(
    (file) =>
      pathMatchesPatchDirectory(file.path, normalizedRequested) ||
      pathMatchesPatchDirectory(file.oldPath, normalizedRequested)
  );

  if (directoryTargets.length === 0) {
    return null;
  }

  return { kind: "directory", targets: directoryTargets };
}

/**
 * Handle --patch-for mode (file or directory diff).
 */
async function handlePatchFor(options: DumpDiffOptions, cwd: string): Promise<void> {
  if (!options.patchFor) {
    throw new BranchNarratorError("--patch-for requires a file or folder path", 1);
  }

  const requestedPath = options.patchFor;

  // Get file list from git
  const allFiles = await getNameStatusList({
    mode: options.mode,
    base: options.base,
    head: options.head,
    cwd,
  });

  // Get untracked files if requested
  let untrackedFiles: FileEntry[] = [];
  if (options.includeUntracked && options.mode !== "branch") {
    const untrackedPaths = await getUntrackedFiles(cwd);
    untrackedFiles = untrackedPaths.map((path) => ({
      path,
      status: "A" as const,
      untracked: true,
    }));
  }

  const combinedFiles = [...allFiles, ...untrackedFiles];
  const targetResolution = resolvePatchTargets(combinedFiles, requestedPath);

  if (!targetResolution) {
    throw new BranchNarratorError(
      `File or folder not found in changes: ${requestedPath}. ` +
        `Run 'branch-narrator dump-diff --name-only' to see changed files.`,
      1
    );
  }

  const targetFiles = [...targetResolution.targets].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  // Check if target files are excluded
  const { included, skipped } = filterPaths({
    files: targetFiles,
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    defaultExcludes: DEFAULT_EXCLUDES,
  });

  if (included.length === 0) {
    const skipReason = skipped[0]?.reason || "excluded";
    const includeHint = targetResolution.kind === "directory"
      ? `${normalizePatchSelectorPath(requestedPath)}/**`
      : requestedPath;
    throw new BranchNarratorError(
      `Requested file or folder is excluded: ${requestedPath} (reason: ${skipReason}). ` +
        `Use --include "${includeHint}" to include it.`,
      1
    );
  }

  const trackedIncluded = included.filter((file) => !file.untracked);
  const untrackedIncluded = included.filter((file) => file.untracked);

  // Batch stats for tracked files (used for both stats and binary detection).
  let statsMap: Map<string, import("./git.js").FileStats> = new Map();
  if (trackedIncluded.length > 0) {
    statsMap = await getNumStats({
      mode: options.mode,
      base: options.base,
      head: options.head,
      cwd,
    });
  }

  const binarySkipped: SkippedEntry[] = [];
  const textFiles: FileEntry[] = [];

  for (const file of trackedIncluded) {
    const fileStats = statsMap.get(file.path);
    if (fileStats?.binary) {
      binarySkipped.push({
        path: file.path,
        status: file.status,
        reason: "binary",
      });
    } else {
      textFiles.push(file);
    }
  }

  if (untrackedIncluded.length > 0) {
    const untrackedCheckTasks = untrackedIncluded.map((file) => async () => ({
        file,
        isBinary: await isUntrackedBinaryFile(file.path, cwd),
      }));

    const untrackedChecks = await limitConcurrency(
      untrackedCheckTasks,
      UNTRACKED_CONCURRENCY_LIMIT
    );

    for (const result of untrackedChecks) {
      if (result.isBinary) {
        binarySkipped.push({
          path: result.file.path,
          status: result.file.status,
          reason: "binary",
        });
      } else {
        textFiles.push(result.file);
      }
    }
  }

  if (textFiles.length === 0) {
    if (options.format !== "json" && binarySkipped.length > 0) {
      // Preserve single-file binary behavior for text/markdown mode.
      if (targetResolution.kind === "file") {
        throw new BranchNarratorError(`File is binary: ${requestedPath}`, 1);
      }
      throw new BranchNarratorError(
        `Folder contains only binary changes: ${requestedPath}. Use --format json to inspect skipped files.`,
        1
      );
    }

    const skippedFiles: SkippedFile[] = [...skipped, ...binarySkipped].map((entry) => ({
      path: entry.path,
      status: entry.status,
      reason: entry.reason,
      note: entry.note,
    }));

    const output = buildDumpDiffJsonV2(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        includeUntracked: options.includeUntracked,
        nameOnly: false,
        stat: false,
        patchFor: requestedPath,
        noTimestamp: options.noTimestamp ?? false,
      },
      [],
      skippedFiles,
      targetFiles.length
    );

    const json = renderDumpDiffJson(output, options.pretty);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
    return;
  }

  const sortedTextFiles = [...textFiles].sort((a, b) => a.path.localeCompare(b.path));

  const diffTasks = sortedTextFiles.map((file) => async (): Promise<DiffFileEntry> => {
      const diff = file.untracked
        ? await getUntrackedFileDiff(file.path, options.unified, cwd)
        : await getFileDiff({
            mode: options.mode,
            base: options.base,
            head: options.head,
            path: file.path,
            oldPath: file.oldPath,
            unified: options.unified,
            cwd,
          });

      return {
        path: file.path,
        oldPath: file.oldPath,
        status: file.status,
        untracked: file.untracked,
        diff,
      };
    });

  const diffEntries = await limitConcurrency(
    diffTasks,
    UNTRACKED_CONCURRENCY_LIMIT
  );

  const nonEmptyDiffEntries: DiffFileEntry[] = [];
  const diffEmptySkipped: SkippedFile[] = [];
  for (const entry of diffEntries) {
    if (!entry.diff.trim()) {
      diffEmptySkipped.push({
        path: entry.path,
        status: entry.status,
        reason: "diff-empty",
      });
      continue;
    }
    nonEmptyDiffEntries.push(entry);
  }

  if (nonEmptyDiffEntries.length === 0) {
    if (options.format !== "json") {
      throw new BranchNarratorError(
        `No text diff found for requested file or folder: ${requestedPath}.`,
        1
      );
    }

    const skippedFiles: SkippedFile[] = [
      ...skipped,
      ...binarySkipped,
      ...diffEmptySkipped,
    ].map((entry) => ({
      path: entry.path,
      status: entry.status,
      reason: entry.reason,
      note: entry.note,
    }));

    const output = buildDumpDiffJsonV2(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        includeUntracked: options.includeUntracked,
        nameOnly: false,
        stat: false,
        patchFor: requestedPath,
        noTimestamp: options.noTimestamp ?? false,
      },
      [],
      skippedFiles,
      targetFiles.length
    );

    const json = renderDumpDiffJson(output, options.pretty);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
    return;
  }

  // Output based on format
  if (options.format === "json") {
    const files: DiffFile[] = nonEmptyDiffEntries.map((entry) => {
      const fileStats = statsMap.get(entry.path);
      const stats = fileStats && !fileStats.binary
        ? { added: fileStats.added, removed: fileStats.removed }
        : undefined;

      return {
        path: entry.path,
        oldPath: entry.oldPath,
        status: entry.status,
        untracked: entry.untracked,
        stats,
        patch: {
          text: entry.diff,
          hunks: parseDiffIntoHunks(entry.diff),
        },
      };
    });

    const skippedFiles: SkippedFile[] = [
      ...skipped,
      ...binarySkipped,
      ...diffEmptySkipped,
    ].map((entry) => ({
      path: entry.path,
      status: entry.status,
      reason: entry.reason,
      note: entry.note,
    }));

    const output = buildDumpDiffJsonV2(
      {
        mode: options.mode,
        base: options.base,
        head: options.head,
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        includeUntracked: options.includeUntracked,
        nameOnly: false,
        stat: false,
        patchFor: requestedPath,
        noTimestamp: options.noTimestamp ?? false,
      },
      files,
      skippedFiles,
      targetFiles.length
    );

    const json = renderDumpDiffJson(output, options.pretty);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
  } else if (options.format === "md") {
    const lines: string[] = [];
    lines.push(`# Diff for \`${requestedPath}\``);
    lines.push("");
    for (const entry of nonEmptyDiffEntries) {
      lines.push(`## \`${entry.path}\``);
      lines.push("");
      lines.push("```diff");
      lines.push(entry.diff);
      lines.push("```");
      lines.push("");
    }
    const output = lines.join("\n").trimEnd();
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote markdown output to ${options.out}`);
    } else {
      console.log(output);
    }
  } else {
    // text format
    const output = renderText(nonEmptyDiffEntries);
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote text output to ${options.out}`);
    } else {
      console.log(output);
    }
  }
}

// ============================================================================
// Diff Fetching Helpers
// ============================================================================

/**
 * Fetch diffs for all included files.
 * Uses a single git diff call for tracked files and limits concurrency for untracked files.
 */
async function fetchDiffs(
  options: DumpDiffOptions,
  files: FileEntry[],
  cwd: string
): Promise<DiffFileEntry[]> {
  const entries: DiffFileEntry[] = [];

  // Separate tracked and untracked files
  const trackedFiles = files.filter((f) => !f.untracked);
  const untrackedFiles = files.filter((f) => f.untracked);

  // Fetch all tracked files in one git diff call
  if (trackedFiles.length > 0) {
    const trackedPaths = trackedFiles.map((f) => f.path);
    
    try {
      const fullDiff = await getFullDiff({
        mode: options.mode,
        base: options.base,
        head: options.head,
        paths: trackedPaths,
        unified: options.unified,
        cwd,
      });

      // Split the full diff into per-file entries
      const splitEntries = splitFullDiff(fullDiff);

      // Create a map for quick lookup
      const splitMap = new Map<string, string>();
      for (const entry of splitEntries) {
        splitMap.set(entry.path, entry.diffText);
        // Also map by oldPath for renames
        if (entry.oldPath) {
          splitMap.set(entry.oldPath, entry.diffText);
        }
      }

      // Match split diffs to original files
      for (const file of trackedFiles) {
        let diff = splitMap.get(file.path);
        
        // Fallback: try per-file diff if not found in split result
        if (!diff || diff.trim() === "") {
          diff = await getFileDiff({
            mode: options.mode,
            base: options.base,
            head: options.head,
            path: file.path,
            oldPath: file.oldPath,
            unified: options.unified,
            cwd,
          });
        }

        entries.push({
          path: file.path,
          oldPath: file.oldPath,
          status: file.status,
          diff: diff || "",
          untracked: false,
        });
      }
    } catch (error) {
      // Fallback to per-file diffs if full diff fails
      warn(`Batch diff failed, falling back to per-file diffs: ${error instanceof Error ? error.message : String(error)}`);
      
      for (const file of trackedFiles) {
        const diff = await getFileDiff({
          mode: options.mode,
          base: options.base,
          head: options.head,
          path: file.path,
          oldPath: file.oldPath,
          unified: options.unified,
          cwd,
        });

        entries.push({
          path: file.path,
          oldPath: file.oldPath,
          status: file.status,
          diff,
          untracked: false,
        });
      }
    }
  }

  // Fetch untracked files with concurrency limit
  if (untrackedFiles.length > 0) {
    const untrackedTasks = untrackedFiles.map((file) => async () => {
      const diff = await getUntrackedFileDiff(file.path, options.unified, cwd);
      return {
        path: file.path,
        oldPath: file.oldPath,
        status: file.status,
        diff,
        untracked: true,
      };
    });

    const untrackedEntries = await limitConcurrency(untrackedTasks, UNTRACKED_CONCURRENCY_LIMIT);
    entries.push(...untrackedEntries);
  }

  return entries;
}

/**
 * Handle dry run output.
 */
async function handleDryRun(
  options: DumpDiffOptions,
  included: FileEntry[],
  skipped: SkippedEntry[],
  cwd: string
): Promise<void> {
  // Estimate sizes by fetching diffs
  let estimatedChars = 0;

  if (included.length > 0) {
    // For tracked files, get the full diff which is faster than per-file
    const trackedPaths = included.filter((f) => !f.untracked).map((f) => f.path);
    if (trackedPaths.length > 0) {
      const fullDiff = await getFullDiff({
        mode: options.mode,
        base: options.base,
        head: options.head,
        paths: trackedPaths,
        unified: options.unified,
        cwd,
      });
      estimatedChars += fullDiff.length;
    }

    // For untracked files, estimate based on file count (rough estimate)
    const untrackedCount = included.filter((f) => f.untracked).length;
    if (untrackedCount > 0) {
      // Rough estimate: ~500 chars per untracked file on average
      estimatedChars += untrackedCount * 500;
    }
  }

  const wouldChunk =
    options.maxChars !== undefined && estimatedChars > options.maxChars;

  console.log("=== Dry Run ===\n");
  console.log(`Mode: ${options.mode}`);
  if (options.mode === "branch") {
    console.log(`Base: ${options.base}`);
    console.log(`Head: ${options.head}`);
  }
  console.log(`Format: ${options.format}`);
  console.log(`Unified context: ${options.unified} lines`);
  console.log(`Include untracked: ${options.includeUntracked}`);
  console.log("");

  console.log(`Files included (${included.length}):`);
  for (const file of included) {
    const status = getStatusEmoji(file.status);
    const untrackedLabel = file.untracked ? " [untracked]" : "";
    console.log(`  ${status} ${file.path}${untrackedLabel}`);
  }
  console.log("");

  console.log(`Files skipped (${skipped.length}):`);
  for (const file of skipped) {
    console.log(`  - ${file.path} (${file.reason})`);
  }
  console.log("");

  console.log(`Estimated output size: ${estimatedChars.toLocaleString()} chars`);

  if (options.maxChars !== undefined) {
    console.log(`Max chars: ${options.maxChars.toLocaleString()}`);
    console.log(`Would chunk: ${wouldChunk ? "yes" : "no"}`);

    if (wouldChunk) {
      const estimatedChunks = Math.ceil(estimatedChars / options.maxChars);
      console.log(`Estimated chunks: ~${estimatedChunks}`);
    }
  }

  if (options.out) {
    console.log(`\nOutput would be written to: ${options.out}`);
  } else if (wouldChunk) {
    console.log(`\nChunks would be written to: ${options.chunkDir}/`);
  }
}

/**
 * Handle text or markdown format output.
 */
async function handleTextOrMdOutput(
  options: DumpDiffOptions,
  entries: DiffFileEntry[],
  _skipped: SkippedEntry[],
  _totalFiles: number,
  _cwd: string
): Promise<void> {
  const renderOpts = {
    mode: options.mode,
    base: options.mode === "branch" ? options.base : null,
    head: options.mode === "branch" ? options.head : null,
    unified: options.unified,
    excludePatterns: [...DEFAULT_EXCLUDES, ...options.exclude],
  };

  const totalChars = calculateTotalChars(entries);
  const needsChunking =
    options.maxChars !== undefined && totalChars > options.maxChars;

  if (needsChunking) {
    // Chunk the output
    const chunks = chunkByBudget(entries, options.maxChars!);
    const ext = options.format === "md" ? "md" : "txt";

    // Create chunk directory
    await mkdir(options.chunkDir, { recursive: true });

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const chunkNum = String(i + 1).padStart(3, "0");
      const filename = `${options.name}-${chunkNum}.${ext}`;
      const filepath = join(options.chunkDir, filename);

      let content: string;
      if (options.format === "md") {
        // For chunked markdown, update the header to indicate chunk number
        const chunkRenderOpts = {
          ...renderOpts,
          // Append chunk info if branch mode
          base:
            options.mode === "branch"
              ? `${options.base} (chunk ${i + 1}/${chunks.length})`
              : null,
        };
        content = renderMarkdown(chunk, chunkRenderOpts);
      } else {
        content = renderText(chunk);
      }

      await writeFile(filepath, content, "utf-8");
      info(`Wrote chunk ${i + 1}/${chunks.length} to ${filepath}`);
    }

    info(
      `\nTotal: ${chunks.length} chunks, ${entries.length} files, ${totalChars.toLocaleString()} chars`
    );
  } else {
    // Single output
    let content: string;
    if (options.format === "md") {
      content = renderMarkdown(entries, renderOpts);
    } else {
      content = renderText(entries);
    }

    if (options.out) {
      await writeOutput(options.out, content);
      info(`Wrote ${options.format} output to ${options.out}`);
    } else {
      console.log(content);
    }
  }
}

/**
 * Write output to file, creating directories as needed.
 */
async function writeOutput(filepath: string, content: string): Promise<void> {
  const dir = dirname(filepath);
  await mkdir(dir, { recursive: true });
  await writeFile(filepath, content, "utf-8");
}

/**
 * Get emoji for file status.
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "A":
      return "+";
    case "M":
      return "~";
    case "D":
      return "-";
    case "R":
      return "→";
    default:
      return "?";
  }
}

// Re-export types and utilities for testing
export {
  buildDumpDiffJsonV2,
  buildNameStatusArgs,
  buildPerFileDiffArgs,
  buildUntrackedDiffArgs,
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  parseHunkHeader,
  parseDiffIntoHunks,
  parseLsFilesOutput,
  renderDumpDiffJson,
  renderMarkdown,
  renderText,
} from "./core.js";
export { parseNameStatus, parseNumStats } from "./git.js";
export type {
  DiffFile,
  DiffFileEntry,
  DiffFilePatch,
  DiffHunk,
  DiffLine,
  DiffMode,
  DumpDiffJsonV2,
  FileEntry,
  FilterResult,
  SkippedEntry,
  SkippedFile,
} from "./core.js";
export type { FileStats } from "./git.js";
