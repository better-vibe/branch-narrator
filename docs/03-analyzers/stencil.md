# Stencil Analyzer

The Stencil analyzer detects changes in StencilJS components by parsing TypeScript AST. It extracts component metadata, props, events, methods, and slots to identify API changes.

## Capabilities

### Component Metadata
- Detects `@Component` decorator usage.
- Tracks `tag` changes (component identity).
- Tracks `shadow` DOM configuration changes.

### Props
- Detects `@Prop` decorator usage.
- Tracks added, removed, and modified properties.
- Monitors `attribute`, `reflect`, and `mutable` options.

### Events
- Detects `@Event` decorator usage.
- Tracks added, removed, and modified events.
- Identifies event name changes via `eventName` option.
- Monitors `bubbles`, `composed`, and `cancelable` options.

### Methods
- Detects `@Method` decorator usage.
- Tracks added and removed public methods.

### Slots
- Parses `render()` method body for JSX `<slot>` elements.
- Tracks added and removed slots (default and named).
- Identifies named slots vs default slots.

## Finding Types

- `stencil-component-change`: Changes to component configuration (tag, shadow).
- `stencil-prop-change`: Changes to `@Prop` members.
- `stencil-event-change`: Changes to `@Event` members.
- `stencil-method-change`: Changes to `@Method` members.
- `stencil-slot-change`: Changes to JSX slots.

## Trigger Conditions

The analyzer runs when the `stencil` profile is active. This profile is auto-detected if:
- `package.json` contains `@stencil/core` dependency.
- `stencil.config.ts` or `stencil.config.js` exists in the project root.
