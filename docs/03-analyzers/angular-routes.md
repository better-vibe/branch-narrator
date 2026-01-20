# Angular Routes Analyzer

**File:** `src/analyzers/angular-routes.ts`
**Finding Type:** `route-change`

## Purpose

Detects changes to Angular Router configuration, including RouterModule.forRoot/forChild declarations and standalone provideRouter configurations.

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
}
```

## Detection Rules

### Routing Module Files
| File Pattern | Description |
|--------------|-------------|
| `*-routing.module.ts` | Standard routing modules |
| `*.routing.module.ts` | Alternative routing modules |
| `app.routes.ts` | Standalone routes file |
| `*.routes.ts` | Feature routes files |

### Route Configuration Patterns

The analyzer detects routes defined in:

1. **RouterModule.forRoot()** - Root application routes
2. **RouterModule.forChild()** - Feature module routes
3. **provideRouter()** - Angular standalone API routes

## Route Type Classification

| Type | Description |
|------|-------------|
| `page` | Component route |
| `lazy` | Lazy-loaded route (loadChildren) |
| `redirect` | Redirect route (redirectTo) |

## Route Path Normalization

Angular route paths are normalized:

| Input Path | Normalized Path |
|------------|-----------------|
| `/users` | `/users` |
| `users/` | `/users` |
| `//users///profile` | `/users/profile` |
| `/` | `/` |

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

### New Angular Route

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/dashboard",
  "file": "src/app/app.routes.ts",
  "change": "added",
  "routeType": "page"
}
```

### Lazy-Loaded Route

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/admin",
  "file": "src/app/app-routing.module.ts",
  "change": "added",
  "routeType": "lazy"
}
```

### Redirect Route

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/",
  "file": "src/app/app.routes.ts",
  "change": "modified",
  "routeType": "redirect",
  "evidence": [
    {
      "file": "src/app/app.routes.ts",
      "excerpt": "Route: / → /home"
    }
  ]
}
```

### Nested Routes

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/users/:id",
  "file": "src/app/users/users-routing.module.ts",
  "change": "added",
  "routeType": "page"
}
```

## Implementation Details

The analyzer uses Babel to parse TypeScript files and extract route configurations. It:

1. Identifies routing files by filename patterns
2. Parses TypeScript/JavaScript with Babel (decorators-legacy plugin)
3. Extracts Routes array declarations
4. Finds RouterModule.forRoot/forChild and provideRouter calls
5. Compares base and head versions to detect changes
6. Reports added and deleted routes

## Profiles

Included in:
- Angular profile
