# Vue Profile

**File:** `src/profiles/vue.ts`
**Profile Name:** `vue`

## Purpose

The Vue profile provides analyzers optimized for Vue.js and Nuxt projects, with comprehensive support for Vue Router and Nuxt file-based routing, including feature detection via diff content analysis.

## Detection

The Vue profile is automatically detected when:

1. **Nuxt dependency found:** `nuxt` in package.json
2. **Vue with pages directory:** `vue` in package.json + `pages/` or `src/pages/` directory
3. **Vue only:** `vue` in package.json (medium confidence)

```bash
# Force Vue profile
branch-narrator --profile vue
```

## Analyzers Included

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | File change summary |
| `file-category` | File categorization |
| `vue-routes` | Vue Router, Nuxt routes, middleware, error pages, app files |
| `env-var` | Environment variable changes |
| `cloudflare` | Cloudflare configuration |
| `vitest` | Test file changes |
| `dependencies` | Package dependency changes |
| `security-files` | Security-sensitive file changes |
| `impact` | Blast radius analysis |
| `tailwind` | Tailwind CSS configuration |
| `typescript-config` | TypeScript configuration |
| `large-diff` | Large changeset warnings |
| `lockfiles` | Lockfile mismatch detection |
| `sql-risks` | SQL risk patterns |
| `ci-workflows` | CI/CD security |
| `infra` | Infrastructure changes |
| `api-contracts` | API contract changes |

## Vue-Specific Detection

### Nuxt Pages
```
pages/
├── index.vue          → /
├── about.vue          → /about
├── users/
│   ├── index.vue      → /users
│   ├── [id].vue       → /users/:id
│   └── [[id]].vue     → /users/:id? (optional)
└── [...slug].vue      → /:slug*
```

### Nuxt Server Routes
```
server/
├── api/
│   ├── users.ts          → /api/users (all methods)
│   ├── users.get.ts      → /api/users (GET)
│   ├── users.post.ts     → /api/users (POST)
│   └── users/[id].get.ts → /api/users/:id (GET)
├── routes/
│   └── health.ts         → /health
└── middleware/
    └── auth.ts
```

### Nuxt Layouts
```
layouts/
├── default.vue    → route type: "default"
└── admin.vue      → route type: "layout"
```

### Nuxt Middleware (App-level)
```
middleware/
├── auth.ts        → middleware:auth (route type: "metadata")
└── redirect.ts    → middleware:redirect (route type: "metadata")
```

### Nuxt App-level Files
```
error.vue          → route type: "error"
app.vue            → route type: "template"
app.config.ts      → route type: "template"
```

### Vue Router Config
```
src/
├── router.ts
├── routes.ts
└── router/
    ├── index.ts
    └── routes.ts
```

## Feature Detection (Tags)

The analyzer extracts feature tags from diff content for richer findings:

- **Page features:** `definePageMeta`, `useFetch`, `useAsyncData`, `useRoute`, `useRouter`, `navigateTo`, `middleware`
- **Server handler features:** `defineEventHandler`, `defineCachedEventHandler`, `defineWebSocketHandler`, `readValidatedBody`, `getValidatedQuery`, `setResponseStatus`, `sendRedirect`
- **Middleware features:** `defineNuxtRouteMiddleware`
- **Router config features:** `createRouter`, `createWebHistory`, `beforeEach`, `beforeResolve`, `afterEach`, `scrollBehavior`, lazy loading, route guards, meta, nested routes, redirects, aliases

## Example Output

### Markdown Summary

```markdown
## Routes / API

| Route | Type | Change | Methods |
|-------|------|--------|---------|
| `/dashboard` | page | added | - |
| `/api/users` | endpoint | added | GET, POST |
| `/users/:id` | page | modified | - |
| `middleware:auth` | metadata | added | - |
```

### JSON Finding

```json
{
  "type": "route-change",
  "routeId": "/users/:id",
  "file": "pages/users/[id].vue",
  "change": "modified",
  "routeType": "page",
  "tags": ["has-page-meta", "has-fetch"]
}
```

## Usage

```bash
# Auto-detect (recommended)
branch-narrator

# Force Vue profile
branch-narrator --profile vue

# JSON output
branch-narrator facts --profile vue
```

## Related Profiles

- **React:** For React Router projects
- **Next:** For Next.js projects
- **Astro:** For Astro projects
