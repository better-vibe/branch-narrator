/**
 * Git command execution and data collection.
 */

import { execa } from "execa";
import parseDiff from "parse-diff";
import {
  buildChangeSet,
  type ParseDiffFile,
} from "../core/change-set.js";
import {
  GitCommandError,
  InvalidRefError,
  NotAGitRepoError,
} from "../core/errors.js";
import type { ChangeSet } from "../core/types.js";

/**
 * Check if the current directory is inside a git repository.
 */
export async function isGitRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const result = await execa("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      reject: false,
    });
    return result.exitCode === 0 && result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Validate that a git reference exists.
 */
export async function refExists(
  ref: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  try {
    const result = await execa("git", ["rev-parse", "--verify", ref], {
      cwd,
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get git diff --name-status output.
 * If head is null, compares working directory against base.
 */
export async function getNameStatus(
  base: string,
  head: string | null,
  cwd: string = process.cwd()
): Promise<string> {
  try {
    const args = head
      ? ["diff", "--name-status", "--find-renames", `${base}..${head}`]
      : ["diff", "--name-status", "--find-renames", base];
    const result = await execa("git", args, { cwd });
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      const ref = head ? `${base}..${head}` : base;
      throw new GitCommandError(
        `git diff --name-status ${ref}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

/**
 * Get unified diff output.
 * If head is null, compares working directory against base.
 */
export async function getUnifiedDiff(
  base: string,
  head: string | null,
  cwd: string = process.cwd()
): Promise<string> {
  try {
    const args = head
      ? ["diff", "--unified=3", `${base}..${head}`]
      : ["diff", "--unified=3", base];
    const result = await execa("git", args, { cwd });
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      const ref = head ? `${base}..${head}` : base;
      throw new GitCommandError(
        `git diff ${ref}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

/**
 * Get file content at a specific ref.
 */
export async function getFileAtRef(
  ref: string,
  filePath: string,
  cwd: string = process.cwd()
): Promise<string | null> {
  try {
    const result = await execa("git", ["show", `${ref}:${filePath}`], {
      cwd,
      reject: false,
    });
    if (result.exitCode === 0) {
      return result.stdout;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse package.json content safely.
 */
function parsePackageJson(content: string | null): Record<string, unknown> | undefined {
  if (!content) return undefined;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Get untracked files (new files not yet added to git).
 */
export async function getUntrackedFiles(
  cwd: string = process.cwd()
): Promise<string[]> {
  try {
    const result = await execa(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd }
    );
    return result.stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Read file content from working directory.
 */
async function readWorkingFile(
  filePath: string,
  cwd: string
): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return await readFile(join(cwd, filePath), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Create synthetic diff entries for untracked files.
 */
async function createUntrackedDiffs(
  untrackedFiles: string[],
  cwd: string
): Promise<{ nameStatus: string; diffs: ParseDiffFile[] }> {
  const nameStatusLines: string[] = [];
  const diffs: ParseDiffFile[] = [];

  for (const file of untrackedFiles) {
    // Skip binary files and very large files
    if (isBinaryFile(file)) {
      nameStatusLines.push(`A\t${file}`);
      continue;
    }

    const content = await readWorkingFile(file, cwd);
    if (content === null) continue;

    nameStatusLines.push(`A\t${file}`);

    // Create a synthetic diff for the file
    const lines = content.split("\n");
    const changes = lines.map((line, idx) => ({
      type: "add" as const,
      content: "+" + line,
      ln: idx + 1,
    }));

    diffs.push({
      from: "/dev/null",
      to: file,
      chunks: [
        {
          content: `@@ -0,0 +1,${lines.length} @@`,
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: lines.length,
          changes,
        },
      ],
      deletions: 0,
      additions: lines.length,
    });
  }

  return {
    nameStatus: nameStatusLines.join("\n"),
    diffs,
  };
}

/**
 * Check if a file is likely binary based on extension.
 */
function isBinaryFile(path: string): boolean {
  const binaryExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".tar", ".gz", ".tgz", ".rar",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".exe", ".dll", ".so", ".dylib",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".lockb", // bun.lockb is binary
  ];
  return binaryExtensions.some((ext) => path.toLowerCase().endsWith(ext));
}

/**
 * Get current package.json from working directory.
 */
async function getWorkingPackageJson(
  cwd: string
): Promise<Record<string, unknown> | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const content = await readFile(join(cwd, "package.json"), "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export interface CollectChangeSetOptions {
  base: string;
  head: string;
  cwd?: string;
  uncommitted?: boolean;
}

/**
 * Collect all git diff data and build a ChangeSet.
 * If uncommitted is true, compares working directory against base.
 */
export async function collectChangeSet(
  baseOrOptions: string | CollectChangeSetOptions,
  head?: string,
  cwd: string = process.cwd()
): Promise<ChangeSet> {
  // Handle both old signature and new options object
  let options: CollectChangeSetOptions;
  if (typeof baseOrOptions === "string") {
    options = { base: baseOrOptions, head: head!, cwd };
  } else {
    options = baseOrOptions;
    cwd = options.cwd ?? process.cwd();
  }

  const { base, uncommitted } = options;
  const headRef = uncommitted ? null : options.head;

  // Validate git repo
  if (!(await isGitRepo(cwd))) {
    throw new NotAGitRepoError(cwd);
  }

  // Validate refs
  if (!(await refExists(base, cwd))) {
    throw new InvalidRefError(base);
  }
  if (headRef && !(await refExists(headRef, cwd))) {
    throw new InvalidRefError(headRef);
  }

  // Collect data for tracked files
  const [nameStatusOutput, unifiedDiff, basePackageContent] = await Promise.all([
    getNameStatus(base, headRef, cwd),
    getUnifiedDiff(base, headRef, cwd),
    getFileAtRef(base, "package.json", cwd),
  ]);

  // Parse unified diff for tracked files
  let parsedDiffs = parseDiff(unifiedDiff) as ParseDiffFile[];
  let finalNameStatus = nameStatusOutput;

  // If uncommitted mode, also include untracked files
  if (uncommitted) {
    const untrackedFiles = await getUntrackedFiles(cwd);
    if (untrackedFiles.length > 0) {
      const untrackedData = await createUntrackedDiffs(untrackedFiles, cwd);

      // Merge untracked files into results
      if (untrackedData.nameStatus) {
        finalNameStatus = finalNameStatus
          ? `${finalNameStatus}\n${untrackedData.nameStatus}`
          : untrackedData.nameStatus;
      }
      parsedDiffs = [...parsedDiffs, ...untrackedData.diffs];
    }
  }

  // Get head package.json (from ref or working directory)
  const headPackageContent = uncommitted
    ? await getWorkingPackageJson(cwd)
    : parsePackageJson(await getFileAtRef(headRef!, "package.json", cwd));

  // Build ChangeSet
  return buildChangeSet({
    base,
    head: uncommitted ? "WORKING" : options.head,
    nameStatusOutput: finalNameStatus,
    parsedDiffs,
    basePackageJson: parsePackageJson(basePackageContent),
    headPackageJson: uncommitted ? headPackageContent : parsePackageJson(
      await getFileAtRef(options.head, "package.json", cwd)
    ),
  });
}

