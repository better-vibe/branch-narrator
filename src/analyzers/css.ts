/**
 * CSS Modules and styling change detector.
 *
 * Detects changes to CSS Modules, styled-components, and theme files
 * that could affect UI layouts or component styling.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  CSSChangeFinding,
  Confidence,
} from "../core/types.js";

// CSS file patterns
const CSS_MODULE_PATTERNS = [
  /\.module\.(css|scss|sass|less)$/,
  /\.styles?\.(css|scss|sass|less)$/,
  /\.styled\.(ts|tsx|js|jsx)$/,
];

const CSS_THEME_PATTERNS = [
  /theme\.(ts|js)$/,
  /colors\.(ts|js)$/,
  /tokens\.(ts|js)$/,
  /[\/\\]theme[\/\\].*\.(ts|js|json)$/,
  /design-tokens\.(ts|js|json)$/,
];

const CSS_GLOBAL_PATTERNS = [
  /global\.(css|scss|sass|less)$/,
  /reset\.(css|scss|sass|less)$/,
  /index\.(css|scss|sass|less)$/,
];

// CSS properties that are commonly breaking when changed
const BREAKING_CSS_PROPERTIES = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "top",
  "left",
  "right",
  "bottom",
  "z-index",
  "overflow",
  "float",
  "clear",
];

/**
 * Check if file is a CSS Module file.
 */
