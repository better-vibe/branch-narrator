/**
 * Diff parsing utilities.
 */

import type { FileDiff, Hunk } from "../core/types.js";

/**
 * Line with its position in the new file.
 */
export interface LineWithNumber {
  line: string;
  lineNumber: number;
}

/**
 * Get all additions from a FileDiff.
 */
export function getAdditions(diff: FileDiff): string[] {
  return diff.hunks.flatMap((hunk) => hunk.additions);
}

/**
 * Get all additions from a FileDiff with their line numbers in the new file.
 * This is useful for SARIF output and other tools that need precise locations.
 */
export function getAdditionsWithLineNumbers(diff: FileDiff): LineWithNumber[] {
  const result: LineWithNumber[] = [];

  for (const hunk of diff.hunks) {
    let currentLine = hunk.newStart;

    // Parse hunk content to track line numbers accurately
    const lines = hunk.content.split('\n');
    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Skip hunk header
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        // This is an addition
        result.push({
          line: line.slice(1), // Remove leading +
          lineNumber: currentLine,
        });
        currentLine++;
      } else if (!line.startsWith('-')) {
        // Context line or empty - increment line number
        currentLine++;
      }
      // Deletion lines don't increment the new file line number
    }
  }

  return result;
}

/**
 * Get all deletions from a FileDiff.
 */
export function getDeletions(diff: FileDiff): string[] {
  return diff.hunks.flatMap((hunk) => hunk.deletions);
}

/**
 * Get all changes (additions + deletions) from a FileDiff.
 * Optimized to iterate hunks once instead of twice.
 */
export function getAllChanges(diff: FileDiff): string[] {
  const changes: string[] = [];
  for (const hunk of diff.hunks) {
    changes.push(...hunk.additions, ...hunk.deletions);
  }
  return changes;
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

/**
 * Match with its line number in the new file.
 */
export interface MatchWithLineNumber {
  match: RegExpMatchArray;
  lineNumber: number;
  line: string;
}

/**
 * Find all matches of a pattern in additions with line numbers.
 * This is useful for SARIF output and other tools that need precise locations.
 */
export function findAdditionMatchesWithLineNumbers(
  diff: FileDiff,
  pattern: RegExp
): MatchWithLineNumber[] {
  const matches: MatchWithLineNumber[] = [];
  const globalPattern = new RegExp(pattern.source, "g" + pattern.flags.replace("g", ""));

  const additionsWithLines = getAdditionsWithLineNumbers(diff);

  for (const { line, lineNumber } of additionsWithLines) {
    globalPattern.lastIndex = 0;

    let match;
    while ((match = globalPattern.exec(line)) !== null) {
      matches.push({
        match,
        lineNumber,
        line,
      });
    }
  }

  return matches;
}
