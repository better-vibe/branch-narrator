/**
 * Signature computation for cache keys.
 *
 * Provides utilities to compute deterministic signatures for:
 * - File patterns (include/exclude globs)
 * - Worktree state (for non-branch modes)
 * - ChangeSet content
 */

import { execa } from "execa";
import { hashString, hashFilePatterns, computeCacheKey } from "./hash.js";
import { getVersion } from "../core/version.js";
import type { DiffMode } from "../core/types.js";

// ============================================================================
// File Pattern Signatures
// ============================================================================

/**
 * Compute a signature for file filtering patterns.
 */
export function computeFilePatternsSignature(
  includes: string[],
  excludes: string[]
): string {
  return hashFilePatterns(includes, excludes);
}

// ============================================================================
// Worktree Signatures
// ============================================================================

/**
 * Get git status output for worktree signature.
 */
async function getGitStatus(cwd: string): Promise<string> {
  try {
    const result = await execa("git", ["status", "--porcelain", "-z"], { cwd });
    return result.stdout;
  } catch {
    return "";
  }
}

/**
 * Get git write-tree output for index state.
 */
async function getWriteTree(cwd: string): Promise<string> {
  try {
    const result = await execa("git", ["write-tree"], { cwd });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Get HEAD SHA.
 */
async function getHeadSha(cwd: string): Promise<string> {
  try {
    const result = await execa("git", ["rev-parse", "HEAD"], { cwd });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Compute a worktree signature for non-branch modes.
 * Includes hash of git status, index tree SHA, and HEAD SHA.
 */
export async function computeWorktreeSignature(
  cwd: string = process.cwd()
): Promise<string> {
  const [status, writeTree, headSha] = await Promise.all([
    getGitStatus(cwd),
    getWriteTree(cwd),
    getHeadSha(cwd),
  ]);

  return computeCacheKey(
    hashString(status),
    writeTree,
    headSha
  );
}

// ============================================================================
// ChangeSet Cache Key Generation
// ============================================================================

export interface ChangeSetCacheKeyParams {
  mode: DiffMode;
  base?: string;
  head?: string;
  worktreeSignature?: string;
  filePatternsHash: string;
}

/**
 * Resolve a git ref to its SHA.
 */
async function resolveRef(ref: string, cwd: string): Promise<string> {
  try {
    const result = await execa("git", ["rev-parse", "--verify", ref], { cwd });
    return result.stdout.trim();
  } catch {
    // Return ref as-is if resolution fails
    return ref;
  }
}

/**
 * Compute a cache key for a ChangeSet.
 * For branch mode, resolves refs to SHAs to ensure cache invalidation on commits.
 */
export async function computeChangeSetCacheKey(
  params: ChangeSetCacheKeyParams,
  cwd: string = process.cwd()
): Promise<string> {
  const cliVersion = await getVersion();

  const components: string[] = [
    "changeset",
    params.mode,
    cliVersion,
    params.filePatternsHash,
  ];

  if (params.mode === "branch") {
    // Resolve refs to SHAs to invalidate cache when commits change
    const [baseSha, headSha] = await Promise.all([
      params.base ? resolveRef(params.base, cwd) : Promise.resolve(""),
      params.head ? resolveRef(params.head, cwd) : Promise.resolve(""),
    ]);
    components.push(baseSha);
    components.push(headSha);
  } else {
    // For non-branch modes, use worktree signature
    const worktreeSig = params.worktreeSignature || await computeWorktreeSignature(cwd);
    components.push(worktreeSig);
  }

  return computeCacheKey(...components);
}

// ============================================================================
// Analyzer Cache Key Generation
// ============================================================================

export interface AnalyzerCacheKeyParams {
  analyzerName: string;
  profileName?: string;
  /** Hash of relevant files from ChangeSet */
  inputSignature: string;
}

/**
 * Compute a cache key for analyzer findings.
 */
export async function computeAnalyzerCacheKey(
  params: AnalyzerCacheKeyParams
): Promise<string> {
  const cliVersion = await getVersion();

  return computeCacheKey(
    "analyzer",
    params.analyzerName,
    params.profileName || "default",
    params.inputSignature,
    cliVersion
  );
}

/**
 * Compute an input signature for an analyzer based on relevant files.
 * @param relevantDiffs - Array of file paths and their diff content hashes
 */
export function computeAnalyzerInputSignature(
  relevantDiffs: Array<{ path: string; contentHash: string }>
): string {
  // Sort by path for determinism
  const sorted = [...relevantDiffs].sort((a, b) => a.path.localeCompare(b.path));
  const combined = sorted.map((d) => `${d.path}:${d.contentHash}`).join("|");
  return hashString(combined);
}
