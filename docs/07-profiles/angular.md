# Angular Profile

**File:** `src/profiles/angular.ts`
**Profile Name:** `angular`

## Purpose

The Angular profile provides analyzers optimized for Angular projects, with support for Angular Router, components, modules, services, and the Angular CLI.

## Detection

The Angular profile is automatically detected when:

1. **Angular dependencies found:** `@angular/core` or `@angular/common` in package.json
2. **Angular config found:** `angular.json` or `.angular-cli.json` file exists
3. **Angular only:** Angular dependency without config (medium confidence)

```bash
# Force Angular profile
branch-narrator --profile angular
```

## Analyzers Included

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | File change summary |
| `file-category` | File categorization |
| `angular-routes` | Angular Router configuration changes |
| `angular-components` | Component, module, service changes |
| `env-var` | Environment variable changes |
| `cloudflare` | Cloudflare configuration |
| `vitest` | Test file changes |
| `dependencies` | Package dependency changes |
| `security-files` | Security-sensitive file changes |
| `impact` | Blast radius analysis |
| `tailwind` | Tailwind CSS configuration |
| `typescript-config` | TypeScript configuration |
| `graphql` | GraphQL schema changes |
| `large-diff` | Large changeset warnings |
| `lockfiles` | Lockfile mismatch detection |
| `test-gaps` | Test coverage gaps |
| `sql-risks` | SQL risk patterns |
| `ci-workflows` | CI/CD security |
| `infra` | Infrastructure changes |
| `api-contracts` | API contract changes |

## Angular-Specific Detection

### Routing Modules
```
src/app/
├── app-routing.module.ts     → Root routes
├── app.routes.ts             → Standalone routes
└── feature/
    └── feature-routing.module.ts → Feature routes
```

### Route Configuration

**NgModule-based routing:**
```typescript
const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'users/:id', component: UserComponent },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)]
})
export class AppRoutingModule {}
```

**Standalone routing:**
```typescript
const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'about', component: AboutComponent }
];

export const appConfig = {
  providers: [provideRouter(routes)]
};
```

### Component Files
```
src/app/
├── app.component.ts          → Root component
├── user/
│   ├── user.component.ts     → Component
│   ├── user.component.html   → Template
│   ├── user.component.scss   → Styles
│   └── user.component.spec.ts → Tests
├── services/
│   └── data.service.ts       → Service
├── guards/
│   └── auth.guard.ts         → Route guard
└── interceptors/
    └── http.interceptor.ts   → HTTP interceptor
```

### Module Structure
```
src/app/
├── app.module.ts             → Root module
└── feature/
    └── feature.module.ts     → Feature module
```

## Example Output

### Route Changes

```markdown
## Routes / API

| Route | Type | Change | File |
|-------|------|--------|------|
| `/dashboard` | page | added | app.routes.ts |
| `/admin` | lazy | added | app-routing.module.ts |
| `/` | redirect | modified | app.routes.ts |
```

### Component Changes

```markdown
## Components & Modules

| File | Type | Change | Details |
|------|------|--------|---------|
| user.component.ts | component | modified | selector: app-user |
| feature.module.ts | module | added | - |
| data.service.ts | service | modified | - |
| auth.guard.ts | guard | added | - |
```

### JSON Finding - Route Change

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/users/:id",
  "file": "src/app/app.routes.ts",
  "change": "added",
  "routeType": "page"
}
```

### JSON Finding - Component Change

```json
{
  "type": "angular-component-change",
  "kind": "angular-component-change",
  "category": "api",
  "confidence": "high",
  "file": "src/app/user/user.component.ts",
  "change": "modified",
  "componentType": "component",
  "selector": "app-user",
  "standalone": false
}
```

### JSON Finding - Standalone Component

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

## Usage

```bash
# Auto-detect (recommended)
branch-narrator

# Force Angular profile
branch-narrator --profile angular

# JSON output
branch-narrator facts --profile angular

# Terminal output
branch-narrator pretty --profile angular
```

## Angular Version Support

The profile supports:

- **Angular 2-17+** - All modern Angular versions
- **AngularJS (1.x)** - Limited support (file detection only)
- **Standalone API** - Full support for Angular 14+ standalone components
- **NgModules** - Traditional module-based architecture
- **Lazy loading** - loadChildren route detection
- **Guards & Interceptors** - Authentication and HTTP interceptor changes

## Related Profiles

- **React:** For React projects
- **Vue:** For Vue.js/Nuxt projects
- **Next:** For Next.js projects
- **Default:** For projects without specific framework detection
