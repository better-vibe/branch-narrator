/**
 * dump-diff command implementation.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BranchNarratorError } from "../../core/errors.js";
import {
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  renderJson,
  renderMarkdown,
  renderText,
  type DiffFileEntry,
  type DumpDiffOutput,
  type FileEntry,
  type SkippedEntry,
} from "./core.js";
import {
  getFileDiff,
  getFullDiff,
  getNameStatusList,
  getRenamedFileDiff,
  isBinaryFile,
} from "./git.js";

// ============================================================================
// Types
// ============================================================================

export interface DumpDiffOptions {
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
  cwd?: string;
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

  // Get file list from git
  const allFiles = await getNameStatusList(options.base, options.head, cwd);

  if (allFiles.length === 0) {
    console.log("No changes found between refs.");
    return;
  }

  // Filter files
  const { included, skipped } = filterPaths({
    files: allFiles,
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    defaultExcludes: DEFAULT_EXCLUDES,
  });

  // Detect binary files and move them to skipped
  const textFiles: FileEntry[] = [];
  const binarySkipped: SkippedEntry[] = [];

  for (const file of included) {
    const isBinary = await isBinaryFile(
      options.base,
      options.head,
      file.path,
      cwd
    );
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
  const entries = await fetchDiffs(
    options.base,
    options.head,
    textFiles,
    options.unified,
    cwd
  );

  // Handle output based on format
  if (options.format === "json") {
    await handleJsonOutput(options, entries, allSkipped, allFiles.length);
  } else {
    await handleTextOrMdOutput(options, entries, allSkipped, allFiles.length, cwd);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fetch diffs for all included files.
 */
async function fetchDiffs(
  base: string,
  head: string,
  files: FileEntry[],
  unified: number,
  cwd: string
): Promise<DiffFileEntry[]> {
  const entries: DiffFileEntry[] = [];

  for (const file of files) {
    let diff: string;

    if (file.status === "R" && file.oldPath) {
      diff = await getRenamedFileDiff(
        base,
        head,
        file.oldPath,
        file.path,
        unified,
        cwd
      );
    } else {
      diff = await getFileDiff(base, head, file.path, unified, cwd);
    }

    entries.push({
      path: file.path,
      oldPath: file.oldPath,
      status: file.status,
      diff,
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
    // For estimation, get the full diff which is faster than per-file
    const paths = included.map((f) => f.path);
    const fullDiff = await getFullDiff(
      options.base,
      options.head,
      paths,
      options.unified,
      cwd
    );
    estimatedChars = fullDiff.length;
  }

  const wouldChunk =
    options.maxChars !== undefined && estimatedChars > options.maxChars;

  console.log("=== Dry Run ===\n");
  console.log(`Base: ${options.base}`);
  console.log(`Head: ${options.head}`);
  console.log(`Format: ${options.format}`);
  console.log(`Unified context: ${options.unified} lines`);
  console.log("");

  console.log(`Files included (${included.length}):`);
  for (const file of included) {
    const status = getStatusEmoji(file.status);
    console.log(`  ${status} ${file.path}`);
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
    schemaVersion: "1.0",
    base: options.base,
    head: options.head,
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
    console.error(`Wrote JSON output to ${options.out}`);
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
    base: options.base,
    head: options.head,
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
        content = renderMarkdown(chunk, {
          ...renderOpts,
          base: `${options.base} (chunk ${i + 1}/${chunks.length})`,
        });
      } else {
        content = renderText(chunk);
      }

      await writeFile(filepath, content, "utf-8");
      console.error(`Wrote chunk ${i + 1}/${chunks.length} to ${filepath}`);
    }

    console.error(
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
      console.error(`Wrote ${options.format} output to ${options.out}`);
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
  calculateTotalChars,
  chunkByBudget,
  DEFAULT_EXCLUDES,
  filterPaths,
  renderJson,
  renderMarkdown,
  renderText,
} from "./core.js";
export { parseNameStatus } from "./git.js";
export type {
  DiffFileEntry,
  DumpDiffOutput,
  FileEntry,
  FilterResult,
  SkippedEntry,
} from "./core.js";

