# Next.js Routes Analyzer

Detects route changes in Next.js App Router projects.

## Overview

| Property | Value |
|----------|-------|
| File | `src/analyzers/next-routes.ts` |
| Finding Type | `route-change`, `security-file` |
| Profile | `next` |

## Detection Patterns

### App Router Files

The analyzer detects changes to files in the `app/` or `src/app/` directory:

| File Pattern | Route Type | Description |
|--------------|------------|-------------|
| `page.tsx/ts/jsx/js` | `page` | Page components |
| `layout.tsx/ts` | `layout` | Layout components |
| `loading.tsx/ts` | `page` | Loading UI |
| `error.tsx/ts` | `error` | Error boundaries |
| `not-found.tsx/ts` | `error` | 404 pages |
| `route.ts/tsx` | `endpoint` | API route handlers |

### Middleware Detection

Middleware files emit `security-file` findings:

- `middleware.ts` / `middleware.js` (root)
- `src/middleware.ts` / `src/middleware.js`

### Config Detection

Next.js config files are tracked:

- `next.config.js`
- `next.config.mjs`
- `next.config.ts`

## Route ID Conversion

File paths are converted to route IDs:

| File Path | Route ID |
|-----------|----------|
| `app/page.tsx` | `/` |
| `app/dashboard/page.tsx` | `/dashboard` |
| `app/blog/[slug]/page.tsx` | `/blog/[slug]` |
| `app/docs/[[...slug]]/page.tsx` | `/docs/[[...slug]]` |
| `app/(marketing)/about/page.tsx` | `/about` |
| `app/api/users/route.ts` | `/api/users` |
| `src/app/settings/page.tsx` | `/settings` |

### Route Groups

Route groups `(name)` are removed from the route ID but preserved in the file path:

```
app/(auth)/login/page.tsx → /login
app/(dashboard)/settings/page.tsx → /settings
```

## HTTP Method Detection

For API routes (`route.ts`), the analyzer detects exported HTTP methods:

```typescript
// app/api/users/route.ts
export async function GET(request: Request) {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ created: true });
}
```

Detected methods: `["GET", "POST"]`

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

## Finding Output

### Route Change Finding

```json
{
  "type": "route-change",
  "routeId": "/api/users",
  "file": "app/api/users/route.ts",
  "change": "added",
  "routeType": "endpoint",
  "methods": ["GET", "POST"],
  "evidence": [
    {
      "file": "app/api/users/route.ts",
      "excerpt": "export async function GET(request: Request)"
    }
  ]
}
```

### Middleware Finding

```json
{
  "type": "security-file",
  "files": ["middleware.ts"],
  "reasons": ["middleware"],
  "evidence": [
    {
      "file": "middleware.ts",
      "excerpt": "export function middleware(request: NextRequest)"
    }
  ]
}
```

## Usage

The analyzer is included in the `next` profile:

```bash
# Auto-detect Next.js project
branch-narrator facts

# Force Next.js profile
branch-narrator facts --profile next
```

## API

```typescript
import {
  isNextRouteFile,
  getRouteType,
  pathToRouteId,
  detectMethods,
  isMiddlewareFile,
  isNextConfigFile,
  nextRoutesAnalyzer,
} from "branch-narrator/analyzers/next-routes";

// Check if file is a route file
isNextRouteFile("app/dashboard/page.tsx"); // true

// Get route type
getRouteType("app/api/users/route.ts"); // "endpoint"

// Convert path to route ID
pathToRouteId("app/(auth)/login/page.tsx"); // "/login"
```

## See Also

- [Next.js Profile](../07-profiles/next.md)
- [Route Change Finding](../04-types/findings.md#routechangefinding)
- [SvelteKit Routes Analyzer](./route-detector.md)
