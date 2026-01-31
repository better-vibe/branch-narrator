/**
 * i18n (Internationalization) change detector.
 *
 * Detects changes to translation files, locale configurations, and translation key
 * modifications that could break UI for non-English users.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  I18nChangeFinding,
  Confidence,
} from "../core/types.js";

// i18n file patterns
const I18N_FILE_PATTERNS = [
  /(^|[\/\\])locales[\/\\].+\.(json|yml|yaml)$/, // e.g., locales/en.json, src/locales/en.json
  /(^|[\/\\])i18n[\/\\].+\.(json|ts|js)$/, // e.g., i18n/en.json, src/i18n/config.ts
  /(^|[\/\\])translations[\/\\].+\.(json|yml|yaml)$/, // e.g., translations/en.json
  /(^|[\/\\])lang[\/\\].+\.(json|ts|js)$/, // e.g., lang/en.json
  /(^|[\/\\])messages[\/\\].+\.(json|ts|js)$/, // e.g., messages/en.json
  /\.locale\.(ts|js)$/, // e.g., config.locale.ts
  /(^|\/)locales\.json$/, // e.g., locales.json
  /translation.*\.json$/i, // e.g., translation.en.json
];

// Common i18n library indicators
const I18N_LIBRARIES = [
  "react-i18next",
  "i18next",
  "vue-i18n",
  "svelte-i18n",
  "react-intl",
  "formatjs",
  "lingui",
  "typesafe-i18n",
  "next-intl",
  "next-i18next",
];

/**
 * Check if file is an i18n translation file.
 */
export function isI18nFile(path: string): boolean {
  return I18N_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Extract locale from file path.
 */
function extractLocale(path: string): string {
  // Try to extract locale from directory (e.g., locales/en-US/file.json or locales/en/file.json)
  const matches = path.match(/[\/\\]([a-z]{2}(-[A-Z]{2})?)[\/\\]/);
  if (matches) return matches[1];

  // Try to extract locale from filename with region code (e.g., en-US.json)
  const regionMatch = path.match(/[\/\\]([a-z]{2}-[A-Z]{2})\.json$/);
  if (regionMatch) return regionMatch[1];

  // Try to extract locale from filename with prefix (e.g., translation.en-US.json)
  const prefixedRegionMatch = path.match(/[._]([a-z]{2}-[A-Z]{2})\.json$/);
  if (prefixedRegionMatch) return prefixedRegionMatch[1];

  // Try to extract locale from filename (e.g., en.json)
  const filenameMatch = path.match(/[._]([a-z]{2})\.json$/);
  if (filenameMatch) return filenameMatch[1];

  const langDirMatch = path.match(/[\/\\]([a-z]{2})\.json$/);
  if (langDirMatch) return langDirMatch[1];

  return "unknown";
}

/**
 * Check if project uses i18n libraries.
 */
function hasI18nDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;

  for (const lib of I18N_LIBRARIES) {
    if (deps?.[lib] || devDeps?.[lib]) return true;
  }

  return false;
}

/**
 * Parse translation keys from JSON content.
 */
function parseTranslationKeys(content: string[]): Record<string, string> {
  try {
    const json = JSON.parse(content.join("\n"));
    return flattenKeys(json);
  } catch {
    return {};
  }
}

/**
 * Flatten nested JSON object to dot-notation keys.
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      result[newKey] = value;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, newKey));
    }
  }

  return result;
}

/**
 * Detect interpolation placeholders in translation value.
 */
function hasInterpolation(value: string): boolean {
  // Match common interpolation patterns: {{var}}, {var}, %{var}, {{t('key')}}
  return /\{\{[^}]+\}\}|\{[^}]+\}|%\{[^}]+\}/.test(value);
}

/**
 * Detect key changes between base and head translations.
 */
function detectKeyChanges(
  baseKeys: Record<string, string>,
  headKeys: Record<string, string>
): I18nChangeFinding["keyChanges"] {
  const changes: I18nChangeFinding["keyChanges"] = [];

  const baseKeySet = new Set(Object.keys(baseKeys));
  const headKeySet = new Set(Object.keys(headKeys));

  // Added keys
  for (const key of headKeySet) {
    if (!baseKeySet.has(key)) {
      changes.push({
        key,
        operation: "added",
        hasInterpolation: hasInterpolation(headKeys[key]),
        isBreaking: false,
      });
    }
  }

  // Removed keys (breaking)
  for (const key of baseKeySet) {
    if (!headKeySet.has(key)) {
      changes.push({
        key,
        operation: "removed",
        hasInterpolation: hasInterpolation(baseKeys[key]),
        isBreaking: true,
      });
    }
  }

  // Modified keys
  for (const key of headKeySet) {
    if (baseKeySet.has(key) && baseKeys[key] !== headKeys[key]) {
      const baseHasInterp = hasInterpolation(baseKeys[key]);
      const headHasInterp = hasInterpolation(headKeys[key]);

      changes.push({
        key,
        operation: "modified",
        hasInterpolation: headHasInterp,
        isBreaking: baseHasInterp !== headHasInterp, // Changing interpolation is breaking
      });
    }
  }

  return changes;
}

