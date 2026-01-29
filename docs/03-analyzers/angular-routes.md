# Angular Routes Analyzer

**File:** `src/analyzers/angular-routes.ts`
**Finding Type:** `route-change`

## Purpose

Detects changes to Angular Router configuration, including RouterModule.forRoot/forChild declarations, standalone provideRouter configurations, and route metadata such as guards, resolvers, data, and titles.

## Finding Type

Uses the standard `RouteChangeFinding` type:

```typescript
interface RouteChangeFinding {
  type: "route-change";
  kind: "route-change";
  category: "routes";
  confidence: Confidence;
  evidence: Evidence[];
  routeId: string;
  file: string;
  change: FileStatus;
  routeType: RouteType;
  tags?: string[];
}
```

## Detection Rules

### Routing Module Files
| File Pattern | Description |
|--------------|-------------|
| `*-routing.module.ts` | Standard routing modules |
| `*.routing.module.ts` | Alternative routing modules |
| `app.routes.ts` | Standalone routes file |
| `*.routes.ts` / `*.routes.js` | Feature routes files |
| `*.module.ts` | NgModule files with route imports |
| `*.component.ts` | Component files with inline routes |
| `app.config.ts` | Standalone app config with provideRouter |

### Route Configuration Patterns

The analyzer detects routes defined in:

1. **RouterModule.forRoot()** - Root application routes
2. **RouterModule.forChild()** - Feature module routes
3. **provideRouter()** - Angular standalone API routes (Angular 14+)
4. **const routes: Routes = [...]** - Standalone route declarations

## Route Type Classification

| Type | Description |
|------|-------------|
| `page` | Standard component route |
| `layout` | Route with children (acts as layout) |
| `error` | Wildcard catch-all route (`**`) |

## Route Metadata Extraction

The analyzer extracts rich metadata from route configurations:

### Guards
| Guard Type | Tag |
|------------|-----|
| `canActivate` | `guard:canActivate` |
| `canDeactivate` | `guard:canDeactivate` |
| `canMatch` | `guard:canMatch` |
| `canLoad` | `guard:canLoad` |
| `canActivateChild` | `guard:canActivateChild` |

### Other Properties
| Property | Tag | Description |
|----------|-----|-------------|
| `resolve` | `has-resolver` | Route data resolvers |
| `data` | `has-route-data` | Static route data |
| `title` | `has-title` | Route title |
| `outlet` | `named-outlet` | Named router outlet |
| `redirectTo` | `has-redirect` | Redirect configuration |
| `loadChildren` | `lazy-loading` | Lazy-loaded module |
| `loadComponent` | `lazy-component` | Lazy-loaded standalone component |
| `**` | `catch-all` | Wildcard route |

### Feature Tags from Diff Content

The analyzer also extracts tags from diff additions:

| Pattern | Tag |
|---------|-----|
| `provideRouter()` | `standalone-api` |
| `withComponentInputBinding()` | `input-binding` |
| `withPreloading()` | `preloading` |
| `withViewTransitions()` | `view-transitions` |
| `router.navigate()` | `programmatic-nav` |
| `routerLink` | `router-link` |
| `NavigationStart` / `NavigationEnd` | `route-events` |

## Route Path Normalization

Angular route paths are normalized:

| Input Path | Normalized Path |
|------------|-----------------|
| `/users` | `/users` |
| `users/` | `/users` |
| `//users///profile` | `/users/profile` |
| `/` | `/` |

## Change Detection

The analyzer detects three types of changes:

1. **Added** - Route path exists in head but not in base
2. **Deleted** - Route path exists in base but not in head
3. **Modified** - Route path exists in both, but guards, resolvers, lazy loading, or redirect target changed

## Nested Routes

The analyzer handles nested route hierarchies:

```typescript
const routes: Routes = [
  {
    path: 'users',
    component: UsersComponent,
    children: [
      { path: '', component: UserListComponent },      // → /users
      { path: ':id', component: UserDetailComponent }  // → /users/:id
    ]
  }
];
```

## Example Output

### Route with Guards

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/admin",
  "file": "src/app/app.routes.ts",
  "change": "added",
  "routeType": "page",
  "tags": ["has-guard", "guard:canActivate", "lazy-component"]
}
```

### Modified Route (Guard Added)

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/settings",
  "file": "src/app/app.routes.ts",
  "change": "modified",
  "routeType": "page",
  "evidence": [
    {
      "file": "src/app/app.routes.ts",
      "excerpt": "Route modified: /settings (guards changed)"
    }
  ]
}
```

### Layout Route with Children

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/users",
  "file": "src/app/app.routes.ts",
  "change": "added",
  "routeType": "layout"
}
```

## Implementation Details

The analyzer uses Babel to parse TypeScript files and extract route configurations. It:

1. Identifies routing files by filename patterns
2. Parses TypeScript/JavaScript with Babel (decorators-legacy plugin)
3. Extracts Routes array declarations (by type annotation or variable name)
4. Finds RouterModule.forRoot/forChild and provideRouter calls
5. Extracts route metadata: guards, resolvers, data, title, outlet
6. Compares base and head versions to detect added, deleted, and modified routes
7. Enriches findings with diff-level feature tags
8. Deduplicates and sorts findings by route ID

## Profiles

Included in:
- Angular profile
