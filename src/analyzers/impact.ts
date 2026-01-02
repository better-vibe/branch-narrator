/**
 * Impact Analyzer.
 * Finds files that import the modified files (blast radius).
 */

import fs from "node:fs";
import path from "node:path";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  ImpactAnalysisFinding,
} from "../core/types.js";

// Files to exclude from impact scanning (both as source and target)
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.d\.ts$/,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /^dist\//,
  /^build\//,
  /^\.git\//,
];

/**
 * List all project files (naive implementation).
 * In a real scenario, we might want to respect .gitignore or use git ls-files.
 * For this local-first tool, we'll do a recursive walk or just rely on a known list if provided.
 * Since we want to be heuristic and fast, let's try to list files from git if possible,
 * or fallback to recursive walk of `src/`.
 */
function getAllProjectFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // Skip exclusions
      if (EXCLUDE_PATTERNS.some(p => p.test(fullPath))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|js|tsx|jsx|mts|mjs|svelte|vue)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  // Focus on src for now as the main code area
  walk("src");
  return files;
}

/**
 * Check if file A imports file B.
 * Heuristic regex matching.
 */
function checkImports(fileContent: string, targetFile: string): boolean {
  // Normalize target file path to be relative and without extension for matching
  // e.g. src/utils/math.ts -> utils/math
  // or ../utils/math

  // We look for the basename without extension primarily, but this is risky for collisions.
  // Better: Look for path ending.

  const ext = path.extname(targetFile);
  const targetBase = path.basename(targetFile, ext); // math

  // Regex to match: from ".../math" or from ".../math.js"
  // This is a loose heuristic.
  // const importRegex = new RegExp(`from\\s+['"](.*/)?${targetBase}(\\.[a-z]+)?['"]`, 'g');

  // More robust: matching strict relative paths is hard without resolving.
  // Let's assume if we find the filename in an import string, it's a hit.
  // It's a "Potential Impact".

  const importPattern = new RegExp(`['"]([^'"]*${targetBase})([^'"]*)['"]`);
  const match = fileContent.match(importPattern);

  if (match) {
    // Verify it looks like an import/require
    const importLine = fileContent.split('\n').find(l => l.includes(match[0]));
    if (importLine && (importLine.includes('import ') || importLine.includes('require(') || importLine.includes('from '))) {
      return true;
    }
  }

  return false;
}

export const impactAnalyzer: Analyzer = {
  name: "impact",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    // We only care about modified/renamed files that are "sources"
    const sourceFiles = changeSet.files.filter(f =>
      (f.status === "modified" || f.status === "renamed") &&
      !EXCLUDE_PATTERNS.some(p => p.test(f.path))
    );

    if (sourceFiles.length === 0) return [];

    // Get all files to scan
    // Performance: We scan all files for every source file. O(N*M).
    const projectFiles = getAllProjectFiles();

    for (const source of sourceFiles) {
      const dependents: string[] = [];

      for (const file of projectFiles) {
        // Don't check self
        if (file === source.path) continue;

        try {
          const content = fs.readFileSync(file, 'utf-8');
          if (checkImports(content, source.path)) {
            dependents.push(file);
          }
        } catch (e) {
          // Ignore read errors
        }
      }

      if (dependents.length > 0) {
        findings.push({
          type: "impact-analysis",
          kind: "impact-analysis",
          category: "tests", // broadly related to testing/qa
          confidence: "medium", // heuristic
          evidence: [
            createEvidence(source.path, `Modified file ${source.path} is imported by ${dependents.length} other file(s).`),
            ...dependents.slice(0, 5).map(d => createEvidence(d, `Depends on ${source.path}`))
          ],
          sourceFile: source.path,
          affectedFiles: dependents,
          blastRadius: dependents.length > 10 ? "high" : dependents.length > 3 ? "medium" : "low",
          tags: ["impact", "dependency"]
        } as ImpactAnalysisFinding);
      }
    }

    return findings;
  },
};