/**
 * Detect renamed keys (key exists in both but with different names, same value).
 * This is heuristic-based and may not catch all renames.
 */
function detectRenamedKeys(
  baseKeys: Record<string, string>,
  headKeys: Record<string, string>
): I18nChangeFinding["keyChanges"] {
  const changes: I18nChangeFinding["keyChanges"] = [];

  const baseKeySet = new Set(Object.keys(baseKeys));
  const headKeySet = new Set(Object.keys(headKeys));

  // Find removed keys that have matching values in new keys
  for (const baseKey of Object.keys(baseKeys)) {
    if (!headKeySet.has(baseKey)) {
      const baseValue = baseKeys[baseKey];

      // Look for a new key with the same value
      for (const headKey of Object.keys(headKeys)) {
        if (!baseKeySet.has(headKey) && headKeys[headKey] === baseValue) {
          changes.push({
            key: headKey,
            operation: "renamed",
            oldKey: baseKey,
            hasInterpolation: hasInterpolation(baseValue),
            isBreaking: true,
          });
          break;
        }
      }
    }
  }

  return changes;
}

/**
 * Detect namespace changes from file paths.
 */
function detectNamespaceChanges(
  basePath: string,
  headPath: string
): string[] {
  const changes: string[] = [];

  // Check if file moved to different namespace
  const baseNamespace = basePath.match(/[\/\\]([^\/\\]+)[\/\\][a-z]{2}\.json$/)?.[1];
  const headNamespace = headPath.match(/[\/\\]([^\/\\]+)[\/\\][a-z]{2}\.json$/)?.[1];

  if (baseNamespace && headNamespace && baseNamespace !== headNamespace) {
    changes.push(`Namespace changed: ${baseNamespace} → ${headNamespace}`);
  }

  return changes;
}

export const i18nAnalyzer: Analyzer = {
  name: "i18n",
  cache: {
    includeGlobs: [
      "**/locales/**/*.{json,yml,yaml}",
      "**/i18n/**/*.{json,ts,js}",
      "**/translations/**/*.{json,yml,yaml}",
      "**/lang/**/*.{json,ts,js}",
      "**/messages/**/*.{json,ts,js}",
      "**/*.locale.{ts,js}",
      "**/locales.json",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if no i18n dependency
    if (!hasI18nDependency(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isI18nFile(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      // Parse translation keys
      const headKeys = parseTranslationKeys(additions);
      const baseKeys = parseTranslationKeys(deletions);

      // Detect key changes
      const keyChanges = detectKeyChanges(baseKeys, headKeys);
      const renamedKeys = detectRenamedKeys(baseKeys, headKeys);

      // Merge all key changes
      const allKeyChanges = [...keyChanges, ...renamedKeys];

      // If no key changes detected (e.g., formatting changes), skip
      if (allKeyChanges.length === 0 && diff.status !== "added" && diff.status !== "deleted") {
        continue;
      }

      // Detect namespace changes
      const namespaceChanges = detectNamespaceChanges(
        diff.oldPath || diff.path,
        diff.path
      );

      // Extract locale
      const locale = extractLocale(diff.path);

      // Determine if changes are breaking
      const hasBreakingChanges = allKeyChanges.some((c) => c.isBreaking);
      const isBreaking = hasBreakingChanges || diff.status === "deleted";

      // Determine confidence
      let confidence: Confidence = "low";
      if (isBreaking) {
        confidence = "high";
      } else if (keyChanges.some((c) => c.operation === "removed")) {
        confidence = "high";
      } else if (keyChanges.some((c) => c.operation === "modified" && c.isBreaking)) {
        confidence = "high";
      } else if (keyChanges.length > 0) {
        confidence = "medium";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add key change evidence
      for (const change of allKeyChanges.filter((c) => c.isBreaking)) {
        const action = change.operation === "renamed" 
          ? `Renamed: ${change.oldKey} → ${change.key}` 
          : `${change.operation}: ${change.key}`;
        evidence.push(createEvidence(diff.path, action));
      }

      // Add locale info
      evidence.push(createEvidence(diff.path, `Locale: ${locale}`));

      const finding: I18nChangeFinding = {
        type: "i18n-change",
        kind: "i18n-change",
        category: "api",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        locale,
        keyChanges: allKeyChanges.slice(0, 20), // Limit to 20 changes
        namespaceChanges,
        localeAdded: diff.status === "added" ? [locale] : undefined,
        localeRemoved: diff.status === "deleted" ? [locale] : undefined,
        isBreaking,
        tags: isBreaking ? ["breaking"] : keyChanges.length > 10 ? ["many-changes"] : undefined,
        findingId: undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
