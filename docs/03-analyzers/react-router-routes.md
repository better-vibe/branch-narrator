# React Router Routes Analyzer

**File:** `src/analyzers/reactRouterRoutes.ts`
**Finding Type:** `route-change`
**Profile:** React only

## Purpose

Detects React Router route changes in React applications, supporting both JSX `<Route>` components and data router configurations (`createBrowserRouter`, `createHashRouter`, `createMemoryRouter`, `createRoutesFromElements`).

## Finding Type

```typescript
type RouteType = "page" | "layout" | "endpoint" | "error" | "loading" | "template" | "default" | "metadata" | "unknown";

interface RouteChangeFinding {
  type: "route-change";
  routeId: string;         // e.g., "/dashboard", "/users/:id"
  file: string;            // Full file path
  change: FileStatus;      // "added" | "deleted"
  routeType: RouteType;    // "page", "layout", or "error" for React Router
  tags?: string[];         // Feature annotations (see Tags section)
}
```

## Route Type Detection

The analyzer classifies routes into three types:

| Route Type | Detection Criteria |
|------------|-------------------|
| `page` | Leaf routes (no children), index routes |
| `layout` | Routes with nested children (wrapper with `<Outlet>`) |
| `error` | Routes with `errorElement`/`ErrorBoundary`, catch-all (`*`) routes |

## Tags

Routes are annotated with tags for special characteristics:

| Tag | Meaning |
|-----|---------|
| `has-loader` | Route defines a `loader` function (data fetching) |
| `has-action` | Route defines an `action` function (mutations) |
| `lazy` | Route uses lazy loading via `lazy` property |
| `error-boundary` | Route has `errorElement` or `ErrorBoundary` |
| `catch-all` | Catch-all route (`path="*"`) |
| `has-handle` | Route defines a `handle` object (breadcrumbs, etc.) |
| `custom-revalidation` | Route defines `shouldRevalidate` |
| `component-prop` | Route uses `Component` prop instead of `element` |
| `hydrate-fallback` | Route defines `HydrateFallback` for SSR |

## Route Detection

The analyzer uses Babel to parse React/JSX/TypeScript files and extract route definitions from three patterns:

### 1. JSX Routes

Detects `<Route>` JSX elements:

```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/settings" element={<Settings />}>
    <Route path="billing" element={<Billing />} />
    <Route index element={<SettingsIndex />} />
  </Route>
  <Route path="/users/:id" element={<User />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

Extracted routes:
- `/` → page
- `/settings` → layout (has children)
- `/settings/billing` → page (nested route)
- `/settings` → page (index route)
- `/users/:id` → page
- `/*` → error (catch-all, tagged `catch-all`)

### 2. Data Routers

Detects `createBrowserRouter`, `createHashRouter`, and `createMemoryRouter` calls:

```tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    errorElement: <ErrorPage />,
    loader: rootLoader,
    children: [
      { index: true, element: <Home />, loader: homeLoader },
      {
        path: "contacts/:id",
        element: <Contact />,
        loader: contactLoader,
        action: contactAction,
      },
      {
        path: "settings",
        lazy: () => import("./routes/settings"),
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
```

Extracted routes:
- `/` → error (has `errorElement`), tags: `error-boundary`, `has-loader`
- `/` → page (index), tags: `has-loader`
- `/contacts/:id` → page, tags: `has-loader`, `has-action`
- `/settings` → page, tags: `lazy`
- `/*` → error, tags: `catch-all`

### 3. createRoutesFromElements

Detects the `createRoutesFromElements` bridge API:

```tsx
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Root />}>
      <Route path="home" element={<Home />} />
      <Route path="about" element={<About />} />
    </Route>
  )
);
```

## Path Handling

### Nested Routes

Parent and child paths are joined:
- Parent: `/settings`
- Child: `billing`
- Result: `/settings/billing`

### Absolute Child Paths

Children starting with `/` are treated as absolute:
- Parent: `/parent`
- Child: `/absolute`
- Result: `/absolute`

### Index Routes

Index routes map to their parent path:
- `<Route path="/settings"><Route index /></Route>`
- Extracts: `/settings`

### Path Normalization

- Collapse multiple slashes: `//path///to//` → `/path/to`
- Remove trailing slash: `/path/` → `/path` (except root `/`)
- Preserve route params: `:id`, `*`, `[slug]`, etc.

## File Filtering

Only processes files that:
1. Have extensions: `.ts`, `.tsx`, `.js`, `.jsx`
2. Contain React Router patterns in content:
   - `react-router`
   - `<Route`
   - `createBrowserRouter`
   - `createHashRouter`
   - `createMemoryRouter`
   - `createRoutesFromElements`

## How It Works

1. **File Selection**: Filter changed files by extension
2. **Content Fetching**: Use `git show` to get file contents at base and head refs
3. **Keyword Filtering**: Skip files without router keywords (performance heuristic)
4. **AST Parsing**: Parse with Babel using `typescript` and `jsx` plugins
5. **Route Extraction**:
   - Traverse AST to find JSX `<Route>` elements
   - Find data router function calls
   - Find `createRoutesFromElements` calls
   - Extract paths, route types, and tags from route configurations
   - Handle nesting and index routes
6. **Diff Calculation**: Compare base vs head routes
   - New routes → `added`
   - Removed routes → `deleted`
7. **Output**: Emit deduplicated and sorted findings with tags

## Limitations

- **Dynamic expressions**: Template literals and computed paths are skipped
  ```tsx
  // Skipped (not detected)
  <Route path={`/${dynamicPath}`} />
  <Route path={routeConfig.path} />
  ```

- **Parsing failures**: If Babel cannot parse a file, it's skipped silently

- **String literals only**: Only detects string literal paths
  ```tsx
  // Detected
  <Route path="/users" />
  <Route path={"/users"} />

  // Not detected
  <Route path={USERS_PATH} />
  ```

## Example Output

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "evidence": [
    {
      "file": "src/router.tsx",
      "excerpt": "Route: /contacts/:id [has-loader, has-action]"
    }
  ],
  "routeId": "/contacts/:id",
  "file": "src/router.tsx",
  "change": "added",
  "routeType": "page",
  "tags": ["has-loader", "has-action"]
}
```

## Usage in Markdown

```markdown
## Routes

| Route | Type | Change |
|-------|------|--------|
| `/contacts/:id` | page | added |
| `/settings` | layout | added |
| `/*` | error | added |
```

## Data Router Support

| Function | Supported |
|----------|-----------|
| `createBrowserRouter` | ✅ Yes |
| `createHashRouter` | ✅ Yes |
| `createMemoryRouter` | ✅ Yes |
| `createRoutesFromElements` | ✅ Yes |

Also supports:
- Inline array literals: `createBrowserRouter([...])`
- Identifier references: `createBrowserRouter(routes)` where `routes = [...]`
- Nested children via `children` property
- Index routes via `index: true`
- Error boundaries via `errorElement` / `ErrorBoundary`
- Data loading via `loader` / `action`
- Code splitting via `lazy`
- Route metadata via `handle`
- Custom revalidation via `shouldRevalidate`
- Component prop pattern via `Component` / `HydrateFallback`

## Testing

Export helper functions for unit testing:
- `extractJsxRoutes(ast, filePath, parentPath)` - Extract JSX routes
- `extractDataRoutes(ast, filePath, parentPath)` - Extract data router routes
- `extractRoutesFromContent(content, filePath)` - Parse and extract all routes
- `normalizePath(path)` - Normalize path string
- `joinPaths(parent, child)` - Join parent and child paths

See `tests/react-router.test.ts` for examples.
