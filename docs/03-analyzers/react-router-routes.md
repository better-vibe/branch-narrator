# React Router Routes Analyzer

**File:** `src/analyzers/reactRouterRoutes.ts`
**Finding Type:** `route-change`
**Profile:** React only

## Purpose

Detects React Router route changes in React applications, supporting both JSX `<Route>` components and data router configurations (`createBrowserRouter`, `createHashRouter`, `createMemoryRouter`).

## Finding Type

```typescript
type RouteType = "page" | "layout" | "endpoint" | "error" | "unknown";

interface RouteChangeFinding {
  type: "route-change";
  routeId: string;         // e.g., "/dashboard", "/users/:id"
  file: string;            // Full file path
  change: FileStatus;      // "added" | "deleted"
  routeType: RouteType;    // Always "page" for React Router
}
```

## Route Detection

The analyzer uses Babel to parse React/JSX/TypeScript files and extract route definitions from two patterns:

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
</Routes>
```

Extracted routes:
- `/`
- `/settings`
- `/settings/billing` (nested route)
- `/settings` (index route)
- `/users/:id`

### 2. Data Routers

Detects `createBrowserRouter`, `createHashRouter`, and `createMemoryRouter` calls:

```tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/account",
    element: <Account />,
    children: [
      { index: true, element: <AccountIndex /> },
      { path: "settings", element: <Settings /> }
    ]
  }
]);
```

Extracted routes:
- `/`
- `/account`
- `/account` (index route)
- `/account/settings` (nested child)

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
2. Contain React Router patterns in diff:
   - `react-router`
   - `<Route`
   - `createBrowserRouter`
   - `createHashRouter`
   - `createMemoryRouter`

## How It Works

1. **File Selection**: Filter changed files by extension and diff content
2. **Content Fetching**: Use `git show` to get file contents at base and head refs
3. **AST Parsing**: Parse with Babel using `typescript` and `jsx` plugins
4. **Route Extraction**: 
   - Traverse AST to find JSX `<Route>` elements
   - Find data router function calls
   - Extract paths from route configurations
   - Handle nesting and index routes
5. **Diff Calculation**: Compare base vs head routes
   - New routes → `added`
   - Removed routes → `deleted`
6. **Output**: Emit deduplicated and sorted findings

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
      "file": "src/App.tsx",
      "excerpt": "Route: /users/:id"
    }
  ],
  "routeId": "/users/:id",
  "file": "src/App.tsx",
  "change": "added",
  "routeType": "page"
}
```

## Usage in Markdown

```markdown
## Routes

| Route | Change |
|-------|--------|
| `/users/:id` | added |
| `/settings/billing` | added |
| `/legacy-path` | deleted |
```

## Data Router Support

Supports all React Router data router functions:

| Function | Supported |
|----------|-----------|
| `createBrowserRouter` | ✅ Yes |
| `createHashRouter` | ✅ Yes |
| `createMemoryRouter` | ✅ Yes |

Also supports:
- Inline array literals: `createBrowserRouter([...])`
- Identifier references: `createBrowserRouter(routes)` where `routes = [...]`
- Nested children via `children` property
- Index routes via `index: true`

## Testing

Export helper functions for unit testing:
- `extractJsxRoutes(ast, filePath, parentPath)` - Extract JSX routes
- `extractDataRoutes(ast, filePath, parentPath)` - Extract data router routes
- `extractRoutesFromContent(content, filePath)` - Parse and extract all routes
- `normalizePath(path)` - Normalize path string
- `joinPaths(parent, child)` - Join parent and child paths

See `tests/react-router.test.ts` for examples.
