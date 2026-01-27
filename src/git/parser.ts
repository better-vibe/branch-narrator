/**
 * Diff parsing utilities.
 */

import type { FileDiff } from "../core/types.js";

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
