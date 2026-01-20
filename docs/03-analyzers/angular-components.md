# Angular Components Analyzer

**File:** `src/analyzers/angular-components.ts`
**Finding Type:** `angular-component-change`

## Purpose

Detects changes to Angular components, modules, services, directives, pipes, guards, and interceptors.

## Finding Type

```typescript
interface AngularComponentChangeFinding {
  type: "angular-component-change";
  kind: "angular-component-change";
  category: "api";
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  file: string;
  change: "added" | "modified" | "deleted";
  componentType: "component" | "module" | "service" | "directive" | "pipe" | "guard" | "interceptor";
  selector?: string;
  standalone?: boolean;
  providers?: string[];
}
```

## Detection Rules

### File Naming Patterns
| File Pattern | Component Type |
|--------------|----------------|
| `*.component.ts` | Component |
| `*.module.ts` | NgModule |
| `*.service.ts` | Service |
| `*.directive.ts` | Directive |
| `*.pipe.ts` | Pipe |
| `*.guard.ts` | Guard |
| `*.interceptor.ts` | Interceptor |

## Decorator Detection

The analyzer extracts information from Angular decorators:

### @Component Decorator
- **selector**: Component selector (e.g., `app-user`)
- **standalone**: Whether the component is standalone
- **providers**: Array of provided services

### @NgModule Decorator
- **providers**: Module-level providers

### @Injectable Decorator
- **providers**: Service providers

## Example Output

### Component Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/user/user.component.ts",
  "change": "modified",
  "componentType": "component",
  "selector": "app-user"
}
```

### Standalone Component

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/standalone/standalone.component.ts",
  "change": "added",
  "componentType": "component",
  "selector": "app-standalone",
  "standalone": true
}
```

### Module Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/feature/feature.module.ts",
  "change": "modified",
  "componentType": "module",
  "providers": ["FeatureService"]
}
```

### Service Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/services/data.service.ts",
  "change": "added",
  "componentType": "service"
}
```

### Directive Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/directives/highlight.directive.ts",
  "change": "modified",
  "componentType": "directive",
  "selector": "appHighlight"
}
```

### Pipe Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/pipes/format.pipe.ts",
  "change": "modified",
  "componentType": "pipe"
}
```

### Guard Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/guards/auth.guard.ts",
  "change": "modified",
  "componentType": "guard"
}
```

### Interceptor Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/interceptors/auth.interceptor.ts",
  "change": "added",
  "componentType": "interceptor"
}
```

## Implementation Details

The analyzer:

1. Identifies Angular files by naming conventions
2. Extracts evidence from git diffs
3. Attempts to parse decorator information using Babel
4. Extracts selector, standalone flag, and providers
5. Reports changes with extracted metadata

## Use Cases

This analyzer helps track:

- **Component API changes** - Modified selectors, inputs, outputs
- **Module restructuring** - Changes to module declarations and imports
- **Service additions** - New services being introduced
- **Standalone migration** - Tracking migration to standalone components
- **Dependency injection changes** - Provider modifications

## Profiles

Included in:
- Angular profile
