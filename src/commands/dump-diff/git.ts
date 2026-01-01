/**
 * Git utilities for dump-diff command.
 */

import { execa } from "execa";
import {
  GitCommandError,
  InvalidRefError,
  NotAGitRepoError,
} from "../../core/errors.js";
import {
  buildNameStatusArgs,
  buildPerFileDiffArgs,
  buildUntrackedDiffArgs,
  parseLsFilesOutput,
  type DiffMode,
  type DiffStatus,
  type FileEntry,
} from "./core.js";

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
 * Parse git diff --name-status output into structured file entries.
 */
export function parseNameStatus(output: string): FileEntry[] {
  if (!output.trim()) {
    return [];
  }

  const entries: FileEntry[] = [];
  const lines = output.trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    // Format: STATUS\tPATH or STATUS\tOLD_PATH\tNEW_PATH (for renames)
    const parts = line.split("\t");
    const statusChar = parts[0]?.charAt(0) as DiffStatus;

    if (statusChar === "R" && parts.length >= 3) {
      // Rename: R100\told_path\tnew_path
      entries.push({
        path: parts[2]!,
        oldPath: parts[1],
        status: "R",
      });
    } else if (parts.length >= 2) {
      entries.push({
        path: parts[1]!,
        status: statusChar,
      });
    }
  }

  return entries;
}

export interface GetNameStatusListOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  cwd?: string;
}

/**
 * Get file list with status from git diff.
 */
export async function getNameStatusList(
  options: GetNameStatusListOptions
): Promise<FileEntry[]> {
  const cwd = options.cwd ?? process.cwd();

  // Validate git repo
  if (!(await isGitRepo(cwd))) {
    throw new NotAGitRepoError(cwd);
  }

  // Validate refs only for branch mode
  if (options.mode === "branch") {
    if (!options.base || !(await refExists(options.base, cwd))) {
      throw new InvalidRefError(options.base ?? "undefined");
    }
    if (!options.head || !(await refExists(options.head, cwd))) {
      throw new InvalidRefError(options.head ?? "undefined");
    }
  }

  const args = buildNameStatusArgs({
    mode: options.mode,
    base: options.base,
    head: options.head,
  });

  try {
    const result = await execa("git", args, { cwd });
    return parseNameStatus(result.stdout);
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git ${args.join(" ")}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

export interface GetFileDiffOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  path: string;
  oldPath?: string;
  unified?: number;
  cwd?: string;
}

/**
 * Get unified diff for a single file.
 */
export async function getFileDiff(options: GetFileDiffOptions): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const unified = options.unified ?? 0;

  const args = buildPerFileDiffArgs({
    mode: options.mode,
    base: options.base,
    head: options.head,
    unified,
    path: options.path,
    oldPath: options.oldPath,
  });

  try {
    const result = await execa("git", args, { cwd });
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git ${args.join(" ")}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

export interface IsBinaryFileOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  path: string;
  cwd?: string;
}

/**
 * Check if a file is binary using git diff --numstat.
 * Binary files show "-" for additions/deletions.
 */
export async function isBinaryFile(options: IsBinaryFileOptions): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();

  // Build args similar to name-status but with --numstat
  const args = ["diff", "--numstat", "--find-renames"];

  switch (options.mode) {
    case "branch":
      args.push(`${options.base}..${options.head}`);
      break;
    case "unstaged":
      break;
    case "staged":
      args.push("--staged");
      break;
    case "all":
      args.push("HEAD");
      break;
  }

  args.push("--", options.path);

  try {
    const result = await execa("git", args, { cwd, reject: false });

    // Binary files show: -\t-\tfilename
    const line = result.stdout.trim();
    if (!line) return false;

    const parts = line.split("\t");
    return parts[0] === "-" && parts[1] === "-";
  } catch {
    return false;
  }
}

/**
 * Get list of untracked files (files only, not directories).
 * Uses git ls-files which only returns file paths, avoiding the
 * directory issue with git status --porcelain.
 */
export async function getUntrackedFiles(
  cwd: string = process.cwd()
): Promise<string[]> {
  try {
    const result = await execa(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd }
    );
    return parseLsFilesOutput(result.stdout);
  } catch {
    return [];
  }
}

/**
 * Get diff for an untracked file using --no-index.
 */
export async function getUntrackedFileDiff(
  path: string,
  unified: number = 0,
  cwd: string = process.cwd()
): Promise<string> {
  const args = buildUntrackedDiffArgs(path, unified);

  try {
    // git diff --no-index returns exit code 1 when there are differences
    const result = await execa("git", args, { cwd, reject: false });
    return result.stdout;
  } catch {
    return "";
  }
}

/**
 * Check if an untracked file is binary.
 * We check by trying to get the diff - if it contains "Binary files" it's binary.
 */
export async function isUntrackedBinaryFile(
  path: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  try {
    const result = await execa(
      "git",
      ["diff", "--no-index", "--", "/dev/null", path],
      { cwd, reject: false }
    );
    return result.stdout.includes("Binary files");
  } catch {
    return false;
  }
}

export interface GetFullDiffOptions {
  mode: DiffMode;
  base?: string;
  head?: string;
  paths: string[];
  unified?: number;
  cwd?: string;
}

/**
 * Get the full unified diff for all files (used for text output).
 */
export async function getFullDiff(options: GetFullDiffOptions): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const unified = options.unified ?? 0;

  if (options.paths.length === 0) {
    return "";
  }

  const args = ["diff", `--unified=${unified}`, "--find-renames"];

  switch (options.mode) {
    case "branch":
      args.push(`${options.base}..${options.head}`);
      break;
    case "unstaged":
      break;
    case "staged":
      args.push("--staged");
      break;
    case "all":
      args.push("HEAD");
      break;
  }

  args.push("--", ...options.paths);

  try {
    const result = await execa("git", args, { cwd });
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git ${args.join(" ")}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}
