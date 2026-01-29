# Vue/Nuxt Routes Analyzer

**File:** `src/analyzers/vue-routes.ts`
**Finding Type:** `route-change`

## Purpose

Detects changes to Vue Router configuration and Nuxt file-based routes, including pages, server routes, layouts, middleware, error pages, and app-level files. Extracts feature tags from diff content for route metadata, navigation guards, data fetching, and server handler patterns.

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

### Nuxt Middleware (App-level)
| File Pattern | Description |
|--------------|-------------|
| `middleware/*.ts` | App-level route middleware |
| `src/middleware/*.ts` | Alternative middleware directory |

### Nuxt App-level Files
| File Pattern | Description |
|--------------|-------------|
| `error.vue` / `src/error.vue` | Error page |
| `app.vue` / `src/app.vue` | App root component |
| `app.config.ts` / `app.config.js` | App configuration |

### Vue Router Config
| File Pattern | Description |
|--------------|-------------|
| `router.ts` / `router.js` | Router config |
| `routes.ts` / `routes.js` | Routes definition |
| `router/index.ts` | Router directory |
| `router/routes.ts` | Separate routes file |

## Route Path Conversion

Nuxt file paths are converted to route paths:

| File Path | Route Path |
|-----------|------------|
| `pages/index.vue` | `/` |
| `pages/about.vue` | `/about` |
| `pages/users/[id].vue` | `/users/:id` |
| `pages/users/[[id]].vue` | `/users/:id?` (optional) |
| `pages/blog/[...slug].vue` | `/blog/:slug*` |
| `pages/products/index.vue` | `/products` |

Server route file paths are converted to API paths:

| File Path | Route Path |
|-----------|------------|
| `server/api/users.ts` | `/api/users` |
| `server/api/users/[id].get.ts` | `/api/users/:id` |
| `server/routes/health.ts` | `/health` |

## HTTP Method Detection

For Nuxt server routes, HTTP methods are detected from filenames:

| File | Method |
|------|--------|
| `users.get.ts` | GET |
| `users.post.ts` | POST |
| `users.put.ts` | PUT |
| `users.delete.ts` | DELETE |
| `users.patch.ts` | PATCH |
| `users.ts` | * (all methods) |

## Route Types

| Type | Description |
|------|-------------|
| `page` | Vue page component |
| `endpoint` | Server API route |
| `layout` | Non-default layout component |
| `default` | Default layout component |
| `error` | Error page (error.vue, 404.vue) |
| `metadata` | App-level middleware |
| `template` | App-level files (app.vue, app.config.ts) |
| `unknown` | Router config changes |

## Feature Tags

The analyzer extracts feature tags from diff content:

### Page/Component Tags
| Tag | Detected Pattern |
|-----|-----------------|
| `has-page-meta` | `definePageMeta()` |
| `has-route-rules` | `defineRouteRules()` |
| `uses-route` | `useRoute()` |
| `uses-router` | `useRouter()` |
| `has-navigation` | `navigateTo()` |
| `has-middleware` | `middleware:` property |
| `has-validation` | `validate()` |
| `has-async-data` | `useAsyncData()` |
| `has-fetch` | `useFetch()` |
| `lazy-data` | `useLazyAsyncData()` / `useLazyFetch()` |

### Server Route Tags
| Tag | Detected Pattern |
|-----|-----------------|
| `event-handler` | `defineEventHandler()` |
| `cached-handler` | `defineCachedEventHandler()` |
| `websocket-handler` | `defineWebSocketHandler()` |
| `validated-input` | `readValidatedBody()` / `getValidatedQuery()` |
| `reads-params` | `getRouterParams()` |
| `sets-status` | `setResponseStatus()` |
| `has-redirect` | `sendRedirect()` |

### Middleware Tags
| Tag | Detected Pattern |
|-----|-----------------|
| `route-middleware` | `defineNuxtRouteMiddleware()` |

### Vue Router Config Tags
| Tag | Detected Pattern |
|-----|-----------------|
| `creates-router` | `createRouter()` |
| `history-mode` | `createWebHistory()` |
| `hash-mode` | `createWebHashHistory()` |
| `memory-mode` | `createMemoryHistory()` |
| `global-guard` | `beforeEach()` / `beforeResolve()` |
| `global-hook` | `afterEach()` |
| `route-guard` | `beforeEnter:` |
| `scroll-behavior` | `scrollBehavior` |
| `lazy-loading` | `() => import()` / `defineAsyncComponent()` |
| `has-meta` | `meta:` |
| `nested-routes` | `children:` |
| `has-redirect` | `redirect:` |
| `has-alias` | `alias:` |
| `catch-all` | `/:pathMatch(.*)*` / `/:catchAll` |

## Vue Router Config Parsing

When a Vue Router config file is modified, the analyzer extracts individual route paths from the diff:

- **Added routes**: `path: '/...'` patterns in additions become separate findings with `change: "added"`
- **Removed routes**: `path: '/...'` patterns in deletions (not also in additions) become findings with `change: "deleted"`
- **Config finding**: A `vue-router-config` finding is always emitted for the config file itself

## Example Output

### New Nuxt Page with Features

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/dashboard",
  "file": "pages/dashboard.vue",
  "change": "added",
  "routeType": "page",
  "tags": ["has-page-meta", "has-fetch", "has-middleware"]
}
```

### Nuxt Server Route

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "/api/users",
  "file": "server/api/users.get.ts",
  "change": "added",
  "routeType": "endpoint",
  "methods": ["GET"],
  "tags": ["event-handler", "validated-input"]
}
```

### Nuxt Middleware

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "routeId": "middleware:auth",
  "file": "middleware/auth.ts",
  "change": "added",
  "routeType": "metadata",
  "tags": ["route-middleware", "has-navigation"]
}
```

### Vue Router Config with Extracted Routes

```json
[
  {
    "type": "route-change",
    "routeId": "/dashboard",
    "file": "src/router/index.ts",
    "change": "added",
    "routeType": "page",
    "tags": ["lazy-loading"]
  },
  {
    "type": "route-change",
    "routeId": "vue-router-config",
    "file": "src/router/index.ts",
    "change": "modified",
    "routeType": "unknown",
    "tags": ["creates-router", "history-mode", "global-guard"]
  }
]
```

## Profiles

Included in:
- Vue profile
- Default profile
