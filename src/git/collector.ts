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
import type { ChangeSet, DiffMode } from "../core/types.js";

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
 * Detect the default branch of the remote origin.
 * Falls back to "main" if detection fails.
 */
export async function getDefaultBranch(cwd: string = process.cwd()): Promise<string> {
  try {
    // Try to get the symbolic ref for origin/HEAD
    const result = await execa("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], {
      cwd,
      reject: false,
    });

    if (result.exitCode === 0) {
      // Output should be like "refs/remotes/origin/main"
      // Validate format and extract branch name
      const trimmed = result.stdout.trim();
      if (trimmed && trimmed.startsWith("refs/remotes/origin/")) {
        const branchName = trimmed.substring("refs/remotes/origin/".length);
        // Validate that we got a non-empty branch name
        if (branchName && branchName !== "") {
          return branchName;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return "main";
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
 * Build git diff --name-status arguments based on mode.
 */
function buildNameStatusArgs(options: {
  mode: DiffMode;
  base?: string;
  head?: string;
}): string[] {
  const args = ["diff", "--name-status", "--find-renames"];

  switch (options.mode) {
    case "branch":
      args.push(`${options.base}..${options.head}`);
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

/**
 * Build git diff arguments based on mode.
 */
function buildUnifiedDiffArgs(options: {
  mode: DiffMode;
  base?: string;
  head?: string;
}): string[] {
  const args = ["diff", "--unified=3"];

  switch (options.mode) {
    case "branch":
      args.push(`${options.base}..${options.head}`);
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

/**
 * Get git diff --name-status output based on mode.
 */
export async function getNameStatusByMode(
  options: {
    mode: DiffMode;
    base?: string;
    head?: string;
  },
  cwd: string = process.cwd()
): Promise<string> {
  const args = buildNameStatusArgs(options);

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

/**
 * Get unified diff output based on mode.
 */
export async function getUnifiedDiffByMode(
  options: {
    mode: DiffMode;
    base?: string;
    head?: string;
  },
  cwd: string = process.cwd()
): Promise<string> {
  const args = buildUnifiedDiffArgs(options);

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

/**
 * Get git diff --name-status output.
 * If head is null, compares working directory against base.
 * @deprecated Use getNameStatusByMode instead
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
 * @deprecated Use getUnifiedDiffByMode instead
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

/**
 * @deprecated Use CollectChangeSetOptionsV2 with mode instead
 */
export interface CollectChangeSetOptions {
  base: string;
  head: string;
  cwd?: string;
  uncommitted?: boolean;
}

export interface CollectChangeSetOptionsV2 {
  mode: DiffMode;
  base?: string;
  head?: string;
  cwd?: string;
  includeUntracked?: boolean;
}

/**
 * Collect all git diff data and build a ChangeSet.
 * Supports both legacy options (base/head/uncommitted) and new mode-based options.
 */
export async function collectChangeSet(
  baseOrOptions: string | CollectChangeSetOptions | CollectChangeSetOptionsV2,
  head?: string,
  cwd: string = process.cwd()
): Promise<ChangeSet> {
  // Handle v2 options with mode
  if (typeof baseOrOptions === "object" && "mode" in baseOrOptions) {
    return collectChangeSetByMode(baseOrOptions);
  }

  // Handle both old signature and legacy options object
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

/**
 * Collect all git diff data and build a ChangeSet using mode-based options.
 */
async function collectChangeSetByMode(
  options: CollectChangeSetOptionsV2
): Promise<ChangeSet> {
  const cwd = options.cwd ?? process.cwd();
  const includeUntracked = options.includeUntracked ?? (options.mode === "all");

  // Validate git repo
  if (!(await isGitRepo(cwd))) {
    throw new NotAGitRepoError(cwd);
  }

  // Validate refs only for branch mode
  if (options.mode === "branch") {
    if (!options.base) {
      throw new InvalidRefError("base (required for branch mode)");
    }
    if (!options.head) {
      throw new InvalidRefError("head (required for branch mode)");
    }
    if (!(await refExists(options.base, cwd))) {
      throw new InvalidRefError(options.base);
    }
    if (!(await refExists(options.head, cwd))) {
      throw new InvalidRefError(options.head);
    }
  }

  // For non-branch modes that reference HEAD, validate HEAD exists
  if (options.mode === "staged" || options.mode === "all") {
    if (!(await refExists("HEAD", cwd))) {
      throw new InvalidRefError("HEAD");
    }
  }

  // Collect data based on mode
  const [nameStatusOutput, unifiedDiff] = await Promise.all([
    getNameStatusByMode(options, cwd),
    getUnifiedDiffByMode(options, cwd),
  ]);

  // Parse unified diff for tracked files
  let parsedDiffs = parseDiff(unifiedDiff) as ParseDiffFile[];
  let finalNameStatus = nameStatusOutput;

  // Include untracked files if requested (default for "all" mode)
  if (includeUntracked && options.mode !== "branch") {
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

  // Determine base/head for ChangeSet based on mode
  let base: string;
  let head: string;
  let basePackageJson: Record<string, unknown> | undefined;
  let headPackageJson: Record<string, unknown> | undefined;

  switch (options.mode) {
    case "branch":
      base = options.base!;
      head = options.head!;
      basePackageJson = parsePackageJson(await getFileAtRef(base, "package.json", cwd));
      headPackageJson = parsePackageJson(await getFileAtRef(head, "package.json", cwd));
      break;

    case "unstaged":
      base = "INDEX";
      head = "WORKING";
      // For unstaged, the "base" is the index - get from HEAD since that's what's staged
      basePackageJson = await getWorkingPackageJson(cwd); // Index is close to working for most cases
      headPackageJson = await getWorkingPackageJson(cwd);
      break;

    case "staged":
      base = "HEAD";
      head = "INDEX";
      basePackageJson = parsePackageJson(await getFileAtRef("HEAD", "package.json", cwd));
      headPackageJson = await getWorkingPackageJson(cwd); // Staged content
      break;

    case "all":
      base = "HEAD";
      head = "WORKING";
      basePackageJson = parsePackageJson(await getFileAtRef("HEAD", "package.json", cwd));
      headPackageJson = await getWorkingPackageJson(cwd);
      break;
  }

  // Build ChangeSet
  return buildChangeSet({
    base,
    head,
    nameStatusOutput: finalNameStatus,
    parsedDiffs,
    basePackageJson,
    headPackageJson,
  });
}

/**
 * Get git repository root.
 */
export async function getRepoRoot(cwd: string = process.cwd()): Promise<string> {
  try {
    const result = await execa("git", [
      "rev-parse",
      "--show-toplevel",
    ], { cwd });
    return result.stdout.trim();
  } catch {
    return cwd;
  }
}

/**
 * Check if working directory is dirty.
 */
export async function isWorkingDirDirty(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const result = await execa("git", [
      "diff-index",
      "--quiet",
      "HEAD",
      "--",
    ], { cwd, reject: false });
    return result.exitCode !== 0;
  } catch {
    return false;
  }
}
