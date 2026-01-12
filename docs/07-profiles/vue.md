# Vue Profile

**File:** `src/profiles/vue.ts`
**Profile Name:** `vue`

## Purpose

The Vue profile provides analyzers optimized for Vue.js and Nuxt projects, with support for Vue Router and Nuxt file-based routing.

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
| `vue-routes` | Vue Router and Nuxt route changes |
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
| `test-gaps` | Test coverage gaps |
| `sql-risks` | SQL risk patterns |
| `ci-workflows` | CI/CD security |
| `infra` | Infrastructure changes |
| `api-contracts` | API contract changes |

## Vue-Specific Detection

### Nuxt Pages
```
pages/
├── index.vue        → /
├── about.vue        → /about
├── users/
│   ├── index.vue    → /users
│   └── [id].vue     → /users/:id
└── [...slug].vue    → /:slug*
```

### Nuxt Server Routes
```
server/
├── api/
│   ├── users.ts        → All methods
│   ├── users.get.ts    → GET only
│   └── users.post.ts   → POST only
├── routes/
│   └── health.ts
└── middleware/
    └── auth.ts
```

### Nuxt Layouts
```
layouts/
├── default.vue
└── admin.vue
```

### Vue Router Config
```
src/
├── router.ts
├── routes.ts
└── router/
    └── index.ts
```

## Example Output

### Markdown Summary

```markdown
## Routes / API

| Route | Type | Change | Methods |
|-------|------|--------|---------|
| `/dashboard` | page | added | - |
| `/api/users` | endpoint | added | GET, POST |
| `/users/:id` | page | modified | - |
```

### JSON Finding

```json
{
  "type": "route-change",
  "routeId": "/users/:id",
  "file": "pages/users/[id].vue",
  "change": "modified",
  "routeType": "page"
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
