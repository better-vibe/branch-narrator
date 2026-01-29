/**
 * Angular component, module, and service detector.
 *
 * Detection capabilities:
 * - Components, modules, services, directives, pipes, guards, interceptors, resolvers
 * - @Input() and @Output() property extraction
 * - Signal-based inputs/outputs (input(), output(), model()) - Angular 17+
 * - Change detection strategy detection (OnPush vs Default)
 * - Standalone component detection
 * - Provider extraction
 * - Selector extraction
 * - Template and style file co-change detection
 * - Feature tags from diff content (lifecycle hooks, DI patterns, RxJS)
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

/** Angular file naming patterns */
const ANGULAR_FILE_PATTERNS = [
  ".component.",
  ".module.",
  ".service.",
  ".directive.",
  ".pipe.",
  ".guard.",
  ".interceptor.",
  ".resolver.",
] as const;

/** Angular template and style file patterns */
const ANGULAR_COMPANION_PATTERNS = [
  /\.component\.html$/,
  /\.component\.css$/,
  /\.component\.scss$/,
  /\.component\.less$/,
  /\.component\.sass$/,
] as const;

/** Angular component feature patterns for tag extraction */
const ANGULAR_COMPONENT_FEATURE_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  // Lifecycle hooks
  { pattern: /ngOnInit\s*\(/, tag: "on-init" },
  { pattern: /ngOnDestroy\s*\(/, tag: "on-destroy" },
  { pattern: /ngOnChanges\s*\(/, tag: "on-changes" },
  { pattern: /ngAfterViewInit\s*\(/, tag: "after-view-init" },
  { pattern: /ngAfterContentInit\s*\(/, tag: "after-content-init" },
  { pattern: /ngDoCheck\s*\(/, tag: "do-check" },
  // Dependency injection
  { pattern: /inject\s*\(/, tag: "inject-fn" },
  { pattern: /constructor\s*\(/, tag: "constructor-di" },
  { pattern: /providedIn\s*:\s*['"`]root['"`]/, tag: "provided-in-root" },
  { pattern: /providedIn\s*:\s*['"`]any['"`]/, tag: "provided-in-any" },
  // RxJS patterns
  { pattern: /Observable/, tag: "uses-observable" },
  { pattern: /Subject/, tag: "uses-subject" },
  { pattern: /BehaviorSubject/, tag: "uses-behavior-subject" },
  { pattern: /pipe\s*\(/, tag: "uses-pipe-operator" },
  { pattern: /switchMap/, tag: "uses-switchmap" },
  { pattern: /mergeMap/, tag: "uses-mergemap" },
  { pattern: /takeUntilDestroyed/, tag: "take-until-destroyed" },
  // Signals (Angular 16+)
  { pattern: /signal\s*[<(]/, tag: "uses-signals" },
  { pattern: /computed\s*\(/, tag: "uses-computed" },
  { pattern: /effect\s*\(/, tag: "uses-effect" },
  { pattern: /input\s*[<(]/, tag: "signal-input" },
  { pattern: /output\s*\(/, tag: "signal-output" },
  { pattern: /model\s*[<(]/, tag: "signal-model" },
  { pattern: /input\.required/, tag: "required-input" },
  // ViewChild / ContentChild
  { pattern: /viewChild\s*[<(]/, tag: "view-child" },
  { pattern: /contentChild\s*[<(]/, tag: "content-child" },
  { pattern: /@ViewChild\s*\(/, tag: "view-child" },
  { pattern: /@ContentChild\s*\(/, tag: "content-child" },
  { pattern: /@ViewChildren\s*\(/, tag: "view-children" },
  { pattern: /@ContentChildren\s*\(/, tag: "content-children" },
  // Template features
  { pattern: /@if\s*[({]/, tag: "control-flow" },
  { pattern: /@for\s*[({]/, tag: "control-flow" },
  { pattern: /@switch\s*[({]/, tag: "control-flow" },
  { pattern: /@defer\s*[({]/, tag: "defer-block" },
  // Forms
  { pattern: /FormGroup/, tag: "reactive-forms" },
  { pattern: /FormControl/, tag: "reactive-forms" },
  { pattern: /FormBuilder/, tag: "reactive-forms" },
  { pattern: /ngModel/, tag: "template-forms" },
  // HTTP
  { pattern: /HttpClient/, tag: "http-client" },
  { pattern: /HttpInterceptor/, tag: "http-interceptor" },
];

/**
 * Check if file is an Angular component, module, or service.
 */
function isCandidateFile(path: string): boolean {
  const validExtensions = [".ts", ".js"];
  if (!validExtensions.some((ext) => path.endsWith(ext))) {
    return false;
  }

  return ANGULAR_FILE_PATTERNS.some((pattern) => path.includes(pattern));
}

/**
 * Check if file is an Angular template or style companion file.
 */
function isCompanionFile(path: string): boolean {
  return ANGULAR_COMPANION_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Determine component type from filename.
 */
function getComponentTypeFromPath(path: string): AngularComponentChangeFinding["componentType"] {
  if (path.includes(".component.")) return "component";
  if (path.includes(".module.")) return "module";
  if (path.includes(".service.")) return "service";
  if (path.includes(".directive.")) return "directive";
  if (path.includes(".pipe.")) return "pipe";
  if (path.includes(".guard.")) return "guard";
  if (path.includes(".interceptor.")) return "interceptor";
  if (path.includes(".resolver.")) return "resolver";
  return "component";
}

/**
 * Get the base component name from a companion file.
 * e.g., "src/app/user/user.component.html" -> "src/app/user/user.component"
 */
function getComponentBaseName(path: string): string {
  return path.replace(/\.(html|css|scss|less|sass)$/, "");
}

// ============================================================================
// Decorator Extraction
// ============================================================================

interface DecoratorInfo {
  name: string;
  selector?: string;
  standalone?: boolean;
  providers?: string[];
  changeDetection?: "OnPush" | "Default";
  inputs?: string[];
  outputs?: string[];
  templateUrl?: string;
  styleUrls?: string[];
}

/**
 * Try to extract decorator info using regex as a fallback.
 */
function extractDecoratorInfoRegex(content: string): DecoratorInfo | null {
  const decoratorMatch = content.match(/@(Component|NgModule|Injectable|Directive|Pipe)\s*\(\s*\{/);
  if (!decoratorMatch) {
    return null;
  }

  const config: DecoratorInfo = {
    name: decoratorMatch[1],
  };

  const selectorMatch = content.match(/selector\s*:\s*['"]([^'"]+)['"]/);
  if (selectorMatch) {
    config.selector = selectorMatch[1];
  }

  const standaloneMatch = content.match(/standalone\s*:\s*(true|false)/);
  if (standaloneMatch) {
    config.standalone = standaloneMatch[1] === "true";
  }

  const cdMatch = content.match(/changeDetection\s*:\s*ChangeDetectionStrategy\.(OnPush|Default)/);
  if (cdMatch) {
    config.changeDetection = cdMatch[1] as "OnPush" | "Default";
  }

  // Extract @Input() properties
  const inputMatches = content.matchAll(/@Input\s*\([^)]*\)\s*(\w+)/g);
  const inputs: string[] = [];
  for (const m of inputMatches) {
    inputs.push(m[1]);
  }
  // Signal inputs: input<T>() or input.required<T>()
  const signalInputMatches = content.matchAll(/(\w+)\s*=\s*input(?:\.required)?\s*[<(]/g);
  for (const m of signalInputMatches) {
    inputs.push(m[1]);
  }
  if (inputs.length > 0) config.inputs = inputs;

  // Extract @Output() properties
  const outputMatches = content.matchAll(/@Output\s*\([^)]*\)\s*(\w+)/g);
  const outputs: string[] = [];
  for (const m of outputMatches) {
    outputs.push(m[1]);
  }
  // Signal outputs: output<T>()
  const signalOutputMatches = content.matchAll(/(\w+)\s*=\s*output\s*[<(]/g);
  for (const m of signalOutputMatches) {
    outputs.push(m[1]);
  }
  if (outputs.length > 0) config.outputs = outputs;

  return config;
}

/**
 * Extract Angular decorator information using AST parsing with regex fallback.
 */
function extractDecoratorInfo(content: string): DecoratorInfo | null {
  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "decorators-legacy"],
    });

    let decoratorInfo: DecoratorInfo | null = null;

    traverse(ast, {
      ClassDeclaration(path: any) {
        const decorators = path.node.decorators || [];
        for (const decorator of decorators) {
          const expr = decorator.expression;

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

              const firstArg = expr.arguments[0];
              if (t.isObjectExpression(firstArg)) {
                for (const prop of firstArg.properties) {
                  if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                    switch (prop.key.name) {
                      case "selector":
                        if (t.isStringLiteral(prop.value)) {
                          config.selector = prop.value.value;
                        }
                        break;
                      case "standalone":
                        if (t.isBooleanLiteral(prop.value)) {
                          config.standalone = prop.value.value;
                        }
                        break;
                      case "providers":
                        if (t.isArrayExpression(prop.value)) {
                          config.providers = prop.value.elements
                            .map((el: any) => {
                              if (t.isIdentifier(el)) return el.name;
                              return null;
                            })
                            .filter((name: any): name is string => name !== null);
                        }
                        break;
                      case "changeDetection":
                        // ChangeDetectionStrategy.OnPush
                        if (t.isMemberExpression(prop.value) && t.isIdentifier(prop.value.property)) {
                          const strategy = prop.value.property.name;
                          if (strategy === "OnPush" || strategy === "Default") {
                            config.changeDetection = strategy;
                          }
                        }
                        break;
                      case "templateUrl":
                        if (t.isStringLiteral(prop.value)) {
                          config.templateUrl = prop.value.value;
                        }
                        break;
                      case "styleUrls":
                        if (t.isArrayExpression(prop.value)) {
                          config.styleUrls = prop.value.elements
                            .filter((el: any): el is t.StringLiteral => t.isStringLiteral(el))
                            .map((el: t.StringLiteral) => el.value);
                        }
                        break;
                    }
                  }
                }
              }

              decoratorInfo = config;
              break;
            }
          }
        }

        // Extract @Input/@Output from class members (decorator-based and signal-based)
        if (decoratorInfo) {
          const inputs: string[] = [];
          const outputs: string[] = [];

          for (const member of path.node.body.body) {
            if (t.isClassProperty(member) && t.isIdentifier(member.key)) {
              // Check for decorator-based @Input/@Output
              if (member.decorators) {
                for (const dec of member.decorators) {
                  if (t.isCallExpression(dec.expression) && t.isIdentifier(dec.expression.callee)) {
                    if (dec.expression.callee.name === "Input") {
                      inputs.push(member.key.name);
                    } else if (dec.expression.callee.name === "Output") {
                      outputs.push(member.key.name);
                    }
                  }
                  if (t.isIdentifier(dec.expression)) {
                    if (dec.expression.name === "Input") {
                      inputs.push(member.key.name);
                    } else if (dec.expression.name === "Output") {
                      outputs.push(member.key.name);
                    }
                  }
                }
              }

              // Check for signal-based input()/output()/model()
              const init = member.value;
              if (init) {
                // input<T>(), output<T>()
                if (t.isCallExpression(init) && t.isIdentifier(init.callee)) {
                  if (init.callee.name === "input") {
                    inputs.push(member.key.name);
                  } else if (init.callee.name === "output") {
                    outputs.push(member.key.name);
                  } else if (init.callee.name === "model") {
                    inputs.push(member.key.name);
                    outputs.push(member.key.name);
                  }
                }
                // input.required<T>()
                if (
                  t.isCallExpression(init) &&
                  t.isMemberExpression(init.callee) &&
                  t.isIdentifier(init.callee.object) &&
                  init.callee.object.name === "input" &&
                  t.isIdentifier(init.callee.property) &&
                  init.callee.property.name === "required"
                ) {
                  inputs.push(member.key.name);
                }
              }
            }
          }

          if (inputs.length > 0) decoratorInfo.inputs = inputs;
          if (outputs.length > 0) decoratorInfo.outputs = outputs;
        }
      },
    });

    if (decoratorInfo) {
      return decoratorInfo;
    }
  } catch (error) {
    // AST parsing failed, fall through to regex
  }

  return extractDecoratorInfoRegex(content);
}

/**
 * Extract feature tags from diff content.
 */
function extractFeatureTags(additions: string[]): string[] {
  const tags = new Set<string>();
  const combined = additions.join("\n");

  for (const { pattern, tag } of ANGULAR_COMPONENT_FEATURE_PATTERNS) {
    if (pattern.test(combined)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

// ============================================================================
// Analyzer
// ============================================================================

export const angularComponentsAnalyzer: Analyzer = {
  name: "angular-components",
  cache: { includeGlobs: ["**/*.ts", "**/*.html", "**/*.css", "**/*.scss"] },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    // Track companion file changes to associate with components
    const companionChanges = new Map<string, string[]>();
    for (const file of changeSet.files) {
      if (isCompanionFile(file.path)) {
        const baseName = getComponentBaseName(file.path);
        if (!companionChanges.has(baseName)) {
          companionChanges.set(baseName, []);
        }
        companionChanges.get(baseName)!.push(file.path);
      }
    }

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

      // Extract feature tags
      const tags = extractFeatureTags(additions);

      // Check for companion file changes (template/style)
      const baseName = file.path.replace(/\.(ts|js)$/, "");
      const companions = companionChanges.get(baseName);
      if (companions && companions.length > 0) {
        tags.push("has-template-style-changes");
        for (const c of companions) {
          if (c.endsWith(".html")) tags.push("template-changed");
          if (/\.(css|scss|less|sass)$/.test(c)) tags.push("style-changed");
        }
      }

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
        changeDetection: decoratorInfo?.changeDetection,
        inputs: decoratorInfo?.inputs,
        outputs: decoratorInfo?.outputs,
      };
      if (tags.length > 0) finding.tags = tags;

      findings.push(finding);
    }

    return findings;
  },
};
