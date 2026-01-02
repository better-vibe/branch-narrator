/**
 * Diff parsing utilities.
 */

import type { FileDiff, Hunk } from "../core/types.js";

/**
 * Get all additions from a FileDiff.
 */
export function getAdditions(diff: FileDiff): string[] {
  return diff.hunks.flatMap((hunk) => hunk.additions);
}

/**
 * Get all deletions from a FileDiff.
 */
export function getDeletions(diff: FileDiff): string[] {
  return diff.hunks.flatMap((hunk) => hunk.deletions);
}

/**
 * Get all changes (additions + deletions) from a FileDiff.
 */
export function getAllChanges(diff: FileDiff): string[] {
  return [...getAdditions(diff), ...getDeletions(diff)];
}

/**
 * Get combined content of all hunks.
 */
export function getHunkContent(hunks: Hunk[]): string {
  return hunks.map((h) => [...h.additions, ...h.deletions].join("\n")).join("\n");
}

/**
 * Check if a file path matches a pattern.
 */
export function matchesPattern(path: string, pattern: RegExp): boolean {
  return pattern.test(path);
}

/**
 * Filter diffs by path pattern.
 */
export function filterDiffsByPath(
  diffs: FileDiff[],
  pattern: RegExp
): FileDiff[] {
  return diffs.filter((diff) => matchesPattern(diff.path, pattern));
}

/**
 * Check if any addition line matches a pattern.
 */
export function hasAdditionMatching(diff: FileDiff, pattern: RegExp): boolean {
  return getAdditions(diff).some((line) => pattern.test(line));
}

/**
 * Find all matches of a pattern in additions.
 */
export function findAdditionMatches(
  diff: FileDiff,
  pattern: RegExp
): RegExpMatchArray[] {
  const matches: RegExpMatchArray[] = [];
  // Optimization: Hoist RegExp creation out of the loop
  const globalPattern = new RegExp(pattern.source, "g" + pattern.flags.replace("g", ""));

  for (const line of getAdditions(diff)) {
    // Reset lastIndex for each line since we are reusing the same RegExp instance
    globalPattern.lastIndex = 0;

    let match;
    while ((match = globalPattern.exec(line)) !== null) {
      matches.push(match);
    }
  }
  return matches;
}
