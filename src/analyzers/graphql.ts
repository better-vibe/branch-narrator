/**
 * GraphQL schema change detector.
 *
 * Detects changes to GraphQL schema files (.graphql, .gql) and identifies
 * potentially breaking changes such as removed types, fields, or arguments.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  GraphQLChangeFinding,
  Confidence,
} from "../core/types.js";

// GraphQL schema file patterns
const GRAPHQL_PATTERNS = [
  /\.graphql$/,
  /\.gql$/,
  /schema\.graphqls$/,
  /schema\.sdl$/,
];

/**
 * Check if a file is a GraphQL schema file.
 */
export function isGraphQLSchema(path: string): boolean {
  return GRAPHQL_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Analyze deletions for breaking changes.
 */
function analyzeBreakingChanges(deletions: string[]): string[] {
  const breakingChanges: string[] = [];
  const deletedContent = deletions.join("\n");

  // Check for removed types
  const typeMatches = deletedContent.match(/type\s+(\w+)\s*[{@]/g);
  if (typeMatches) {
    for (const match of typeMatches) {
      const typeName = match.match(/type\s+(\w+)/)?.[1];
      if (typeName) {
        breakingChanges.push(`Removed type: ${typeName}`);
      }
    }
  }

  // Check for removed enums
  const enumMatches = deletedContent.match(/enum\s+(\w+)\s*{/g);
  if (enumMatches) {
    for (const match of enumMatches) {
      const enumName = match.match(/enum\s+(\w+)/)?.[1];
      if (enumName) {
        breakingChanges.push(`Removed enum: ${enumName}`);
      }
    }
  }

  // Check for removed interfaces
  const interfaceMatches = deletedContent.match(/interface\s+(\w+)\s*[{@]/g);
  if (interfaceMatches) {
    for (const match of interfaceMatches) {
      const interfaceName = match.match(/interface\s+(\w+)/)?.[1];
      if (interfaceName) {
        breakingChanges.push(`Removed interface: ${interfaceName}`);
      }
    }
  }

  // Check for removed input types
  const inputMatches = deletedContent.match(/input\s+(\w+)\s*{/g);
  if (inputMatches) {
    for (const match of inputMatches) {
      const inputName = match.match(/input\s+(\w+)/)?.[1];
      if (inputName) {
        breakingChanges.push(`Removed input type: ${inputName}`);
      }
    }
  }

  return breakingChanges;
}

/**
 * Analyze additions for new schema elements.
 */
function analyzeAdditions(additions: string[]): string[] {
  const addedElements: string[] = [];
  const addedContent = additions.join("\n");

  // Check for added types
  const typeMatches = addedContent.match(/type\s+(\w+)\s*[{@]/g);
  if (typeMatches) {
    for (const match of typeMatches) {
      const typeName = match.match(/type\s+(\w+)/)?.[1];
      if (typeName && !["Query", "Mutation", "Subscription"].includes(typeName)) {
        addedElements.push(`Added type: ${typeName}`);
      }
    }
  }

  // Check for added enums
  const enumMatches = addedContent.match(/enum\s+(\w+)\s*{/g);
  if (enumMatches) {
    for (const match of enumMatches) {
      const enumName = match.match(/enum\s+(\w+)/)?.[1];
      if (enumName) {
        addedElements.push(`Added enum: ${enumName}`);
      }
    }
  }

  return addedElements;
}

export const graphqlAnalyzer: Analyzer = {
  name: "graphql",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isGraphQLSchema(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const breakingChanges = analyzeBreakingChanges(deletions);
      const addedElements = analyzeAdditions(additions);

      // Determine if this is a breaking change
      const isBreaking = breakingChanges.length > 0;
      const hasAdditions = addedElements.length > 0;
      const hasDeletions = deletions.length > 0;

      // Create evidence
      const excerpt = isBreaking
        ? extractRepresentativeExcerpt(deletions)
        : extractRepresentativeExcerpt(additions);

      let confidence: Confidence = "medium";
      if (isBreaking) {
        confidence = "high";
      } else if (hasAdditions && !hasDeletions) {
        confidence = "low";
      }

      const finding: GraphQLChangeFinding = {
        type: "graphql-change",
        kind: "graphql-change",
        category: "api",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        isBreaking,
        breakingChanges: breakingChanges.slice(0, 5),
        addedElements: addedElements.slice(0, 5),
      };

      findings.push(finding);
    }

    return findings;
  },
};
