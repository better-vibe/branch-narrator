/**
 * Stencil analyzer - detects changes in StencilJS components.
 * Uses AST parsing to extract component metadata, props, events, methods, and slots.
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  StencilComponentChangeFinding,
  StencilPropChangeFinding,
  StencilEventChangeFinding,
  StencilMethodChangeFinding,
  StencilSlotChangeFinding,
} from "../core/types.js";
import { createEvidence } from "../core/evidence.js";
import { batchGetFileContent as defaultBatchGetFileContent } from "../git/batch.js";

// Allow injection for testing
export const dependencies = {
  batchGetFileContent: defaultBatchGetFileContent,
};

// ============================================================================
// Types
// ============================================================================

interface StencilProp {
  name: string;
  typeText?: string;
  attribute?: string;
  reflect?: boolean;
  mutable?: boolean;
  line: number;
}

interface StencilEvent {
  name: string; // Public event name (from option or member name)
  memberName: string;
  bubbles?: boolean;
  composed?: boolean;
  cancelable?: boolean;
  line: number;
}

interface StencilMethod {
  name: string;
  signature?: string;
  line: number;
}

interface StencilComponent {
  tag: string;
  shadow: boolean;
  file: string;
  line: number;
  props: Map<string, StencilProp>;
  events: Map<string, StencilEvent>;
  methods: Map<string, StencilMethod>;
  slots: Set<string>; // Only names for simple diffing
}

// ============================================================================
// Extraction Logic
// ============================================================================

function isCandidateFile(path: string): boolean {
  return path.endsWith(".tsx") || path.endsWith(".ts");
}

/**
 * Format slot evidence string based on slot name type.
 */
function formatSlotEvidence(slotName: string): string {
  if (slotName === "default") {
    return "<slot />";
  } else if (slotName === "boolean") {
    return "<slot name />";
  } else if (slotName === "dynamic") {
    return "<slot name={...} />";
  } else {
    return `<slot name="${slotName}" />`;
  }
}

/**
 * Extract Stencil component information from file content.
 */
