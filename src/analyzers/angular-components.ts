/**
 * Angular component, module, and service detector.
 * Detects changes to Angular components, modules, directives, pipes, and services.
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  Evidence,
  AngularComponentChangeFinding,
} from "../core/types.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import { getAdditions } from "../git/parser.js";

// ============================================================================
// Detection Helpers
// ============================================================================

/**
 * Check if file is an Angular component, module, or service.
 */
function isCandidateFile(path: string): boolean {
  const validExtensions = [".ts", ".js"];
  if (!validExtensions.some((ext) => path.endsWith(ext))) {
    return false;
  }

  // Angular files typically follow naming conventions
  const angularPatterns = [
    ".component.",
    ".module.",
    ".service.",
    ".directive.",
    ".pipe.",
    ".guard.",
    ".interceptor.",
  ];

  return angularPatterns.some((pattern) => path.includes(pattern));
}

/**
 * Determine component type from filename.
 */
function getComponentTypeFromPath(path: string): string {
  if (path.includes(".component.")) return "component";
  if (path.includes(".module.")) return "module";
  if (path.includes(".service.")) return "service";
  if (path.includes(".directive.")) return "directive";
  if (path.includes(".pipe.")) return "pipe";
  if (path.includes(".guard.")) return "guard";
  if (path.includes(".interceptor.")) return "interceptor";
  return "unknown";
}

/**
 * Extract Angular decorator information from AST.
 */
interface DecoratorInfo {
  name: string;
  selector?: string;
  standalone?: boolean;
  providers?: string[];
}

function extractDecoratorInfo(content: string): DecoratorInfo | null {
  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "decorators-legacy"],
    });

    let decoratorInfo: DecoratorInfo | null = null;

    traverse(ast, {
      Decorator(path: any) {
        const expr = path.node.expression;

        // Check for @Component, @NgModule, @Injectable, etc.
        if (t.isCallExpression(expr) && t.isIdentifier(expr.callee)) {
          const decoratorName = expr.callee.name;

          if (
            ["Component", "NgModule", "Injectable", "Directive", "Pipe"].includes(
              decoratorName
            )
          ) {
            const config: DecoratorInfo = {
              name: decoratorName,
            };

            // Extract configuration object
            const firstArg = expr.arguments[0];
            if (t.isObjectExpression(firstArg)) {
              for (const prop of firstArg.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  // Extract selector
                  if (prop.key.name === "selector" && t.isStringLiteral(prop.value)) {
                    config.selector = prop.value.value;
                  }
                  // Extract standalone flag
                  else if (prop.key.name === "standalone" && t.isBooleanLiteral(prop.value)) {
                    config.standalone = prop.value.value;
                  }
                  // Extract providers
                  else if (prop.key.name === "providers" && t.isArrayExpression(prop.value)) {
                    config.providers = prop.value.elements
                      .map((el: any) => {
                        if (t.isIdentifier(el)) return el.name;
                        return null;
                      })
                      .filter((name: any): name is string => name !== null);
                  }
                }
              }
            }

            decoratorInfo = config;
          }
        }
      },
    });

    return decoratorInfo;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Analyzer
// ============================================================================

export const angularComponentsAnalyzer: Analyzer = {
  name: "angular-components",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      if (!isCandidateFile(file.path)) {
        continue;
      }

      const componentType = getComponentTypeFromPath(file.path);
      const diff = changeSet.diffs.find((d) => d.path === file.path);

      // Get evidence from diff
      const additions = diff ? getAdditions(diff) : [];
      const excerpt = extractRepresentativeExcerpt(additions);
      const evidence: Evidence[] = [];

      if (excerpt) {
        evidence.push(createEvidence(file.path, excerpt));
      }

      // Try to extract decorator info from additions
      const additionsText = additions.join("\n");
      const decoratorInfo = extractDecoratorInfo(additionsText);

      const finding: AngularComponentChangeFinding = {
        type: "angular-component-change",
        kind: "angular-component-change",
        category: "api",
        confidence: "high",
        evidence,
        file: file.path,
        change: file.status === "added" ? "added" : file.status === "deleted" ? "deleted" : "modified",
        componentType: componentType as any,
        selector: decoratorInfo?.selector,
        standalone: decoratorInfo?.standalone,
        providers: decoratorInfo?.providers,
      };

      findings.push(finding);
    }

    return findings;
  },
};
