# React Profile

Full-featured profile for React applications using React Router.

## Detection

The React profile is auto-detected when:

1. `react` AND `react-dom` are in package.json dependencies, AND
2. `react-router-dom` OR `react-router` is in package.json dependencies, AND
3. `next` is NOT in package.json dependencies

**Note**: Next.js projects are excluded because they use file-based routing, not React Router.

## Analyzers

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | Summarize file changes |
| `file-category` | Categorize files by type |
| `react-router-routes` | Detect React Router routes |
| `env-var` | Extract environment variables |
| `cloudflare` | Detect Cloudflare changes |
| `vitest` | Detect test changes |
| `dependencies` | Analyze package.json |
| `security-files` | Detect security-sensitive files |
| `impact` | Analyze blast radius of changes |
| `tailwind` | Detect Tailwind CSS config changes |
| `typescript-config` | Detect TypeScript config changes |
| `large-diff` | Detect large changesets |
| `lockfiles` | Detect lockfile/manifest mismatches |
| `test-gaps` | Detect production code changes without tests |
| `sql-risks` | Detect risky SQL in migrations |
| `ci-workflows` | Detect CI/CD workflow changes |
| `infra` | Detect infrastructure changes |
| `api-contracts` | Detect API contract changes |

## React-Specific Features

### React Router Route Detection

Detects routes in React applications using:

#### JSX Routes

```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/settings" element={<Settings />}>
    <Route path="billing" element={<Billing />} />
    <Route index element={<SettingsIndex />} />
  </Route>
</Routes>
```

Extracted routes:
- `/` - page
- `/settings` - page
- `/settings/billing` - nested page
- `/settings` - index route

#### Data Routers

```tsx
const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { 
    path: "/account",
    children: [
      { index: true, element: <Index /> },
      { path: "settings", element: <Settings /> }
    ]
  }
]);
```

Extracted routes:
- `/`
- `/account`
- `/account/settings`

Supports:
- `createBrowserRouter`
- `createHashRouter`
- `createMemoryRouter`

#### Path Handling

- **Nested routes**: Parent + child paths joined with `/`
- **Index routes**: Map to parent path
- **Absolute child paths**: Children starting with `/` treated as absolute
- **Route params**: Preserved as-is (`:id`, `*`, etc.)

### Environment Variable Detection

Detects env vars using React and Vite conventions:

#### Vite (import.meta.env)

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const apiKey = import.meta.env.VITE_API_KEY;
```

Pattern: `import.meta.env.VITE_[A-Z0-9_]+`

#### Create React App (process.env)

```typescript
const apiUrl = process.env.REACT_APP_API_URL;
const apiKey = process.env.REACT_APP_API_KEY;
```

Pattern: `process.env.REACT_APP_[A-Z0-9_]+`

#### Generic process.env

```typescript
const secret = process.env.SECRET_KEY;
const url = process.env.NEXT_PUBLIC_API_URL;
```

Pattern: `process.env.[A-Z_][A-Z0-9_]*`

All patterns above are supported, including `NEXT_PUBLIC_*` for Next.js compatibility.

## Detection Logic

```typescript
function detectProfile(changeSet: ChangeSet): ProfileName {
  // 1. Check for SvelteKit first
  if (hasSvelteKitDependency(changeSet.headPackageJson)) {
    return "sveltekit";
  }

  // 2. Check for React + React Router (excluding Next.js)
  if (
    hasReactDependency(changeSet.headPackageJson) &&
    hasReactRouterDependency(changeSet.headPackageJson) &&
    !hasNextDependency(changeSet.headPackageJson)
  ) {
    return "react";
  }

  // 3. Default
  return "auto";
}
```

## Source

```typescript
// src/profiles/react.ts
export const reactProfile: Profile = {
  name: "react",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    reactRouterRoutesAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    tailwindAnalyzer,
    typescriptConfigAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
```

## Usage

```bash
# Auto-detect (if React + React Router project)
branch-narrator pr-body

# Force React profile
branch-narrator pr-body --profile react

# Preview changes with React profile
branch-narrator pretty --profile react

# Get JSON facts with React analysis
branch-narrator facts --profile react
```

## Example PR Output

```markdown
## Routes

| Route | Change |
|-------|--------|
| `/` | added |
| `/users/:id` | added |
| `/settings/billing` | added |

## Environment Variables

- `VITE_API_URL`
- `VITE_API_KEY`
- `REACT_APP_AUTH_DOMAIN`
```

## When to Use

Use the React profile when:
- ✅ Building a React SPA with React Router
- ✅ Using Vite or Create React App
- ✅ Need route change detection
- ✅ Want React-specific env var patterns

Don't use when:
- ❌ Using Next.js (file-based routing)
- ❌ Using Remix (different routing system)
- ❌ React Native projects (no web routing)

## Comparison with SvelteKit Profile

| Feature | React Profile | SvelteKit Profile |
|---------|---------------|-------------------|
| **Route Detection** | JSX + data routers | File-based (`+page.svelte`) |
| **Env Vars** | Vite, CRA patterns | `$env/static/*` imports |
| **HTTP Methods** | N/A | Detected from exports |
| **Route Groups** | N/A | `(group)` notation |
| **Profile Detection** | `react-router-dom` dep | `src/routes/` dir |

## Requirements

For React Router detection to work:
- `react-router` or `react-router-dom` must be in package.json
- Routes must use string literal paths (not template literals or variables)
- Files must be parseable by Babel (valid TypeScript/JSX)

## Limitations

- Only detects React Router routes (not other routers like Reach Router, Wouter)
- Requires `react-router-dom` dependency to activate
- Skips dynamic/computed route paths
- Excludes Next.js projects (use default profile instead)