export function extractStencilComponents(
  content: string,
  filePath: string
): StencilComponent[] {
  const components: StencilComponent[] = [];

  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy"],
    });

    traverse(ast, {
      ClassDeclaration(path) {
        // Check for @Component decorator
        const decorators = path.node.decorators || [];
        const componentDecorator = decorators.find(
          (d) =>
            t.isCallExpression(d.expression) &&
            t.isIdentifier(d.expression.callee) &&
            d.expression.callee.name === "Component"
        );

        if (!componentDecorator) return;

        // Extract component metadata
        let tag = "";
        let shadow = false; // Default to false if not specified (though Stencil often recommends true)

        // Use default line 1 if loc is missing (rare)
        const componentLine = path.node.loc?.start.line ?? 1;

        if (t.isCallExpression(componentDecorator.expression)) {
          const arg = componentDecorator.expression.arguments[0];
          if (t.isObjectExpression(arg)) {
            for (const prop of arg.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                if (prop.key.name === "tag") {
                  if (t.isStringLiteral(prop.value)) {
                    tag = prop.value.value;
                  }
                } else if (prop.key.name === "shadow") {
                  if (t.isBooleanLiteral(prop.value)) {
                    shadow = prop.value.value;
                  }
                }
              }
            }
          }
        }

        if (!tag) return; // Tag is required

        const props = new Map<string, StencilProp>();
        const events = new Map<string, StencilEvent>();
        const methods = new Map<string, StencilMethod>();
        const slots = new Set<string>();

        // Traverse class body for members
        for (const bodyNode of path.node.body.body) {
          // Props
          if (t.isClassProperty(bodyNode) || t.isClassMethod(bodyNode)) {
            const memberDecorators = bodyNode.decorators || [];

            // @Prop
            const propDec = memberDecorators.find(
              (d) =>
                (t.isCallExpression(d.expression) &&
                  t.isIdentifier(d.expression.callee) &&
                  d.expression.callee.name === "Prop") ||
                (t.isIdentifier(d.expression) && d.expression.name === "Prop")
            );

            if (propDec && t.isIdentifier(bodyNode.key)) {
               const name = bodyNode.key.name;
               const line = bodyNode.loc?.start.line ?? 1;

               let attribute: string | undefined;
               let reflect = false;
               let mutable = false;
               let typeText: string | undefined; // We can't easily get full type text from AST without printing, so skipping for now or simple extraction

               if (t.isClassProperty(bodyNode) && bodyNode.typeAnnotation && t.isTSTypeAnnotation(bodyNode.typeAnnotation)) {
                   // Best effort type extraction - skipping complex types for now
                   // In a real implementation we might print the type node
               }

               if (t.isCallExpression(propDec.expression)) {
                 const arg = propDec.expression.arguments[0];
                 if (t.isObjectExpression(arg)) {
                    for (const p of arg.properties) {
                       if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
                          if (p.key.name === "attribute" && t.isStringLiteral(p.value)) attribute = p.value.value;
                          if (p.key.name === "reflect" && t.isBooleanLiteral(p.value)) reflect = p.value.value;
                          if (p.key.name === "mutable" && t.isBooleanLiteral(p.value)) mutable = p.value.value;
                       }
                    }
                 }
               }

               props.set(name, { name, attribute, reflect, mutable, typeText, line });
            }

            // @Event
            const eventDec = memberDecorators.find(
              (d) =>
                (t.isCallExpression(d.expression) &&
                  t.isIdentifier(d.expression.callee) &&
                  d.expression.callee.name === "Event") ||
                (t.isIdentifier(d.expression) && d.expression.name === "Event")
            );

            if (eventDec && t.isIdentifier(bodyNode.key)) {
               const memberName = bodyNode.key.name;
               let eventName = memberName;
               const line = bodyNode.loc?.start.line ?? 1;

               let bubbles = true; // Default true
               let composed = true; // Default true
               let cancelable = true; // Default true

               if (t.isCallExpression(eventDec.expression)) {
                 const arg = eventDec.expression.arguments[0];
                 if (t.isObjectExpression(arg)) {
                    for (const p of arg.properties) {
                       if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
                          if (p.key.name === "eventName" && t.isStringLiteral(p.value)) eventName = p.value.value;
                          if (p.key.name === "bubbles" && t.isBooleanLiteral(p.value)) bubbles = p.value.value;
                          if (p.key.name === "composed" && t.isBooleanLiteral(p.value)) composed = p.value.value;
                          if (p.key.name === "cancelable" && t.isBooleanLiteral(p.value)) cancelable = p.value.value;
                       }
                    }
                 }
               }

               events.set(eventName, { name: eventName, memberName, bubbles, composed, cancelable, line });
            }

            // @Method
            const methodDec = memberDecorators.find(
              (d) =>
                (t.isCallExpression(d.expression) &&
                  t.isIdentifier(d.expression.callee) &&
                  d.expression.callee.name === "Method") ||
                (t.isIdentifier(d.expression) && d.expression.name === "Method")
            );

            if (methodDec && t.isIdentifier(bodyNode.key)) {
               const name = bodyNode.key.name;
               const line = bodyNode.loc?.start.line ?? 1;
               // Extract signature if needed, for now just name
               methods.set(name, { name, line });
            }
          }

          // render() for slots
          if (t.isClassMethod(bodyNode) && t.isIdentifier(bodyNode.key) && bodyNode.key.name === "render") {
            // Traverse render method body for JSX slots
            traverse(bodyNode, {
              JSXElement(innerPath) {
                const opening = innerPath.node.openingElement;
                if (t.isJSXIdentifier(opening.name) && opening.name.name === "slot") {
                   let slotName = "default";
                   for (const attr of opening.attributes) {
                     if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === "name") {
                       if (t.isStringLiteral(attr.value)) {
                         slotName = attr.value.value;
                       } else if (attr.value === null) {
                         // Boolean "name" attribute: <slot name />
                         slotName = "boolean";
                       } else {
                         // Dynamic or non-literal slot name, e.g. <slot name={expr} />
                         slotName = "dynamic";
                       }
                     }
                   }
                   slots.add(slotName);
                }
              },
              // Also handle self-closing <slot /> (JSXElement handles both usually if parsed correctly, but just in case)
            }, path.scope, path);
          }
        }

        components.push({
          tag,
          shadow,
          file: filePath,
          line: componentLine,
          props,
          events,
          methods,
          slots,
        });
      },
    });
  } catch (error) {
    // Parsing error, skip
  }

  return components;
}

// ============================================================================
// Analyzer
// ============================================================================

