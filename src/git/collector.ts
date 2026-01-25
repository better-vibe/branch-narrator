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
import { batchGetFileContent } from "./batch.js";
import { getCache, computeHash } from "../cache/index.js";

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
      // Output is like "refs/remotes/origin/main"
      // Split by slash and get the last part
      const parts = result.stdout.trim().split("/");
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
  } catch {
    // Ignore errors
  }

  return "main";
}

/**
 * Validate that a git reference exists.
 * Uses cache to avoid redundant git calls.
 */
export async function refExists(
  ref: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  const cache = getCache(cwd);

  // Check cache first
  const cached = cache.getRefSha(ref);
  if (cached !== null) {
    return cached.exists;
  }

  try {
    const result = await execa("git", ["rev-parse", "--verify", ref], {
      cwd,
      reject: false,
    });
    const exists = result.exitCode === 0;
    const sha = exists ? result.stdout.trim() : "";

    // Store in cache
    await cache.setRefSha(ref, sha, exists);

    return exists;
  } catch {
    return false;
  }
}

/**
 * Get the SHA for a git reference.
 * Uses cache to avoid redundant git calls.
 */
export async function getRefSha(
  ref: string,
  cwd: string = process.cwd()
): Promise<string | null> {
  const cache = getCache(cwd);

  // Check cache first
  const cached = cache.getRefSha(ref);
  if (cached !== null) {
    return cached.exists ? cached.sha : null;
  }

  try {
    const result = await execa("git", ["rev-parse", "--verify", ref], {
      cwd,
      reject: false,
    });
    const exists = result.exitCode === 0;
    const sha = exists ? result.stdout.trim() : "";

    // Store in cache
    await cache.setRefSha(ref, sha, exists);

    return exists ? sha : null;
  } catch {
    return null;
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
 * Reads files in parallel for improved performance.
 */
async function createUntrackedDiffs(
  untrackedFiles: string[],
  cwd: string
): Promise<{ nameStatus: string; diffs: ParseDiffFile[] }> {
  const nameStatusLines: string[] = [];
  const diffs: ParseDiffFile[] = [];

  // Separate binary files from text files
  const binaryFiles: string[] = [];
  const textFiles: string[] = [];

  for (const file of untrackedFiles) {
    if (isBinaryFile(file)) {
      binaryFiles.push(file);
    } else {
      textFiles.push(file);
    }
  }

  // Add binary files to name status (no diff content)
  for (const file of binaryFiles) {
    nameStatusLines.push(`A\t${file}`);
  }

  // Read all text files in parallel for performance
  const fileReadResults = await Promise.all(
    textFiles.map(async (file) => ({
      file,
      content: await readWorkingFile(file, cwd),
    }))
  );

  // Process read results
  for (const { file, content } of fileReadResults) {
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
 * Set of binary file extensions for O(1) lookup.
 * Pre-compiled at module load time for maximum performance.
 */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".tgz", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib",
  ".mp3", ".mp4", ".wav", ".avi", ".mov",
  ".lockb", // bun.lockb is binary
]);

/**
 * Check if a file is likely binary based on extension.
 * Uses Set lookup for O(1) performance.
 */
function isBinaryFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  // Find the last dot to extract extension
  const lastDot = lowerPath.lastIndexOf(".");
  if (lastDot === -1) return false;
  const ext = lowerPath.slice(lastDot);
  return BINARY_EXTENSIONS.has(ext);
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
}

export interface CollectChangeSetOptionsV2 {
  mode: DiffMode;
  base?: string;
  head?: string;
  cwd?: string;
  includeUntracked?: boolean;
  /** Skip cache lookup (default: false) */
  noCache?: boolean;
}

/**
 * Collect all git diff data and build a ChangeSet.
 * Supports both legacy options (base/head) and new mode-based options.
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

  const { base } = options;
  const headRef = options.head;

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

  // Collect data for tracked files and both package.json files in parallel
  const [nameStatusOutput, unifiedDiff, packageJsonBatch] = await Promise.all([
    getNameStatus(base, headRef, cwd),
    getUnifiedDiff(base, headRef, cwd),
    // Use batch operation to get both package.json files in one git call
    batchGetFileContent(
      [
        { ref: base, path: "package.json" },
        { ref: headRef!, path: "package.json" },
      ],
      cwd
    ),
  ]);

  // Parse unified diff for tracked files
  const parsedDiffs = parseDiff(unifiedDiff) as ParseDiffFile[];

  // Extract package.json content from batch result
  const basePackageContent = packageJsonBatch.get(`${base}:package.json`) ?? null;
  const headPackageContent = parsePackageJson(packageJsonBatch.get(`${headRef}:package.json`) ?? null);

  // Build ChangeSet
  return buildChangeSet({
    base,
    head: options.head,
    nameStatusOutput,
    parsedDiffs,
    basePackageJson: parsePackageJson(basePackageContent),
    headPackageJson: headPackageContent,
  });
}

/**
 * Collect all git diff data and build a ChangeSet using mode-based options.
 * Supports caching for improved performance on repeated runs.
 */
async function collectChangeSetByMode(
  options: CollectChangeSetOptionsV2
): Promise<ChangeSet> {
  const cwd = options.cwd ?? process.cwd();
  const includeUntracked = options.includeUntracked ?? (options.mode === "all" || options.mode === "unstaged");
  const useCache = !options.noCache;
  const cache = useCache ? getCache(cwd) : null;

  // Validate git repo
  if (!(await isGitRepo(cwd))) {
    throw new NotAGitRepoError(cwd);
  }

  // Get SHAs for cache key computation
  let baseSha = "";
  let headSha = "";

  // Validate refs only for branch mode
  if (options.mode === "branch") {
    if (!options.base) {
      throw new InvalidRefError("base (required for branch mode)");
    }
    if (!options.head) {
      throw new InvalidRefError("head (required for branch mode)");
    }

    // Get SHAs while validating refs
    const baseRefSha = await getRefSha(options.base, cwd);
    if (baseRefSha === null) {
      throw new InvalidRefError(options.base);
    }
    baseSha = baseRefSha;

    const headRefSha = await getRefSha(options.head, cwd);
    if (headRefSha === null) {
      throw new InvalidRefError(options.head);
    }
    headSha = headRefSha;
  }

  // For non-branch modes that reference HEAD, validate HEAD exists
  if (options.mode === "staged" || options.mode === "all") {
    const headRefSha = await getRefSha("HEAD", cwd);
    if (headRefSha === null) {
      throw new InvalidRefError("HEAD");
    }
    headSha = headRefSha;
  }

  // For unstaged mode, get HEAD SHA for cache key
  if (options.mode === "unstaged") {
    const headRefSha = await getRefSha("HEAD", cwd);
    headSha = headRefSha ?? "";
  }

  // Try cache lookup
  if (cache?.enabled) {
    let cacheKeyHash: string | null = null;

    if (options.mode === "branch") {
      // For branch mode, use base/head SHAs
      const diffKey = cache.buildDiffCacheKeyObject({
        base: options.base!,
        head: options.head!,
        baseSha,
        headSha,
        mode: options.mode,
      });
      const packageJsonHash = computeHash(JSON.stringify({
        base: options.base,
        head: options.head,
      }));
      cacheKeyHash = cache.buildChangeSetCacheKey(computeHash(diffKey), packageJsonHash);
    } else {
      // For non-branch modes, use worktree signature
      const worktreeSignature = await cache.computeWorktreeSignature();
      const diffKey = cache.buildDiffCacheKeyObject({
        base: options.mode === "unstaged" ? "INDEX" : "HEAD",
        head: options.mode === "staged" ? "INDEX" : "WORKING",
        baseSha: headSha, // Use HEAD SHA as base for non-branch
        headSha: worktreeSignature.statusHash,
        mode: options.mode,
        worktreeSignature,
      });
      const packageJsonHash = worktreeSignature.statusHash;
      cacheKeyHash = cache.buildChangeSetCacheKey(computeHash(diffKey), packageJsonHash);
    }

    // Check for cached ChangeSet
    const cachedChangeSet = await cache.getChangeSet(cacheKeyHash);
    if (cachedChangeSet) {
      return cachedChangeSet;
    }
  }

  // Collect data based on mode (cache miss or cache disabled)
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
    case "branch": {
      base = options.base!;
      head = options.head!;
      // Use batch git operation to fetch both package.json files in one call
      const batchResult = await batchGetFileContent(
        [
          { ref: base, path: "package.json" },
          { ref: head, path: "package.json" },
        ],
        cwd
      );
      basePackageJson = parsePackageJson(batchResult.get(`${base}:package.json`) ?? null);
      headPackageJson = parsePackageJson(batchResult.get(`${head}:package.json`) ?? null);
      break;
    }

    case "unstaged":
      base = "INDEX";
      head = "WORKING";
      // For unstaged, the "base" is the index - get from HEAD since that's what's staged
      basePackageJson = await getWorkingPackageJson(cwd); // Index is close to working for most cases
      headPackageJson = await getWorkingPackageJson(cwd);
      break;

    case "staged": {
      base = "HEAD";
      head = "INDEX";
      // Parallelize HEAD fetch and working file read
      const [headContent, workingPkg] = await Promise.all([
        getFileAtRef("HEAD", "package.json", cwd),
        getWorkingPackageJson(cwd),
      ]);
      basePackageJson = parsePackageJson(headContent);
      headPackageJson = workingPkg;
      break;
    }

    case "all": {
      base = "HEAD";
      head = "WORKING";
      // Parallelize HEAD fetch and working file read
      const [headContent, workingPkg] = await Promise.all([
        getFileAtRef("HEAD", "package.json", cwd),
        getWorkingPackageJson(cwd),
      ]);
      basePackageJson = parsePackageJson(headContent);
      headPackageJson = workingPkg;
      break;
    }
  }

  // Build ChangeSet
  const changeSet = buildChangeSet({
    base,
    head,
    nameStatusOutput: finalNameStatus,
    parsedDiffs,
    basePackageJson,
    headPackageJson,
  });

  // Store in cache using same key components as lookup
  if (cache?.enabled) {
    let diffHash: string;
    let packageJsonHash: string;

    if (options.mode === "branch") {
      const diffKey = cache.buildDiffCacheKeyObject({
        base: options.base!,
        head: options.head!,
        baseSha,
        headSha,
        mode: options.mode,
      });
      diffHash = computeHash(diffKey);
      packageJsonHash = computeHash(JSON.stringify({
        base: options.base,
        head: options.head,
      }));
    } else {
      const worktreeSignature = await cache.computeWorktreeSignature();
      const diffKey = cache.buildDiffCacheKeyObject({
        base: options.mode === "unstaged" ? "INDEX" : "HEAD",
        head: options.mode === "staged" ? "INDEX" : "WORKING",
        baseSha: headSha,
        headSha: worktreeSignature.statusHash,
        mode: options.mode,
        worktreeSignature,
      });
      diffHash = computeHash(diffKey);
      packageJsonHash = worktreeSignature.statusHash;
    }

    // Store using same key structure as lookup
    const cacheKey = { diffHash, packageJsonHash };
    await cache.setChangeSet(cacheKey, changeSet);
  }

  return changeSet;
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
