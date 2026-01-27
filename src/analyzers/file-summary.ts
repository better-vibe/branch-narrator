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
 * Represents a detected change pattern with priority for ranking.
 */
interface DetectedChange {
  description: string;
  priority: number; // Higher = more significant
}

/**
 * Detect all changes in added/removed lines and return prioritized list.
 */
function detectChanges(
  addedLines: string,
  removedLines: string,
  status: string
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  // --- Function declarations (priority 100) ---
  // Standard function declarations
  const funcAddMatches = addedLines.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
  for (const match of funcAddMatches) {
    const name = match[1];
    const wasRemoved = removedLines.includes(`function ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified function: ${name}()`, priority: 100 });
    } else if (status === "modified") {
      changes.push({ description: `Added function: ${name}()`, priority: 100 });
    } else {
      changes.push({ description: `Added function: ${name}()`, priority: 100 });
    }
  }

  // Arrow function exports: export const foo = () => {} or export const foo = async () => {}
  const arrowFuncMatches = addedLines.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g);
  for (const match of arrowFuncMatches) {
    const name = match[1];
    const wasRemoved = removedLines.includes(`const ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified: ${name}()`, priority: 95 });
    } else {
      changes.push({ description: `Added: ${name}()`, priority: 95 });
    }
  }

  // --- Class declarations (priority 90) ---
  const classMatches = addedLines.matchAll(/(?:export\s+)?class\s+(\w+)/g);
  for (const match of classMatches) {
    const name = match[1];
    const wasRemoved = removedLines.includes(`class ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified class: ${name}`, priority: 90 });
    } else {
      changes.push({ description: `Added class: ${name}`, priority: 90 });
    }
  }

  // --- Interface/type declarations (priority 80) ---
  const interfaceMatches = addedLines.matchAll(/(?:export\s+)?interface\s+(\w+)/g);
  for (const match of interfaceMatches) {
    const name = match[1];
    const wasRemoved = removedLines.includes(`interface ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified interface: ${name}`, priority: 80 });
    } else {
      changes.push({ description: `Added interface: ${name}`, priority: 80 });
    }
  }

  const typeMatches = addedLines.matchAll(/(?:export\s+)?type\s+(\w+)\s*=/g);
  for (const match of typeMatches) {
    const name = match[1];
    const wasRemoved = removedLines.includes(`type ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified type: ${name}`, priority: 80 });
    } else {
      changes.push({ description: `Added type: ${name}`, priority: 80 });
    }
  }

  // --- Enum declarations (priority 75) ---
  const enumMatches = addedLines.matchAll(/(?:export\s+)?enum\s+(\w+)/g);
  for (const match of enumMatches) {
    const name = match[1];
    const wasRemoved = removedLines.includes(`enum ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified enum: ${name}`, priority: 75 });
    } else {
      changes.push({ description: `Added enum: ${name}`, priority: 75 });
    }
  }

  // --- Const exports (priority 70) ---
  // Match exported constants that are NOT arrow functions (already handled above)
  const constMatches = addedLines.matchAll(/export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=/g);
  for (const match of constMatches) {
    const name = match[1];
    // Skip if already detected as arrow function
    const isArrowFunc = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`).test(addedLines);
    if (isArrowFunc) continue;
    
    const wasRemoved = removedLines.includes(`const ${name}`);
    if (wasRemoved) {
      changes.push({ description: `Modified const: ${name}`, priority: 70 });
    } else {
      changes.push({ description: `Added const: ${name}`, priority: 70 });
    }
  }

  // --- Re-exports (priority 60) ---
  // export * from "./module"
  const starReexportMatch = addedLines.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/);
  if (starReexportMatch) {
    changes.push({ description: `Re-exports from: ${starReexportMatch[1]}`, priority: 60 });
  }

  // export { x, y } from "./module"
  const namedReexportMatch = addedLines.match(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
  if (namedReexportMatch) {
    const symbols = namedReexportMatch[1].split(",").map(s => s.trim().split(" ")[0]).slice(0, 3);
    const suffix = namedReexportMatch[1].split(",").length > 3 ? " ..." : "";
    changes.push({ description: `Re-exports: ${symbols.join(", ")}${suffix}`, priority: 60 });
  }

  // --- Object method changes (priority 65) ---
  // Detect method definitions in objects: { methodName() { } } or { methodName: function() { } }
  const methodMatches = addedLines.matchAll(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm);
  for (const match of methodMatches) {
    const name = match[1];
    // Skip common non-method patterns
    if (["if", "for", "while", "switch", "catch", "function"].includes(name)) continue;
    const wasRemoved = new RegExp(`\\b${name}\\s*\\(`).test(removedLines);
    if (wasRemoved) {
      changes.push({ description: `Modified method: ${name}()`, priority: 65 });
    }
    // Only report new methods if the file is new
    else if (status === "added") {
      changes.push({ description: `Added method: ${name}()`, priority: 65 });
    }
  }

  // --- Import changes (priority 40) ---
  const importMatches = addedLines.matchAll(/^import\s+(?:\{[^}]+\}|[^{}\s]+)\s+from\s+['"]([^'"]+)['"]/gm);
  const newImports: string[] = [];
  for (const match of importMatches) {
    const module = match[1];
    // Only report if not in removed lines (actually new)
    if (!removedLines.includes(module)) {
      newImports.push(module);
    }
  }
  if (newImports.length > 0) {
    const displayImports = newImports.slice(0, 2).map(m => m.split("/").pop() || m);
    const suffix = newImports.length > 2 ? ` (+${newImports.length - 2} more)` : "";
    changes.push({ description: `New imports: ${displayImports.join(", ")}${suffix}`, priority: 40 });
  }

  // --- Switch case changes (priority 50) ---
  const caseMatches = addedLines.matchAll(/case\s+['"]?([^'":\s]+)['"]?\s*:/g);
  const newCases: string[] = [];
  for (const match of caseMatches) {
    const caseName = match[1];
    if (!removedLines.includes(`case ${caseName}`) && !removedLines.includes(`case "${caseName}"`) && !removedLines.includes(`case '${caseName}'`)) {
      newCases.push(caseName);
    }
  }
  if (newCases.length > 0) {
    const displayCases = newCases.slice(0, 2);
    const suffix = newCases.length > 2 ? ` (+${newCases.length - 2} more)` : "";
    changes.push({ description: `Added cases: ${displayCases.join(", ")}${suffix}`, priority: 50 });
  }

  // --- CLI option changes (priority 85) ---
  // Detect .option() calls in CLI files
  const optionMatches = addedLines.matchAll(/\.option\s*\(\s*['"]([^'"]+)['"]/g);
  const newOptions: string[] = [];
  for (const match of optionMatches) {
    const optionName = match[1];
    if (!removedLines.includes(optionName)) {
      newOptions.push(optionName);
    }
  }
  if (newOptions.length > 0) {
    const displayOptions = newOptions.slice(0, 2);
    const suffix = newOptions.length > 2 ? ` (+${newOptions.length - 2} more)` : "";
    changes.push({ description: `Added CLI options: ${displayOptions.join(", ")}${suffix}`, priority: 85 });
  }

  // --- React component changes (priority 70) ---
  // Detect JSX elements being added
  if (/<[A-Z]\w+/.test(addedLines) && (addedLines.includes("return") || addedLines.includes("=>"))) {
    changes.push({ description: "Component JSX updated", priority: 30 });
  }

  return changes;
}

/**
 * Generate a heuristic-based description of what changed in a file.
 * Analyzes diff hunks to identify patterns like new exports, function changes, etc.
 */
function describeChange(diff: FileDiff): string | null {
  // Collect all added lines from hunks
  const addedLines = diff.hunks.flatMap(h => h.additions).join("\n");
  const removedLines = diff.hunks.flatMap(h => h.deletions).join("\n");

  // --- Path-based detections (highest priority) ---
  
  // Detect new CLI command module
  if (diff.path.startsWith("src/commands/") && diff.status === "added") {
    if (diff.path.endsWith("index.ts")) {
      return "New command module";
    }
    return "New command helper";
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
  
  // Detect config file changes
  const isConfigFile = diff.path.includes("config") || 
    diff.path.endsWith(".json") || 
    diff.path.endsWith(".yaml") ||
    diff.path.endsWith(".yml") ||
    diff.path.endsWith(".toml") ||
    diff.path.includes(".env");
  if (isConfigFile) {
    if (diff.status === "added") {
      return "New configuration";
    }
    return "Configuration update";
  }

  // --- Content-based detections ---
  const changes = detectChanges(addedLines, removedLines, diff.status);
  
  if (changes.length === 0) {
    return null;
  }

  // Sort by priority (highest first) and take the most significant
  changes.sort((a, b) => b.priority - a.priority);
  
  // Deduplicate by description
  const seen = new Set<string>();
  const unique = changes.filter(c => {
    if (seen.has(c.description)) return false;
    seen.add(c.description);
    return true;
  });

  const primary = unique[0];
  
  // If there are multiple significant changes, append count
  if (unique.length > 1) {
    return `${primary.description} (+${unique.length - 1} more)`;
  }
  
  return primary.description;
}

export const fileSummaryAnalyzer: Analyzer = {
  name: "file-summary",
  cache: {},

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

