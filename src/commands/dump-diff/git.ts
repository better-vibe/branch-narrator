/**
 * Git utilities for dump-diff command.
 */

import { execa } from "execa";
import {
  GitCommandError,
  InvalidRefError,
  NotAGitRepoError,
} from "../../core/errors.js";
import type { DiffStatus, FileEntry } from "./core.js";

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

/**
 * Get file list with status from git diff.
 */
export async function getNameStatusList(
  base: string,
  head: string,
  cwd: string = process.cwd()
): Promise<FileEntry[]> {
  // Validate git repo
  if (!(await isGitRepo(cwd))) {
    throw new NotAGitRepoError(cwd);
  }

  // Validate refs
  if (!(await refExists(base, cwd))) {
    throw new InvalidRefError(base);
  }
  if (!(await refExists(head, cwd))) {
    throw new InvalidRefError(head);
  }

  try {
    const result = await execa(
      "git",
      ["diff", "--name-status", "--find-renames", `${base}..${head}`],
      { cwd }
    );
    return parseNameStatus(result.stdout);
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git diff --name-status ${base}..${head}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

/**
 * Get unified diff for a single file.
 */
export async function getFileDiff(
  base: string,
  head: string,
  path: string,
  unified: number = 0,
  cwd: string = process.cwd()
): Promise<string> {
  try {
    const result = await execa(
      "git",
      ["diff", `--unified=${unified}`, "--find-renames", `${base}..${head}`, "--", path],
      { cwd }
    );
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git diff ${base}..${head} -- ${path}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

/**
 * Get unified diff for a renamed file (need to use old path).
 */
export async function getRenamedFileDiff(
  base: string,
  head: string,
  oldPath: string,
  newPath: string,
  unified: number = 0,
  cwd: string = process.cwd()
): Promise<string> {
  try {
    // For renames, we need to specify both paths or use the old path
    const result = await execa(
      "git",
      [
        "diff",
        `--unified=${unified}`,
        "--find-renames",
        `${base}..${head}`,
        "--",
        oldPath,
        newPath,
      ],
      { cwd }
    );
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git diff ${base}..${head} -- ${oldPath} ${newPath}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

/**
 * Check if a file is binary using git diff --numstat.
 * Binary files show "-" for additions/deletions.
 */
export async function isBinaryFile(
  base: string,
  head: string,
  path: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  try {
    const result = await execa(
      "git",
      ["diff", "--numstat", "--find-renames", `${base}..${head}`, "--", path],
      { cwd, reject: false }
    );

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
 * Get the full unified diff for all files (used for text output).
 */
export async function getFullDiff(
  base: string,
  head: string,
  paths: string[],
  unified: number = 0,
  cwd: string = process.cwd()
): Promise<string> {
  if (paths.length === 0) {
    return "";
  }

  try {
    const result = await execa(
      "git",
      [
        "diff",
        `--unified=${unified}`,
        "--find-renames",
        `${base}..${head}`,
        "--",
        ...paths,
      ],
      { cwd }
    );
    return result.stdout;
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        `git diff ${base}..${head}`,
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

