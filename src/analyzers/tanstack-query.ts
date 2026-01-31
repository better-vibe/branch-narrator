/**
 * TanStack Query (React Query) change detector.
 *
 * Detects changes to TanStack Query hooks (useQuery, useMutation, useInfiniteQuery)
 * that could cause cache invalidation or behavioral changes.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TanStackQueryFinding,
  Confidence,
} from "../core/types.js";

// TanStack Query hook patterns to detect
const QUERY_HOOKS = ["useQuery", "useMutation", "useInfiniteQuery"];

// Cache-affecting options
const CACHE_OPTIONS = [
  "staleTime",
  "cacheTime",
  "gcTime",
  "retry",
  "retryDelay",
  "refetchInterval",
  "refetchOnWindowFocus",
  "refetchOnMount",
  "refetchOnReconnect",
];

/**
 * Check if the project uses TanStack Query based on package.json dependencies.
 */
function hasTanStackQueryDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(
    deps?.["@tanstack/react-query"] ||
    devDeps?.["@tanstack/react-query"] ||
    deps?.["react-query"] ||
    devDeps?.["react-query"]
  );
}

/**
 * Extract query key from useQuery arguments.
 * Query keys are the first argument: useQuery(['todos', id], ...)
 */
function extractQueryKey(content: string): string[] | undefined {
  // Match useQuery(['key1', 'key2', ...], ...)
  const match = content.match(/useQuery\s*\(\s*\[\s*([^\]]+)\s*\]/);
  if (match && match[1]) {
    // Extract individual key parts
    const keys = match[1]
      .split(",")
      .map((k) => k.trim().replace(/["']/g, ""))
      .filter((k) => k.length > 0);
    return keys.length > 0 ? keys : undefined;
  }
  return undefined;
}

/**
 * Detect query hook calls in content.
 */
function detectQueryHooks(content: string[]): Array<{
  name: string;
  type: "query" | "mutation" | "infinite";
  queryKey?: string[];
}> {
  const hooks: Array<{
    name: string;
    type: "query" | "mutation" | "infinite";
    queryKey?: string[];
  }> = [];

  const fullContent = content.join("\n");

  for (const hook of QUERY_HOOKS) {
    // Match hook calls: useQuery(...), useMutation(...), useInfiniteQuery(...)
    const regex = new RegExp(`\\b${hook}\\s*\\(`, "g");
    let match;
    while ((match = regex.exec(fullContent)) !== null) {
      const hookType: "query" | "mutation" | "infinite" =
        hook === "useMutation" ? "mutation" : hook === "useInfiniteQuery" ? "infinite" : "query";

      // For useQuery, try to extract the query key
      let queryKey: string[] | undefined;
      if (hook === "useQuery") {
        // Get content after the match to find the query key
        const afterMatch = fullContent.slice(match.index, match.index + 200);
        queryKey = extractQueryKey(afterMatch);
      }

      hooks.push({
        name: `${hook}_${match.index}`,
        type: hookType,
        queryKey,
      });
    }
  }

  return hooks;
}

/**
 * Detect cache-related option changes.
 */
function detectCacheOptionChanges(additions: string[], deletions: string[]): string[] {
  const changes: string[] = [];
  const addedContent = additions.join("\n");
  const deletedContent = deletions.join("\n");

  for (const option of CACHE_OPTIONS) {
    const added = new RegExp(`\\b${option}\\s*:`).test(addedContent);
    const deleted = new RegExp(`\\b${option}\\s*:`).test(deletedContent);

    if (added && !deleted) {
      changes.push(`Added ${option}`);
    } else if (!added && deleted) {
      changes.push(`Removed ${option}`);
    } else if (added && deleted) {
      changes.push(`Modified ${option}`);
    }
  }

  return changes;
}

/**
 * Check if file is a code file that might contain TanStack Query hooks.
 */
function isCodeFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(path);
}

export const tanstackQueryAnalyzer: Analyzer = {
  name: "tanstack-query",
  cache: {
    includeGlobs: ["**/*.{ts,tsx,js,jsx}"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use TanStack Query
    if (!hasTanStackQueryDependency(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      // Only analyze code files
      if (!isCodeFile(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      // Detect query hooks in additions and deletions
      const addedHooks = detectQueryHooks(additions);
      const removedHooks = detectQueryHooks(deletions);

      // If no query hooks detected, skip this file
      if (addedHooks.length === 0 && removedHooks.length === 0) {
        continue;
      }

      // Build query changes list
      const queryChanges: TanStackQueryFinding["queryChanges"] = [];

      // Added hooks
      for (const hook of addedHooks) {
        queryChanges.push({
          name: hook.name,
          type: hook.type,
          operation: "added",
          queryKey: hook.queryKey,
          isBreaking: false,
        });
      }

      // Removed hooks
      for (const hook of removedHooks) {
        queryChanges.push({
          name: hook.name,
          type: hook.type,
          operation: "removed",
          queryKey: hook.queryKey,
          isBreaking: true,
          reason: "Query/mutation hook removed",
        });
      }

      // Detect cache option changes
      const cacheChanges = detectCacheOptionChanges(additions, deletions);

      // Determine if any changes are breaking
      const hasBreakingChanges = queryChanges.some((c) => c.isBreaking);
      const hasCacheChanges = cacheChanges.length > 0;

      let confidence: Confidence = "low";
      if (hasBreakingChanges) {
        confidence = "high";
      } else if (hasCacheChanges || addedHooks.length > 0) {
        confidence = "medium";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add cache change evidence
      for (const change of cacheChanges) {
        evidence.push(createEvidence(diff.path, change));
      }

      const finding: TanStackQueryFinding = {
        type: "tanstack-query",
        kind: "tanstack-query",
        category: "api",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        queryChanges,
        tags: hasBreakingChanges ? ["breaking"] : hasCacheChanges ? ["cache-affecting"] : undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
