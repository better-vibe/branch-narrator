/**
 * Git operations for snapshot management.
 *
 * Provides functions for generating binary patches, managing untracked files,
 * applying patches, and resetting the working tree.
 */

import { execa } from "execa";
import { readFile, stat, chmod, unlink, readdir, rmdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { GitCommandError } from "../../core/errors.js";

// ============================================================================
// Git Info Operations
// ============================================================================

/**
 * Get the current HEAD SHA (full 40-character hash).
 */
export async function getHeadSha(cwd: string = process.cwd()): Promise<string> {
  try {
    const result = await execa("git", ["rev-parse", "HEAD"], { cwd });
    return result.stdout.trim();
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError("git rev-parse HEAD", String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

/**
 * Get the current branch name.
 * Returns empty string if in detached HEAD state.
 */
export async function getCurrentBranch(cwd: string = process.cwd()): Promise<string> {
  try {
    const result = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const branch = result.stdout.trim();
    // In detached HEAD state, git returns "HEAD"
    return branch === "HEAD" ? "" : branch;
  } catch {
    return "";
  }
}

/**
 * Check if there are any staged changes.
 */
export async function hasStagedChanges(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const result = await execa("git", ["diff", "--cached", "--quiet"], { cwd, reject: false });
    return result.exitCode !== 0;
  } catch {
    return false;
  }
}

/**
 * Check if there are any unstaged changes.
 */
export async function hasUnstagedChanges(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const result = await execa("git", ["diff", "--quiet"], { cwd, reject: false });
    return result.exitCode !== 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Binary Patch Operations
// ============================================================================

/**
 * Generate a binary patch for staged changes.
 * Returns empty buffer if no staged changes.
 */
export async function getStagedPatch(cwd: string = process.cwd()): Promise<Buffer> {
  try {
    const result = await execa("git", ["diff", "--binary", "--staged"], {
      cwd,
      maxBuffer: 100 * 1024 * 1024, // 100MB max
    });
    return Buffer.from(result.stdout, "utf-8");
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError("git diff --binary --staged", String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

/**
 * Generate a binary patch for unstaged changes.
 * Returns empty buffer if no unstaged changes.
 */
export async function getUnstagedPatch(cwd: string = process.cwd()): Promise<Buffer> {
  try {
    const result = await execa("git", ["diff", "--binary"], {
      cwd,
      maxBuffer: 100 * 1024 * 1024, // 100MB max
    });
    return Buffer.from(result.stdout, "utf-8");
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError("git diff --binary", String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

/**
 * Apply a patch file.
 * @param patchPath - Path to the patch file
 * @param options - Apply options
 * @param options.cached - Apply to index only (--cached)
 * @param options.check - Check if patch applies cleanly without applying
 */
export async function applyPatch(
  patchPath: string,
  options: { cached?: boolean; check?: boolean } = {},
  cwd: string = process.cwd()
): Promise<void> {
  const args = ["apply"];

  if (options.cached) {
    args.push("--cached");
  }

  if (options.check) {
    args.push("--check");
  }

  args.push(patchPath);

  try {
    await execa("git", args, { cwd });
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(`git ${args.join(" ")}`, String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

/**
 * Apply a patch from buffer content.
 * Uses stdin to pass patch content.
 */
export async function applyPatchFromBuffer(
  patchContent: Buffer,
  options: { cached?: boolean; check?: boolean } = {},
  cwd: string = process.cwd()
): Promise<void> {
  if (patchContent.length === 0) {
    // Empty patch, nothing to apply
    return;
  }

  const args = ["apply"];

  if (options.cached) {
    args.push("--cached");
  }

  if (options.check) {
    args.push("--check");
  }

  args.push("-"); // Read from stdin

  try {
    await execa("git", args, {
      cwd,
      input: patchContent,
    });
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(`git ${args.join(" ")}`, String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

// ============================================================================
// Untracked Files Operations
// ============================================================================

/**
 * Get list of untracked files (excluding ignored).
 * Uses null-separated output for binary-safe file names.
 */
export async function getUntrackedFiles(cwd: string = process.cwd()): Promise<string[]> {
  try {
    const result = await execa("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd });
    const output = result.stdout;
    if (!output) {
      return [];
    }
    // Split by null character, filter empty strings
    return output.split("\0").filter(Boolean);
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError(
        "git ls-files --others --exclude-standard -z",
        String((error as { stderr: unknown }).stderr)
      );
    }
    throw error;
  }
}

/**
 * Read file content from the working directory.
 */
export async function readWorkingFile(filePath: string, cwd: string = process.cwd()): Promise<Buffer> {
  const fullPath = join(cwd, filePath);
  return await readFile(fullPath);
}

/**
 * Get file mode (permissions).
 */
export async function getFileMode(filePath: string, cwd: string = process.cwd()): Promise<number> {
  const fullPath = join(cwd, filePath);
  const stats = await stat(fullPath);
  return stats.mode;
}

/**
 * Check if a file is executable.
 */
export async function isExecutable(filePath: string, cwd: string = process.cwd()): Promise<boolean> {
  try {
    const mode = await getFileMode(filePath, cwd);
    // Check if any execute bit is set
    return (mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Reset Operations
// ============================================================================

/**
 * Hard reset to HEAD.
 * This discards all staged and unstaged changes to tracked files.
 */
export async function resetHard(cwd: string = process.cwd()): Promise<void> {
  try {
    await execa("git", ["reset", "--hard", "HEAD"], { cwd });
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError("git reset --hard HEAD", String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

/**
 * Clean untracked files (but not ignored files).
 * This removes all untracked files from the working directory.
 * Excludes .branch-narrator directory to preserve snapshots.
 */
export async function cleanUntracked(cwd: string = process.cwd()): Promise<void> {
  try {
    // Use --exclude to preserve the .branch-narrator directory
    await execa("git", ["clean", "-fd", "--exclude=.branch-narrator"], { cwd });
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new GitCommandError("git clean -fd --exclude=.branch-narrator", String((error as { stderr: unknown }).stderr));
    }
    throw error;
  }
}

/**
 * Remove a specific untracked file.
 */
export async function removeUntrackedFile(filePath: string, cwd: string = process.cwd()): Promise<void> {
  const fullPath = join(cwd, filePath);
  try {
    await unlink(fullPath);

    // Try to remove empty parent directories
    let dir = dirname(fullPath);
    while (dir !== cwd && dir !== dirname(dir)) {
      try {
        const entries = await readdir(dir);
        if (entries.length === 0) {
          await rmdir(dir);
          dir = dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

// ============================================================================
// File Restoration Operations
// ============================================================================

/**
 * Write a file to the working directory with specified mode.
 */
export async function writeWorkingFile(
  filePath: string,
  content: Buffer,
  mode: number,
  cwd: string = process.cwd()
): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const fullPath = join(cwd, filePath);

  // Ensure parent directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  // Write file content
  await writeFile(fullPath, content);

  // Set file mode
  await chmod(fullPath, mode);
}

// ============================================================================
// Verification Operations
// ============================================================================

/**
 * Verify that the current HEAD matches an expected SHA.
 */
export async function verifyHeadSha(expectedSha: string, cwd: string = process.cwd()): Promise<boolean> {
  const currentSha = await getHeadSha(cwd);
  return currentSha === expectedSha;
}

/**
 * Get the diff stat for staged changes.
 */
export async function getStagedStat(cwd: string = process.cwd()): Promise<string> {
  try {
    const result = await execa("git", ["diff", "--staged", "--stat"], { cwd });
    return result.stdout;
  } catch {
    return "";
  }
}

/**
 * Get the diff stat for unstaged changes.
 */
export async function getUnstagedStat(cwd: string = process.cwd()): Promise<string> {
  try {
    const result = await execa("git", ["diff", "--stat"], { cwd });
    return result.stdout;
  } catch {
    return "";
  }
}

/**
 * Get list of files changed in staged area.
 */
export async function getStagedFiles(cwd: string = process.cwd()): Promise<string[]> {
  try {
    const result = await execa("git", ["diff", "--cached", "--name-only", "-z"], { cwd });
    if (!result.stdout) {
      return [];
    }
    return result.stdout.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get list of files changed in working tree (unstaged).
 */
export async function getUnstagedFiles(cwd: string = process.cwd()): Promise<string[]> {
  try {
    const result = await execa("git", ["diff", "--name-only", "-z"], { cwd });
    if (!result.stdout) {
      return [];
    }
    return result.stdout.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}