export const stencilAnalyzer: Analyzer = {
  name: "stencil",
  cache: { includeGlobs: ["**/*.tsx", "**/*.ts"] },

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Select candidate files
    const candidateFiles = changeSet.files.filter((file) =>
      isCandidateFile(file.path)
    );

    if (candidateFiles.length === 0) return [];

    // Batch fetch content
    const batchRequest: Array<{ ref: string; path: string }> = [];
    for (const file of candidateFiles) {
      batchRequest.push({ ref: changeSet.base, path: file.path });
      batchRequest.push({ ref: changeSet.head, path: file.path });
    }

    const contentMap = await dependencies.batchGetFileContent(batchRequest);

    for (const file of candidateFiles) {
      const baseKey = `${changeSet.base}:${file.path}`;
      const headKey = `${changeSet.head}:${file.path}`;

      const baseContent = contentMap.get(baseKey);
      const headContent = contentMap.get(headKey);

      // Skip if neither has content (shouldn't happen for candidate files)
      if (!baseContent && !headContent) continue;

      const baseComponents = baseContent
        ? extractStencilComponents(baseContent, file.path)
        : [];
      const headComponents = headContent
        ? extractStencilComponents(headContent, file.path)
        : [];

      // Map by tag
      const baseMap = new Map(baseComponents.map((c) => [c.tag, c]));
      const headMap = new Map(headComponents.map((c) => [c.tag, c]));

      const allTags = new Set([...baseMap.keys(), ...headMap.keys()]);

      for (const tag of allTags) {
        const baseComp = baseMap.get(tag);
        const headComp = headMap.get(tag);

        if (baseComp && !headComp) {
          // Component removed
          findings.push({
            type: "stencil-component-change",
            kind: "stencil-component-change",
            category: "api",
            confidence: "high",
            evidence: [createEvidence(file.path, `@Component({ tag: "${tag}" })`, { line: baseComp.line })],
            tag,
            change: "removed",
            file: file.path,
          } as StencilComponentChangeFinding);
        } else if (!baseComp && headComp) {
          // Component added
          findings.push({
            type: "stencil-component-change",
            kind: "stencil-component-change",
            category: "api",
            confidence: "high",
            evidence: [createEvidence(file.path, `@Component({ tag: "${tag}" })`, { line: headComp.line })],
            tag,
            change: "added",
            file: file.path,
          } as StencilComponentChangeFinding);
        } else if (baseComp && headComp) {
          // Component modified - check details

          // Shadow DOM changed
          if (baseComp.shadow !== headComp.shadow) {
            findings.push({
              type: "stencil-component-change",
              kind: "stencil-component-change",
              category: "api",
              confidence: "high",
              evidence: [createEvidence(file.path, `@Component({ tag: "${tag}", shadow: ${headComp.shadow} })`, { line: headComp.line })],
              tag,
              change: "shadow-changed",
              file: file.path,
              fromShadow: baseComp.shadow,
              toShadow: headComp.shadow,
            } as StencilComponentChangeFinding);
          }

          // Props
          const allProps = new Set([...baseComp.props.keys(), ...headComp.props.keys()]);
          for (const propName of allProps) {
            const baseProp = baseComp.props.get(propName);
            const headProp = headComp.props.get(propName);

            if (baseProp && !headProp) {
              findings.push({
                type: "stencil-prop-change",
                kind: "stencil-prop-change",
                category: "api",
                confidence: "high",
                evidence: [createEvidence(file.path, `@Prop() ${propName}`, { line: baseProp.line })],
                tag,
                propName,
                change: "removed",
                file: file.path,
              } as StencilPropChangeFinding);
            } else if (!baseProp && headProp) {
              findings.push({
                type: "stencil-prop-change",
                kind: "stencil-prop-change",
                category: "api",
                confidence: "high",
                evidence: [createEvidence(file.path, `@Prop() ${propName}`, { line: headProp.line })],
                tag,
                propName,
                change: "added",
                file: file.path,
                details: {
                    attribute: headProp.attribute,
                    reflect: headProp.reflect,
                    mutable: headProp.mutable,
                }
              } as StencilPropChangeFinding);
            } else if (baseProp && headProp) {
              // Check for changes
              if (
                baseProp.attribute !== headProp.attribute ||
                baseProp.reflect !== headProp.reflect ||
                baseProp.mutable !== headProp.mutable
              ) {
                findings.push({
                    type: "stencil-prop-change",
                    kind: "stencil-prop-change",
                    category: "api",
                    confidence: "high",
                    evidence: [createEvidence(file.path, `@Prop() ${propName}`, { line: headProp.line })],
                    tag,
                    propName,
                    change: "changed",
                    file: file.path,
                    details: {
                        attribute: headProp.attribute,
                        reflect: headProp.reflect,
                        mutable: headProp.mutable,
                    }
                  } as StencilPropChangeFinding);
              }
            }
          }

          // Events
          const allEvents = new Set([...baseComp.events.keys(), ...headComp.events.keys()]);
          for (const eventName of allEvents) {
              const baseEvent = baseComp.events.get(eventName);
              const headEvent = headComp.events.get(eventName);

              if (baseEvent && !headEvent) {
                  findings.push({
                      type: "stencil-event-change",
                      kind: "stencil-event-change",
                      category: "api",
                      confidence: "high",
                      evidence: [createEvidence(file.path, `@Event() ${baseEvent.memberName}`, { line: baseEvent.line })],
                      tag,
                      eventName,
                      change: "removed",
                      file: file.path,
                  } as StencilEventChangeFinding);
              } else if (!baseEvent && headEvent) {
                  findings.push({
                      type: "stencil-event-change",
                      kind: "stencil-event-change",
                      category: "api",
                      confidence: "high",
                      evidence: [createEvidence(file.path, `@Event() ${headEvent.memberName}`, { line: headEvent.line })],
                      tag,
                      eventName,
                      change: "added",
                      file: file.path,
                      details: {
                          bubbles: headEvent.bubbles,
                          composed: headEvent.composed,
                          cancelable: headEvent.cancelable
                      }
                  } as StencilEventChangeFinding);
              } else if (baseEvent && headEvent) {
                  // Check for option changes
                  if (
                      baseEvent.bubbles !== headEvent.bubbles ||
                      baseEvent.composed !== headEvent.composed ||
                      baseEvent.cancelable !== headEvent.cancelable
                  ) {
                      findings.push({
                          type: "stencil-event-change",
                          kind: "stencil-event-change",
                          category: "api",
                          confidence: "high",
                          evidence: [createEvidence(file.path, `@Event() ${headEvent.memberName}`, { line: headEvent.line })],
                          tag,
                          eventName,
                          change: "changed",
                          file: file.path,
                          details: {
                            bubbles: headEvent.bubbles,
                            composed: headEvent.composed,
                            cancelable: headEvent.cancelable
                        }
                      } as StencilEventChangeFinding);
                  }
              }
          }

          // Methods
          const allMethods = new Set([...baseComp.methods.keys(), ...headComp.methods.keys()]);
          for (const methodName of allMethods) {
              const baseMethod = baseComp.methods.get(methodName);
              const headMethod = headComp.methods.get(methodName);

              if (baseMethod && !headMethod) {
                  findings.push({
                      type: "stencil-method-change",
                      kind: "stencil-method-change",
                      category: "api",
                      confidence: "high",
                      evidence: [createEvidence(file.path, `@Method() ${methodName}`, { line: baseMethod.line })],
                      tag,
                      methodName,
                      change: "removed",
                      file: file.path,
                  } as StencilMethodChangeFinding);
              } else if (!baseMethod && headMethod) {
                  findings.push({
                      type: "stencil-method-change",
                      kind: "stencil-method-change",
                      category: "api",
                      confidence: "high",
                      evidence: [createEvidence(file.path, `@Method() ${methodName}`, { line: headMethod.line })],
                      tag,
                      methodName,
                      change: "added",
                      file: file.path,
                  } as StencilMethodChangeFinding);
              }
              // Signature change check omitted for now (needs more complex AST analysis)
          }

          // Slots
          const allSlots = new Set([...baseComp.slots, ...headComp.slots]);
          for (const slotName of allSlots) {
              const baseHas = baseComp.slots.has(slotName);
              const headHas = headComp.slots.has(slotName);

              if (baseHas && !headHas) {
                  findings.push({
                      type: "stencil-slot-change",
                      kind: "stencil-slot-change",
                      category: "api",
                      confidence: "high",
                      evidence: [createEvidence(file.path, formatSlotEvidence(slotName), { line: baseComp.line })], // Approximate line
                      tag,
                      slotName,
                      change: "removed",
                      file: file.path,
                  } as StencilSlotChangeFinding);
              } else if (!baseHas && headHas) {
                  findings.push({
                      type: "stencil-slot-change",
                      kind: "stencil-slot-change",
                      category: "api",
                      confidence: "high",
                      evidence: [createEvidence(file.path, formatSlotEvidence(slotName), { line: headComp.line })],
                      tag,
                      slotName,
                      change: "added",
                      file: file.path,
                  } as StencilSlotChangeFinding);
              }
          }
        }
      }
    }

    return findings;
  },
};
