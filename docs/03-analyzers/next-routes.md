# Next.js Routes Analyzer

Detects route changes in Next.js App Router projects.

## Overview

| Property | Value |
|----------|-------|
| File | `src/analyzers/next-routes.ts` |
| Finding Types | `route-change`, `next-config-change`, `security-file` |
| Profile | `next` |

## Detection Patterns

### App Router Files

The analyzer detects changes to files in the `app/` or `src/app/` directory:

| File Pattern | Route Type | Description |
|--------------|------------|-------------|
| `page.tsx/ts/jsx/js` | `page` | Page components |
| `layout.tsx/ts/jsx/js` | `layout` | Layout components |
| `template.tsx/ts/jsx/js` | `template` | Template components (re-render on navigation) |
| `default.tsx/ts/jsx/js` | `default` | Parallel route fallback UI |
| `loading.tsx/ts/jsx/js` | `loading` | Loading UI (Suspense boundary) |
| `error.tsx/ts/jsx/js` | `error` | Error boundaries |
| `global-error.tsx/ts/jsx/js` | `error` | Root error boundary |
| `not-found.tsx/ts/jsx/js` | `error` | 404 pages |
| `route.ts/tsx/js/jsx` | `endpoint` | API route handlers |

### Metadata File Conventions

Next.js metadata files are detected as `metadata` route type:

| File Pattern | Description |
|--------------|-------------|
| `sitemap.ts/js` | XML sitemap generation |
| `robots.ts/js` | Robots.txt generation |
| `manifest.ts/js` | Web app manifest |
| `opengraph-image.tsx/ts/jsx/js/png/jpg` | Open Graph images |
| `twitter-image.tsx/ts/jsx/js/png/jpg` | Twitter card images |
| `icon.tsx/ts/jsx/js/png/ico/svg` | Favicon and icons |
| `apple-icon.tsx/ts/jsx/js/png` | Apple touch icons |

### Middleware Detection

Middleware files emit `security-file` findings:

- `middleware.ts` / `middleware.js` (root)
- `src/middleware.ts` / `src/middleware.js`

### Instrumentation Detection

Instrumentation files (Next.js 13.2+) emit `security-file` findings:

- `instrumentation.ts` / `instrumentation.js` (root)
- `src/instrumentation.ts` / `src/instrumentation.js`

### Config Detection

Next.js config file changes emit `next-config-change` findings with detected features:

- `next.config.js`
- `next.config.mjs`
- `next.config.cjs`
- `next.config.ts`

Detected config features include: `rewrites`, `redirects`, `headers`, `images`, `i18n`, `webpack`, `turbopack`, `experimental`, `output`, `basePath`, `env`, `serverActions`, `appDir`, `ppr`, `dynamicIO`, `serverExternalPackages`, `transpilePackages`.

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
| `app/@modal/photo/page.tsx` | `/photo` |
| `app/(.)photo/page.tsx` | `/(.)photo` |

### Route Groups

Route groups `(name)` are removed from the route ID but preserved in the file path:

```
app/(auth)/login/page.tsx → /login
app/(dashboard)/settings/page.tsx → /settings
```

### Parallel Routes

Parallel route slots `@name` are removed from the route ID but tracked via tags:

```
app/@modal/photo/page.tsx → /photo (tag: parallel:@modal)
app/@sidebar/@main/page.tsx → / (tags: parallel:@sidebar, parallel:@main)
```

### Intercepting Routes

Intercepting route segments are preserved in the route ID:

```
app/(.)photo/page.tsx → /(.)photo (tag: intercepting-route)
app/(..)photo/page.tsx → /(..)photo (tag: intercepting-route)
app/(...)photo/page.tsx → /(...)photo (tag: intercepting-route)
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

## Server Actions & Metadata Detection

The analyzer detects special Next.js patterns and adds them as tags:

| Pattern | Tag | Description |
|---------|-----|-------------|
| `"use server"` directive | `server-action` | File contains Server Actions |
| `export function generateStaticParams` | `static-params` | Static parameter generation |
| `export function generateMetadata` | `has-metadata` | Dynamic metadata generation |
| `export const metadata` | `has-metadata` | Static metadata export |

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
  "tags": ["server-action"],
  "evidence": [
    {
      "file": "app/api/users/route.ts",
      "excerpt": "export async function GET(request: Request)"
    }
  ]
}
```

### Next.js Config Change Finding

```json
{
  "type": "next-config-change",
  "file": "next.config.ts",
  "status": "modified",
  "detectedFeatures": ["experimental", "ppr", "images"],
  "evidence": [
    {
      "file": "next.config.ts",
      "excerpt": "experimental: { ppr: true }"
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
  isNextMetadataFile,
  getRouteType,
  pathToRouteId,
  detectMethods,
  hasServerActions,
  hasGenerateStaticParams,
  hasMetadataExport,
  isMiddlewareFile,
  isInstrumentationFile,
  isNextConfigFile,
  detectConfigFeatures,
  hasParallelSegment,
  extractParallelSlots,
  hasInterceptingSegment,
  nextRoutesAnalyzer,
} from "branch-narrator/analyzers/next-routes";

// Check if file is a route file
isNextRouteFile("app/dashboard/page.tsx"); // true

// Check if file is a metadata file
isNextMetadataFile("app/sitemap.ts"); // true

// Get route type
getRouteType("app/api/users/route.ts"); // "endpoint"
getRouteType("app/template.tsx"); // "template"

// Convert path to route ID
pathToRouteId("app/(auth)/login/page.tsx"); // "/login"
pathToRouteId("app/@modal/photo/page.tsx"); // "/photo"

// Detect parallel routes
hasParallelSegment("app/@modal/page.tsx"); // true
extractParallelSlots("app/@modal/@sidebar/page.tsx"); // ["modal", "sidebar"]

// Detect intercepting routes
hasInterceptingSegment("app/(.)photo/page.tsx"); // true
```

## See Also

- [Next.js Profile](../07-profiles/next.md)
- [Route Change Finding](../04-types/findings.md#routechangefinding)
- [SvelteKit Routes Analyzer](./route-detector.md)
