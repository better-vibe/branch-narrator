/**
 * Sorting utilities for deterministic output ordering.
 */

import type { Finding, RiskFlag, Evidence, RiskFlagEvidence } from "./types.js";

/**
 * Normalize path for consistent sorting across platforms.
 * Converts backslashes to forward slashes and normalizes case.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/**
 * Compare two paths lexicographically.
 */
export function comparePaths(a: string, b: string): number {
  const normA = normalizePath(a);
  const normB = normalizePath(b);
  return normA.localeCompare(normB);
}

/**
 * Sort risk flags deterministically.
 * Order: category asc, effectiveScore desc, id asc
 */
export function sortRiskFlags(flags: RiskFlag[]): RiskFlag[] {
  return [...flags].sort((a, b) => {
    // Category ascending
    const catCompare = a.category.localeCompare(b.category);
    if (catCompare !== 0) return catCompare;

    // Effective score descending
    const scoreCompare = b.effectiveScore - a.effectiveScore;
    if (scoreCompare !== 0) return scoreCompare;

    // ID ascending
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sort findings deterministically.
 * Order: type asc, file asc (if available), location asc
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    // Type ascending
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;

    // Get first file from evidence (if available)
    const getFirstFile = (f: Finding): string => {
      if (f.evidence && f.evidence.length > 0) {
        return f.evidence[0]!.file;
      }
      return "";
    };

    const fileA = getFirstFile(a);
    const fileB = getFirstFile(b);
    
    if (fileA && fileB) {
      const fileCompare = comparePaths(fileA, fileB);
      if (fileCompare !== 0) return fileCompare;
    }

    // Get first line number from evidence (if available)
    const getFirstLine = (f: Finding): number => {
      if (f.evidence && f.evidence.length > 0) {
        const ev = f.evidence[0]!;
        if (ev.line !== undefined) return ev.line;
        if (ev.hunk?.newStart !== undefined) return ev.hunk.newStart;
      }
      return 0;
    };

    const lineA = getFirstLine(a);
    const lineB = getFirstLine(b);
    
    return lineA - lineB;
  });
}

/**
 * Sort evidence deterministically.
 * Order: file asc, preserve line order within each file
 */
export function sortEvidence(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => {
    // File ascending
    const fileCompare = comparePaths(a.file, b.file);
    if (fileCompare !== 0) return fileCompare;

    // Line number ascending (if available)
    const lineA = a.line ?? (a.hunk?.newStart ?? 0);
    const lineB = b.line ?? (b.hunk?.newStart ?? 0);
    
    return lineA - lineB;
  });
}

/**
 * Sort risk flag evidence deterministically.
 * Order: file asc, preserve line order within each file
 */
export function sortRiskFlagEvidence(evidence: RiskFlagEvidence[]): RiskFlagEvidence[] {
  return [...evidence].sort((a, b) => {
    // File ascending
    const fileCompare = comparePaths(a.file, b.file);
    if (fileCompare !== 0) return fileCompare;

    // Hunk order (if available) - extract line numbers from hunk string
    if (a.hunk && b.hunk) {
      const extractLineNum = (hunk: string): number => {
        const match = hunk.match(/\+(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      return extractLineNum(a.hunk) - extractLineNum(b.hunk);
    }
    
    return 0;
  });
}

/**
 * Sort file paths deterministically.
 */
export function sortFilePaths(paths: string[]): string[] {
  return [...paths].sort(comparePaths);
}

/**
 * Create a sorted object from key-value pairs.
 * Ensures object keys are in a stable order.
 */
export function createSortedObject<T>(
  entries: Array<[string, T]>
): Record<string, T> {
  const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
  const result: Record<string, T> = {};
  for (const [key, value] of sorted) {
    result[key] = value;
  }
  return result;
}
