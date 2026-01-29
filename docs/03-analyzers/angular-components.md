# Angular Components Analyzer

**File:** `src/analyzers/angular-components.ts`
**Finding Type:** `angular-component-change`

## Purpose

Detects changes to Angular components, modules, services, directives, pipes, guards, interceptors, and resolvers. Extracts rich metadata including @Input/@Output properties, change detection strategy, signal-based APIs, lifecycle hooks, and companion template/style file changes.

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
  componentType: "component" | "module" | "service" | "directive" | "pipe" | "guard" | "interceptor" | "resolver";
  selector?: string;
  standalone?: boolean;
  providers?: string[];
  changeDetection?: "OnPush" | "Default";
  inputs?: string[];
  outputs?: string[];
  tags?: string[];
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
| `*.resolver.ts` | Resolver |

### Companion File Detection
Template and style files are associated with their component:
| Pattern | Tag |
|---------|-----|
| `*.component.html` | `template-changed` |
| `*.component.css` / `*.component.scss` | `style-changed` |
| Any companion change | `has-template-style-changes` |

## Decorator Detection

The analyzer extracts information from Angular decorators via AST parsing with regex fallback:

### @Component Decorator
- **selector**: Component selector (e.g., `app-user`)
- **standalone**: Whether the component is standalone
- **providers**: Array of provided services
- **changeDetection**: `OnPush` or `Default`
- **templateUrl**: External template path
- **styleUrls**: External style paths

### @Input / @Output Properties
Extracted via both AST and regex:
- `@Input() name: string` - Decorator-based input
- `@Output() clicked = new EventEmitter()` - Decorator-based output
- `name = input<string>()` - Signal-based input (Angular 17+)
- `name = input.required<number>()` - Required signal input
- `clicked = output<void>()` - Signal-based output

## Feature Tags

### Lifecycle Hooks
| Pattern | Tag |
|---------|-----|
| `ngOnInit()` | `on-init` |
| `ngOnDestroy()` | `on-destroy` |
| `ngOnChanges()` | `on-changes` |
| `ngAfterViewInit()` | `after-view-init` |
| `ngAfterContentInit()` | `after-content-init` |
| `ngDoCheck()` | `do-check` |

### Dependency Injection
| Pattern | Tag |
|---------|-----|
| `inject()` | `inject-fn` |
| `constructor()` | `constructor-di` |
| `providedIn: 'root'` | `provided-in-root` |
| `providedIn: 'any'` | `provided-in-any` |

### RxJS Patterns
| Pattern | Tag |
|---------|-----|
| `Observable` | `uses-observable` |
| `Subject` | `uses-subject` |
| `BehaviorSubject` | `uses-behavior-subject` |
| `switchMap` | `uses-switchmap` |
| `mergeMap` | `uses-mergemap` |
| `takeUntilDestroyed` | `take-until-destroyed` |

### Signals (Angular 16+)
| Pattern | Tag |
|---------|-----|
| `signal()` | `uses-signals` |
| `computed()` | `uses-computed` |
| `effect()` | `uses-effect` |
| `input()` | `signal-input` |
| `output()` | `signal-output` |
| `model()` | `signal-model` |
| `input.required` | `required-input` |

### Template Features
| Pattern | Tag |
|---------|-----|
| `@if` | `control-flow` |
| `@for` | `control-flow` |
| `@switch` | `control-flow` |
| `@defer` | `defer-block` |

### Forms
| Pattern | Tag |
|---------|-----|
| `FormGroup` / `FormControl` / `FormBuilder` | `reactive-forms` |
| `ngModel` | `template-forms` |

### HTTP
| Pattern | Tag |
|---------|-----|
| `HttpClient` | `http-client` |
| `HttpInterceptor` | `http-interceptor` |

### View Queries
| Pattern | Tag |
|---------|-----|
| `@ViewChild()` / `viewChild()` | `view-child` |
| `@ContentChild()` / `contentChild()` | `content-child` |
| `@ViewChildren()` | `view-children` |
| `@ContentChildren()` | `content-children` |

## Example Output

### Component with Inputs/Outputs

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/card/card.component.ts",
  "change": "modified",
  "componentType": "component",
  "selector": "app-card",
  "standalone": true,
  "changeDetection": "OnPush",
  "inputs": ["title", "subtitle", "imageUrl"],
  "outputs": ["clicked", "dismissed"],
  "tags": ["on-init", "uses-signals", "template-changed"]
}
```

### Service with Modern DI

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/services/data.service.ts",
  "change": "added",
  "componentType": "service",
  "tags": ["inject-fn", "provided-in-root", "http-client", "uses-observable"]
}
```

## Rendering

In the markdown PR body, Angular component changes are rendered as tables grouped by type:

```
### Angular Components

**Components**

| File | Change | Selector | Details |
|------|--------|----------|---------|
| `src/app/card.component.ts` | modified | `app-card` | standalone; CD: OnPush; inputs: title, subtitle |
```

## Profiles

Included in:
- Angular profile
