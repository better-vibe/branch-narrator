# Vue/Nuxt Routes Analyzer

**File:** `src/analyzers/vue-routes.ts`
**Finding Type:** `route-change`

## Purpose

Detects changes to Vue Router configuration and Nuxt file-based routes, including pages, server routes, and layouts.

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
}
```

## Detection Rules

### Nuxt Pages
| File Pattern | Description |
|--------------|-------------|
| `pages/*.vue` | Root page routes |
| `pages/**/*.vue` | Nested page routes |
| `src/pages/*.vue` | Alternative pages directory |
| `pages/**/*.ts` | TypeScript pages |

### Nuxt Server Routes
| File Pattern | Description |
|--------------|-------------|
| `server/api/**/*.ts` | API endpoints |
| `server/routes/**/*.ts` | Custom server routes |
| `server/middleware/**/*.ts` | Server middleware |

### Nuxt Layouts
| File Pattern | Description |
|--------------|-------------|
| `layouts/*.vue` | Layout components |
| `src/layouts/*.vue` | Alternative layouts directory |

### Vue Router Config
| File Pattern | Description |
|--------------|-------------|
| `router.ts` / `router.js` | Router config |
| `routes.ts` / `routes.js` | Routes definition |
| `router/index.ts` | Router directory |

## Route Path Conversion

Nuxt file paths are converted to route paths:

| File Path | Route Path |
|-----------|------------|
| `pages/index.vue` | `/` |
| `pages/about.vue` | `/about` |
| `pages/users/[id].vue` | `/users/:id` |
| `pages/blog/[...slug].vue` | `/blog/:slug*` |
| `pages/products/index.vue` | `/products` |

## HTTP Method Detection

For Nuxt server routes, HTTP methods are detected from filenames:

| File | Method |
|------|--------|
| `users.get.ts` | GET |
| `users.post.ts` | POST |
| `users.put.ts` | PUT |
| `users.delete.ts` | DELETE |
| `users.ts` | * (all methods) |

## Route Types

| Type | Description |
|------|-------------|
| `page` | Vue page component |
| `endpoint` | Server API route |
| `layout` | Layout component |
| `error` | Error page (e.g., error.vue) |
| `unknown` | Router config changes |

## Example Output

### New Nuxt Page

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/dashboard",
  "file": "pages/dashboard.vue",
  "change": "added",
  "routeType": "page"
}
```

### Nuxt Server Route

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "server/api/users.get.ts",
  "file": "server/api/users.get.ts",
  "change": "added",
  "routeType": "endpoint",
  "methods": ["GET"]
}
```

### Vue Router Config Change

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "medium",
  "routeId": "vue-router-config",
  "file": "src/router/index.ts",
  "change": "modified",
  "routeType": "unknown"
}
```

## Profiles

Included in:
- Vue profile
