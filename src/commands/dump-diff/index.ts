/**
 * dump-diff command implementation.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BranchNarratorError } from "../../core/errors.js";
import { warn, info } from "../../core/logger.js";
import {
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  parseDiffIntoHunks,
  renderJson,
  renderMarkdown,
  renderText,
  type DiffFileEntry,
  type DiffMode,
  type DumpDiffOutput,
  type FileEntry,
  type SkippedEntry,
} from "./core.js";
import {
  getFileDiff,
  getFullDiff,
  getNameStatusList,
  getNumStats,
  getUntrackedFileDiff,
  getUntrackedFiles,
  isBinaryFile,
  isUntrackedBinaryFile,
} from "./git.js";

// ============================================================================
// Types
// ============================================================================

export interface DumpDiffOptions {
  mode: DiffMode;
  base: string;
  head: string;
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
}

export interface DryRunResult {
  included: FileEntry[];
  skipped: SkippedEntry[];
  estimatedChars: number;
  wouldChunk: boolean;
  chunkCount?: number;
}

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Execute the dump-diff command.
 */
export async function executeDumpDiff(options: DumpDiffOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

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
    await handlePatchFor(options, cwd);
    return;
  }

  if (options.nameOnly) {
    await handleNameOnly(options, cwd);
    return;
  }

  if (options.stat) {
    await handleStat(options, cwd);
    return;
  }

  // Default: full diff mode (original behavior)
  await handleFullDiff(options, cwd);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build command args array for JSON output metadata.
 */
