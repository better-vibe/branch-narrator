# Astro Routes Analyzer

**File:** `src/analyzers/astro-routes.ts`
**Finding Type:** `route-change`

## Purpose

Detects changes to Astro pages, API endpoints, layouts, content collections, and configuration files.

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
  methods?: string[];
  tags?: string[];
}
```

## Detection Rules

### Astro Pages
| File Pattern | Description |
|--------------|-------------|
| `src/pages/*.astro` | Astro page components |
| `src/pages/*.md` | Markdown pages |
| `src/pages/*.mdx` | MDX pages |
| `src/pages/*.html` | HTML pages |

### API Endpoints
| File Pattern | Description |
|--------------|-------------|
| `src/pages/**/*.ts` | TypeScript endpoints |
| `src/pages/**/*.js` | JavaScript endpoints |

### Layouts
| File Pattern | Description |
|--------------|-------------|
| `src/layouts/*.astro` | Layout components |

### Content Collections
| File Pattern | Description |
|--------------|-------------|
| `src/content/**/*.md` | Markdown content |
| `src/content/**/*.mdx` | MDX content |
| `src/content/**/*.json` | JSON content |
| `src/content/**/*.yaml` | YAML content |

### Configuration
| File Pattern | Description |
|--------------|-------------|
| `astro.config.mjs` | Astro config (ESM) |
| `astro.config.ts` | Astro config (TS) |
| `astro.config.js` | Astro config (JS) |

## Route Path Conversion

Astro file paths are converted to route paths:

| File Path | Route Path |
|-----------|------------|
| `src/pages/index.astro` | `/` |
| `src/pages/about.astro` | `/about` |
| `src/pages/blog/[slug].astro` | `/blog/:slug` |
| `src/pages/docs/[...path].astro` | `/docs/:path*` |
| `src/pages/posts/index.md` | `/posts` |

## HTTP Method Detection

For API endpoints, HTTP methods are detected from exports:

```typescript
// src/pages/api/users.ts
export const GET = async () => { ... };
export const POST = async () => { ... };
export const PUT = async () => { ... };
export const DELETE = async () => { ... };
export const PATCH = async () => { ... };
export const ALL = async () => { ... };  // All methods
```

## Route Types

| Type | Description |
|------|-------------|
| `page` | Astro page/Markdown file |
| `endpoint` | API route (.ts/.js in pages) |
| `layout` | Layout component |
| `error` | Error page (404.astro, 500.astro) |
| `unknown` | Config file changes |

## Content Collections

Content collection changes are tagged with `content-collection`:

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "routeId": "/content/blog/new-post.md",
  "file": "src/content/blog/new-post.md",
  "change": "added",
  "routeType": "page",
  "tags": ["content-collection"]
}
```

## Example Output

### New Astro Page

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/dashboard",
  "file": "src/pages/dashboard.astro",
  "change": "added",
  "routeType": "page"
}
```

### API Endpoint with Methods

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/api/users",
  "file": "src/pages/api/users.ts",
  "change": "added",
  "routeType": "endpoint",
  "methods": ["GET", "POST"]
}
```

### Error Page

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/404",
  "file": "src/pages/404.astro",
  "change": "added",
  "routeType": "error"
}
```

### Config Change

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "medium",
  "routeId": "astro-config",
  "file": "astro.config.mjs",
  "change": "modified",
  "routeType": "unknown"
}
```

## Profiles

Included in:
- Astro profile
