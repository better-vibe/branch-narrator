import { describe, it, expect, mock, beforeAll } from "bun:test";
import { stencilAnalyzer, dependencies } from "../src/analyzers/stencil.js";
import type { ChangeSet } from "../src/core/types.js";

const BASE_CONTENT = `
import { Component, Prop, Event, EventEmitter, Method, h } from '@stencil/core';

@Component({
  tag: 'my-component',
  styleUrl: 'my-component.css',
  shadow: true,
})
export class MyComponent {
  @Prop() first: string;
  @Prop({ attribute: 'last-name' }) last: string;

  @Event() myEvent: EventEmitter<void>;
  @Event({ eventName: 'custom-event' }) customEvent: EventEmitter<string>;

  @Method()
  async myMethod() {
    return Promise.resolve();
  }

  render() {
    return (
      <div>
        Hello, World! I'm {this.first} {this.last}
        <slot />
        <slot name="header" />
      </div>
    );
  }
}
`;

const HEAD_CONTENT = `
import { Component, Prop, Event, EventEmitter, Method, h } from '@stencil/core';

@Component({
  tag: 'my-component', // Tag same
  styleUrl: 'my-component.css',
  shadow: false, // Changed shadow
})
export class MyComponent {
  // Removed first
  @Prop({ attribute: 'last-name', reflect: true }) last: string; // Changed: added reflect

  @Prop() newProp: boolean; // Added

  // Removed myEvent
  @Event({ eventName: 'custom-event', bubbles: false }) customEvent: EventEmitter<string>; // Changed: bubbles false

  @Event() newEvent: EventEmitter<void>; // Added

  // Removed myMethod

  @Method()
  async newMethod() {
    return Promise.resolve();
  }

  render() {
    return (
      <div>
        Hello, World! I'm {this.last}
        <slot />
        {/* Removed header slot */}
        <slot name="footer" /> {/* Added footer slot */}
      </div>
    );
  }
}
`;

describe("Stencil Analyzer", () => {
  beforeAll(() => {
    // Mock dependencies
    dependencies.batchGetFileContent = mock(async (files) => {
        const map = new Map<string, string>();
        for (const file of files) {
            const key = `${file.ref}:${file.path}`;
            if (file.ref === "base") {
                map.set(key, BASE_CONTENT);
            } else if (file.ref === "head") {
                map.set(key, HEAD_CONTENT);
            }
        }
        return map;
    });
  });

  it("detects stencil component changes", async () => {
    const changeSet: ChangeSet = {
      base: "base",
      head: "head",
      files: [
        { path: "src/components/my-component.tsx", status: "modified" },
      ],
      diffs: [],
    };

    const findings = await stencilAnalyzer.analyze(changeSet);

    // Verify component changes
    const shadowChange = findings.find(f => f.type === "stencil-component-change" && f.change === "shadow-changed");
    expect(shadowChange).toBeDefined();
    expect((shadowChange as any).fromShadow).toBe(true);
    expect((shadowChange as any).toShadow).toBe(false);

    // Verify prop changes
    const propRemoved = findings.find(f => f.type === "stencil-prop-change" && f.change === "removed" && (f as any).propName === "first");
    expect(propRemoved).toBeDefined();

    const propChanged = findings.find(f => f.type === "stencil-prop-change" && f.change === "changed" && (f as any).propName === "last");
    expect(propChanged).toBeDefined();
    expect((propChanged as any).details.reflect).toBe(true);

    const propAdded = findings.find(f => f.type === "stencil-prop-change" && f.change === "added" && (f as any).propName === "newProp");
    expect(propAdded).toBeDefined();

    // Verify event changes
    const eventRemoved = findings.find(f => f.type === "stencil-event-change" && f.change === "removed" && (f as any).eventName === "myEvent");
    expect(eventRemoved).toBeDefined();

    const eventChanged = findings.find(f => f.type === "stencil-event-change" && f.change === "changed" && (f as any).eventName === "custom-event");
    expect(eventChanged).toBeDefined();
    expect((eventChanged as any).details.bubbles).toBe(false);

    const eventAdded = findings.find(f => f.type === "stencil-event-change" && f.change === "added" && (f as any).eventName === "newEvent");
    expect(eventAdded).toBeDefined();

    // Verify method changes
    const methodRemoved = findings.find(f => f.type === "stencil-method-change" && f.change === "removed" && (f as any).methodName === "myMethod");
    expect(methodRemoved).toBeDefined();

    const methodAdded = findings.find(f => f.type === "stencil-method-change" && f.change === "added" && (f as any).methodName === "newMethod");
    expect(methodAdded).toBeDefined();

    // Verify slot changes
    const slotRemoved = findings.find(f => f.type === "stencil-slot-change" && f.change === "removed" && (f as any).slotName === "header");
    expect(slotRemoved).toBeDefined();

    const slotAdded = findings.find(f => f.type === "stencil-slot-change" && f.change === "added" && (f as any).slotName === "footer");
    expect(slotAdded).toBeDefined();
  });
});