function buildCommandArgs(options: DumpDiffOptions): string[] {
  const args: string[] = [];

  args.push("--mode", options.mode);

  if (options.mode === "branch") {
    args.push("--base", options.base);
    args.push("--head", options.head);
  }

  if (options.format !== "text") {
    args.push("--format", options.format);
  }

  if (options.unified !== 0) {
    args.push("--unified", String(options.unified));
  }

  for (const glob of options.include) {
    args.push("--include", glob);
  }

  for (const glob of options.exclude) {
    args.push("--exclude", glob);
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
      const output: DumpDiffOutput = {
        schemaVersion: "1.1",
        mode: options.mode,
        base: options.mode === "branch" ? options.base : null,
        head: options.mode === "branch" ? options.head : null,
        unified: options.unified,
        included: [],
        skipped: [],
        stats: {
          filesConsidered: 0,
          filesIncluded: 0,
          filesSkipped: 0,
          chars: 0,
        },
      };
      const json = renderJson(output);
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

  for (const file of included) {
    let isBinary: boolean;

    if (file.untracked) {
      isBinary = await isUntrackedBinaryFile(file.path, cwd);
    } else {
      isBinary = await isBinaryFile({
        mode: options.mode,
        base: options.base,
        head: options.head,
        path: file.path,
        cwd,
      });
    }

    if (isBinary) {
      binarySkipped.push({ path: file.path, reason: "binary" });
    } else {
      textFiles.push(file);
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
    await handleJsonOutput(options, entries, finalSkipped, combinedFiles.length);
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
  for (const file of included) {
    let isBinary: boolean;

    if (file.untracked) {
      isBinary = await isUntrackedBinaryFile(file.path, cwd);
    } else {
      isBinary = await isBinaryFile({
        mode: options.mode,
        base: options.base,
        head: options.head,
        path: file.path,
        cwd,
      });
    }

    if (isBinary) {
      skipped.push({
        path: file.path,
        status: file.status,
        reason: "binary",
      });
    }
  }

  // Sort for deterministic output
  const sortedIncluded = included.sort((a, b) => a.path.localeCompare(b.path));
  const sortedSkipped = skipped.sort((a, b) => a.path.localeCompare(b.path));

  // Output based on format
  if (options.format === "json") {
    const output = {
      schemaVersion: "1.0" as const,
      command: {
        name: "dump-diff" as const,
        args: buildCommandArgs(options),
      },
      git: {
        mode: options.mode,
        base: options.mode === "branch" ? options.base : undefined,
        head: options.mode === "branch" ? options.head : undefined,
        isDirty: options.mode !== "branch" ? true : undefined,
      },
      options: {
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        nameOnly: true,
        stat: false,
        patchFor: undefined,
      },
      files: sortedIncluded.map((f) => ({
        path: f.path,
        oldPath: f.oldPath,
        status: f.status,
      })),
      skippedFiles: sortedSkipped.map((s) => ({
        path: s.path,
        status: s.status,
        reason: s.reason,
        note: s.note,
      })),
      summary: {
        changedFileCount: combinedFiles.length,
        includedFileCount: sortedIncluded.length,
        skippedFileCount: sortedSkipped.length,
      },
    };

    const json = JSON.stringify(output, null, 2);
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
    const output = {
      schemaVersion: "1.0" as const,
      command: {
        name: "dump-diff" as const,
        args: buildCommandArgs(options),
      },
      git: {
        mode: options.mode,
        base: options.mode === "branch" ? options.base : undefined,
        head: options.mode === "branch" ? options.head : undefined,
        isDirty: options.mode !== "branch" ? true : undefined,
      },
      options: {
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        nameOnly: false,
        stat: true,
        patchFor: undefined,
      },
      files: sortedFiles,
      skippedFiles: sortedSkipped.map((s) => ({
        path: s.path,
        status: s.status,
        reason: s.reason,
        note: s.note,
      })),
      summary: {
        changedFileCount: combinedFiles.length,
        includedFileCount: sortedFiles.length,
        skippedFileCount: sortedSkipped.length,
      },
    };

    const json = JSON.stringify(output, null, 2);
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

/**
 * Handle --patch-for mode (single file diff).
 */
async function handlePatchFor(options: DumpDiffOptions, cwd: string): Promise<void> {
  if (!options.patchFor) {
    throw new BranchNarratorError("--patch-for requires a file path", 1);
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

  // Find the file (support both old and new paths for renames)
  let targetFile = combinedFiles.find(
    (f) => f.path === requestedPath || f.oldPath === requestedPath
  );

  if (!targetFile) {
    throw new BranchNarratorError(
      `File not found in changes: ${requestedPath}. ` +
        `Run 'branch-narrator dump-diff --name-only' to see changed files.`,
      1
    );
  }

  // Check if file is excluded
  const { included, skipped } = filterPaths({
    files: [targetFile],
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    defaultExcludes: DEFAULT_EXCLUDES,
  });

  if (included.length === 0) {
    const skipReason = skipped[0]?.reason || "excluded";
    throw new BranchNarratorError(
      `File is excluded: ${requestedPath} (reason: ${skipReason}). ` +
        `Use --include "${requestedPath}" to include it.`,
      1
    );
  }

  // Check if binary
  let isBinary: boolean;
  if (targetFile.untracked) {
    isBinary = await isUntrackedBinaryFile(targetFile.path, cwd);
  } else {
    isBinary = await isBinaryFile({
      mode: options.mode,
      base: options.base,
      head: options.head,
      path: targetFile.path,
      cwd,
    });
  }

  if (isBinary) {
    const allSkipped: SkippedEntry[] = [
      {
        path: targetFile.path,
        status: targetFile.status,
        reason: "binary",
      },
    ];

    // Still report in JSON format
    if (options.format === "json") {
      const output = {
        schemaVersion: "1.0" as const,
        command: {
          name: "dump-diff" as const,
          args: buildCommandArgs(options),
        },
        git: {
          mode: options.mode,
          base: options.mode === "branch" ? options.base : undefined,
          head: options.mode === "branch" ? options.head : undefined,
          isDirty: options.mode !== "branch" ? true : undefined,
        },
        options: {
          unified: options.unified,
          include: options.include,
          exclude: options.exclude,
          nameOnly: false,
          stat: false,
          patchFor: requestedPath,
        },
        files: [],
        skippedFiles: allSkipped.map((s) => ({
          path: s.path,
          status: s.status,
          reason: s.reason,
        })),
        summary: {
          changedFileCount: 1,
          includedFileCount: 0,
          skippedFileCount: 1,
        },
      };

      const json = JSON.stringify(output, null, 2);
      if (options.out) {
        await writeOutput(options.out, json);
        info(`Wrote JSON output to ${options.out}`);
      } else {
        console.log(json);
      }
    } else {
      throw new BranchNarratorError(
        `File is binary: ${requestedPath}`,
        1
      );
    }
    return;
  }

  // Get diff for the file
  let diff: string;
  if (targetFile.untracked) {
    diff = await getUntrackedFileDiff(targetFile.path, options.unified, cwd);
  } else {
    diff = await getFileDiff({
      mode: options.mode,
      base: options.base,
      head: options.head,
      path: targetFile.path,
      oldPath: targetFile.oldPath,
      unified: options.unified,
      cwd,
    });
  }

  // Get stats if in JSON format
  let stats: { added: number; removed: number } | undefined;
  if (options.format === "json") {
    const statsMap = await getNumStats({
      mode: options.mode,
      base: options.base,
      head: options.head,
      cwd,
    });
    const fileStats = statsMap.get(targetFile.path);
    if (fileStats && !fileStats.binary) {
      stats = { added: fileStats.added, removed: fileStats.removed };
    }
  }

  // Output based on format
  if (options.format === "json") {
    const hunks = parseDiffIntoHunks(diff);

    const output = {
      schemaVersion: "1.0" as const,
      command: {
        name: "dump-diff" as const,
        args: buildCommandArgs(options),
      },
      git: {
        mode: options.mode,
        base: options.mode === "branch" ? options.base : undefined,
        head: options.mode === "branch" ? options.head : undefined,
        isDirty: options.mode !== "branch" ? true : undefined,
      },
      options: {
        unified: options.unified,
        include: options.include,
        exclude: options.exclude,
        nameOnly: false,
        stat: false,
        patchFor: requestedPath,
      },
      files: [
        {
          path: targetFile.path,
          oldPath: targetFile.oldPath,
          status: targetFile.status,
          binary: false,
          stats,
          hunks,
        },
      ],
      skippedFiles: [],
      summary: {
        changedFileCount: 1,
        includedFileCount: 1,
        skippedFileCount: 0,
      },
    };

    const json = JSON.stringify(output, null, 2);
    if (options.out) {
      await writeOutput(options.out, json);
      info(`Wrote JSON output to ${options.out}`);
    } else {
      console.log(json);
    }
  } else if (options.format === "md") {
    const lines: string[] = [];
    lines.push(`# Diff for \`${targetFile.path}\`\n`);
    lines.push("```diff");
    lines.push(diff);
    lines.push("```");
    const output = lines.join("\n");
    if (options.out) {
      await writeOutput(options.out, output);
      info(`Wrote markdown output to ${options.out}`);
    } else {
      console.log(output);
    }
  } else {
    // text format
    if (options.out) {
      await writeOutput(options.out, diff);
      info(`Wrote text output to ${options.out}`);
    } else {
      console.log(diff);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fetch diffs for all included files.
 */
async function fetchDiffs(
  options: DumpDiffOptions,
  files: FileEntry[],
  cwd: string
): Promise<DiffFileEntry[]> {
  const entries: DiffFileEntry[] = [];

  for (const file of files) {
    let diff: string;

    if (file.untracked) {
      diff = await getUntrackedFileDiff(file.path, options.unified, cwd);
    } else {
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
      diff,
      untracked: file.untracked,
    });
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
 * Handle JSON format output.
 */
async function handleJsonOutput(
  options: DumpDiffOptions,
  entries: DiffFileEntry[],
  skipped: SkippedEntry[],
  totalFiles: number
): Promise<void> {
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

  const output: DumpDiffOutput = {
    schemaVersion: "1.1",
    mode: options.mode,
    base: options.mode === "branch" ? options.base : null,
    head: options.mode === "branch" ? options.head : null,
    unified: options.unified,
    included: entries,
    skipped: skipped,
    stats: {
      filesConsidered: totalFiles,
      filesIncluded: entries.length,
      filesSkipped: skipped.length,
      chars: totalChars,
    },
  };

  const json = renderJson(output);

  if (options.out) {
    await writeOutput(options.out, json);
    info(`Wrote JSON output to ${options.out}`);
  } else {
    console.log(json);
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
  buildNameStatusArgs,
  buildPerFileDiffArgs,
  buildUntrackedDiffArgs,
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  parseLsFilesOutput,
  renderJson,
  renderMarkdown,
  renderText,
} from "./core.js";
export { parseNameStatus } from "./git.js";
export type {
  DiffFileEntry,
  DiffMode,
  DumpDiffOutput,
  FileEntry,
  FilterResult,
  SkippedEntry,
} from "./core.js";
