/**
 * File summary analyzer - lists added/modified/deleted/renamed paths.
 */

import { shouldExcludeFile } from "../core/filters.js";
import type {
  Analyzer,
  ChangeSet,
  FileDiff,
  FileSummaryFinding,
  Finding,
} from "../core/types.js";

/**
 * Generate a heuristic-based description of what changed in a file.
 * Analyzes diff hunks to identify patterns like new exports, function changes, etc.
 */
function describeChange(diff: FileDiff): string | null {
  // Collect all added lines from hunks
  const addedLines = diff.hunks.flatMap(h => h.additions).join("\n");
  const removedLines = diff.hunks.flatMap(h => h.deletions).join("\n");
  
  // Detect new CLI command module
  if (diff.path.startsWith("src/commands/") && diff.status === "added") {
    // Check if it's an index file (main command entry)
    if (diff.path.endsWith("index.ts")) {
      return "New command module";
    }
    return "New command helper";
  }
  
  // Detect new exports in added content
  const exportMatch = addedLines.match(/export\s+(const|function|class|interface|type)\s+(\w+)/);
  if (exportMatch && diff.status === "added") {
    return `Added export: ${exportMatch[2]}`;
  }
  
  // Detect function modifications
  const funcAddMatch = addedLines.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
  const funcRemoveMatch = removedLines.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
  if (funcAddMatch && funcRemoveMatch && funcAddMatch[1] === funcRemoveMatch[1]) {
    return `Modified function: ${funcAddMatch[1]}()`;
  }
  if (funcAddMatch && diff.status === "modified") {
    // Check if this function was added (not in removed lines)
    if (!removedLines.includes(`function ${funcAddMatch[1]}`)) {
      return `Added function: ${funcAddMatch[1]}()`;
    }
    return `Modified: ${funcAddMatch[1]}()`;
  }
  
  // Detect interface/type changes
  const typeMatch = addedLines.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
  if (typeMatch) {
    if (diff.status === "added") {
      return `Added type: ${typeMatch[1]}`;
    }
    return `Modified type: ${typeMatch[1]}`;
  }
  
  // Detect new test files
  if (/\.test\.[jt]sx?$/.test(diff.path) || /\.spec\.[jt]sx?$/.test(diff.path)) {
    if (diff.status === "added") {
      return "New test file";
    }
    return "Updated tests";
  }
  
  // Detect documentation changes
  if (diff.path.endsWith(".md") || diff.path.startsWith("docs/")) {
    if (diff.status === "added") {
      return "New documentation";
    }
    return "Documentation update";
  }
  
  // Detect config changes
  if (diff.path.includes("config") || diff.path.endsWith(".json") || diff.path.endsWith(".yaml")) {
    return "Configuration update";
  }
  
  return null;
}

export const fileSummaryAnalyzer: Analyzer = {
  name: "file-summary",

  analyze(changeSet: ChangeSet): Finding[] {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const renamed: Array<{ from: string; to: string }> = [];
    const changeDescriptions: Array<{ file: string; description: string }> = [];

    for (const file of changeSet.files) {
      // Skip build artifacts and generated files
      if (shouldExcludeFile(file.path)) {
        continue;
      }

      switch (file.status) {
        case "added":
          added.push(file.path);
          break;
        case "modified":
          modified.push(file.path);
          break;
        case "deleted":
          deleted.push(file.path);
          break;
        case "renamed":
          renamed.push({
            from: file.oldPath ?? file.path,
            to: file.path,
          });
          break;
      }
    }
    
    // Generate change descriptions from diffs
    for (const diff of changeSet.diffs) {
      if (shouldExcludeFile(diff.path)) continue;
      
      const description = describeChange(diff);
      if (description) {
        changeDescriptions.push({ file: diff.path, description });
      }
    }

    // Only emit if there are changes
    if (
      added.length === 0 &&
      modified.length === 0 &&
      deleted.length === 0 &&
      renamed.length === 0
    ) {
      return [];
    }

    const finding: FileSummaryFinding = {
      type: "file-summary",
      kind: "file-summary",
      category: "unknown",
      confidence: "high",
      evidence: [],
      added,
      modified,
      deleted,
      renamed,
      changeDescriptions: changeDescriptions.length > 0 ? changeDescriptions : undefined,
    };

    return [finding];
  },
};