export function isCSSModuleFile(path: string): boolean {
  return CSS_MODULE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if file is a theme file.
 */
export function isCSSThemeFile(path: string): boolean {
  return CSS_THEME_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if file is a global CSS file.
 */
export function isCSSGlobalFile(path: string): boolean {
  return CSS_GLOBAL_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Determine CSS file type.
 */
function getCSSFileType(path: string): CSSChangeFinding["fileType"] {
  if (isCSSThemeFile(path)) return "theme";
  if (isCSSGlobalFile(path)) return "global";
  if (path.includes("styled")) return "styled-component";
  return "css-module";
}

/**
 * Parse CSS classes and their properties from CSS content.
 * Returns a map of class names to property maps (property name -> value).
 */
function parseCSSClasses(content: string[]): Map<string, Map<string, string>> {
  const classes = new Map<string, Map<string, string>>();
  const fullContent = content.join("\n");

  // Match CSS class definitions: .className { ... }
  const classRegex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{([^}]*)\}/g;
  let match;

  while ((match = classRegex.exec(fullContent)) !== null) {
    const className = match[1];
    const propertiesBlock = match[2];

    // Extract property names and values: property-name: value;
    const properties = new Map<string, string>();
    const propRegex = /([a-z-]+)\s*:\s*([^;]+)/g;
    let propMatch;

    while ((propMatch = propRegex.exec(propertiesBlock)) !== null) {
      const propName = propMatch[1].trim();
      const propValue = propMatch[2].trim();
      properties.set(propName, propValue);
    }

    classes.set(className, properties);
  }

  return classes;
}

/**
 * Parse styled-components from TypeScript/JavaScript content.
 * Returns a map of component names to property maps (property name -> value).
 */
function parseStyledComponents(content: string[]): Map<string, Map<string, string>> {
  const components = new Map<string, Map<string, string>>();
  const fullContent = content.join("\n");

  // Match styled component definitions: const Component = styled.div`...`
  const styledRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*styled(?:\.\w+|\([^(]+\))?\s*`([^`]+)`/g;
  let match;

  while ((match = styledRegex.exec(fullContent)) !== null) {
    const componentName = match[1];
    const cssContent = match[2];

    // Extract property names and values: property-name: value;
    const properties = new Map<string, string>();
    const propRegex = /([a-z-]+)\s*:\s*([^;]+)/g;
    let propMatch;

    while ((propMatch = propRegex.exec(cssContent)) !== null) {
      const propName = propMatch[1].trim();
      const propValue = propMatch[2].trim();
      properties.set(propName, propValue);
    }

    components.set(componentName, properties);
  }

  return components;
}

/**
 * Parse theme tokens from theme file content.
 */
function parseThemeTokens(content: string[]): Map<string, string> {
  const tokens = new Map<string, string>();
  const fullContent = content.join("\n");

  // Match color/token definitions: primary: '#fff' or primary: "#fff"
  const tokenRegex = /(\w+):\s*["']([^"']+)["']/g;
  let match;

  while ((match = tokenRegex.exec(fullContent)) !== null) {
    tokens.set(match[1], match[2]);
  }

  // Also match CSS variable style: --primary: #fff;
  const cssVarRegex = /(--[\w-]+):\s*([^;]+);/g;
  while ((match = cssVarRegex.exec(fullContent)) !== null) {
    tokens.set(match[1], match[2].trim());
  }

  return tokens;
}

/**
 * Detect class changes between base and head.
 * Compares both property names and their values.
 */
function detectClassChanges(
  baseClasses: Map<string, Map<string, string>>,
  headClasses: Map<string, Map<string, string>>
): CSSChangeFinding["classChanges"] {
  const changes: CSSChangeFinding["classChanges"] = [];

  // Added classes
  for (const [className, properties] of headClasses) {
    if (!baseClasses.has(className)) {
      changes.push({
        className,
        operation: "added",
        propertiesChanged: Array.from(properties.keys()),
        isBreaking: false,
      });
    }
  }

  // Removed classes (breaking for CSS Modules)
  for (const [className, properties] of baseClasses) {
    if (!headClasses.has(className)) {
      changes.push({
        className,
        operation: "removed",
        propertiesChanged: Array.from(properties.keys()),
        isBreaking: true,
      });
    }
  }

  // Modified classes
  for (const [className, headProps] of headClasses) {
    if (baseClasses.has(className)) {
      const baseProps = baseClasses.get(className)!;

      // Check for property changes
      const changedProps: string[] = [];
      let hasBreakingPropChange = false;

      // Check removed properties
      for (const [propName, _propValue] of baseProps) {
        if (!headProps.has(propName)) {
          changedProps.push(`-${propName}`);
        }
      }

      // Check added properties
      for (const [propName, _propValue] of headProps) {
        if (!baseProps.has(propName)) {
          changedProps.push(`+${propName}`);
          if (BREAKING_CSS_PROPERTIES.includes(propName)) {
            hasBreakingPropChange = true;
          }
        }
      }

      // Check modified property values
      for (const [propName, headValue] of headProps) {
        if (baseProps.has(propName)) {
          const baseValue = baseProps.get(propName)!;
          if (baseValue !== headValue) {
            // Property value changed
            changedProps.push(`${propName}: ${baseValue} → ${headValue}`);
            if (BREAKING_CSS_PROPERTIES.includes(propName)) {
              hasBreakingPropChange = true;
            }
          }
        }
      }

      if (changedProps.length > 0) {
        changes.push({
          className,
          operation: "modified",
          propertiesChanged: changedProps,
          isBreaking: hasBreakingPropChange,
        });
      }
    }
  }

  return changes;
}

/**
 * Detect theme token changes.
 */
function detectThemeChanges(
  baseTokens: Map<string, string>,
  headTokens: Map<string, string>
): string[] {
  const changes: string[] = [];

  for (const [token, value] of headTokens) {
    if (baseTokens.has(token)) {
      const oldValue = baseTokens.get(token)!;
      if (oldValue !== value) {
        changes.push(`${token}: ${oldValue} → ${value}`);
      }
    } else {
      changes.push(`Added token: ${token}`);
    }
  }

  for (const [token, value] of baseTokens) {
    if (!headTokens.has(token)) {
      changes.push(`Removed token: ${token} (${value})`);
    }
  }

  return changes;
}

export const cssAnalyzer: Analyzer = {
  name: "css",
  cache: {
    includeGlobs: [
      "**/*.module.{css,scss,sass,less}",
      "**/*.styled.{ts,tsx}",
      "**/theme.{ts,js}",
      "**/theme/**/*.{ts,js,json}",
      "**/design-tokens.{ts,js,json}",
      "**/global.{css,scss,sass,less}",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      const fileType = getCSSFileType(diff.path);

      if (!isCSSModuleFile(diff.path) && !isCSSThemeFile(diff.path) && !isCSSGlobalFile(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      let classChanges: CSSChangeFinding["classChanges"] = [];
      let themeChanges: string[] = [];

      if (fileType === "styled-component") {
        // Parse styled-components
        const baseComponents = parseStyledComponents(deletions);
        const headComponents = parseStyledComponents(additions);
        classChanges = detectClassChanges(baseComponents, headComponents);
      } else if (fileType === "theme") {
        // Parse theme tokens
        const baseTokens = parseThemeTokens(deletions);
        const headTokens = parseThemeTokens(additions);
        themeChanges = detectThemeChanges(baseTokens, headTokens);
      } else {
        // Parse regular CSS
        const baseClasses = parseCSSClasses(deletions);
        const headClasses = parseCSSClasses(additions);
        classChanges = detectClassChanges(baseClasses, headClasses);
      }

      // Skip if no meaningful changes
      if (classChanges.length === 0 && themeChanges.length === 0) {
        continue;
      }

      // Determine breaking changes
      const hasBreakingClassChange = classChanges.some((c) => c.isBreaking);
      const hasThemeRemoval = themeChanges.some((t) => t.includes("Removed"));
      const isBreaking = hasBreakingClassChange || hasThemeRemoval || diff.status === "deleted";

      // Build breaking reasons
      const breakingReasons: string[] = [];
      if (hasThemeRemoval) {
        breakingReasons.push("Theme tokens removed (may break component styling)");
      }
      if (hasBreakingClassChange) {
        breakingReasons.push("Breaking layout/styling properties modified");
      }

      // Determine confidence
      let confidence: Confidence = "low";
      if (isBreaking) {
        confidence = "high";
      } else if (classChanges.length > 0 || themeChanges.length > 0) {
        confidence = "medium";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add class change evidence
      for (const change of classChanges.filter((c) => c.isBreaking)) {
        evidence.push(createEvidence(diff.path, `${change.operation}: .${change.className}`));
      }

      // Add theme change evidence
      for (const change of themeChanges.filter((t) => t.includes("Removed"))) {
        evidence.push(createEvidence(diff.path, change));
      }

      const finding: CSSChangeFinding = {
        type: "css-change",
        kind: "css-change",
        category: "config_env",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        fileType,
        classChanges: classChanges.slice(0, 10), // Limit to 10 changes
        themeChanges: themeChanges.slice(0, 10),
        isBreaking,
        breakingReasons,
        tags: isBreaking ? ["breaking"] : undefined,
        findingId: undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
