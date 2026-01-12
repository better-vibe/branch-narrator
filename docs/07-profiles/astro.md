# Astro Profile

**File:** `src/profiles/astro.ts`
**Profile Name:** `astro`

## Purpose

The Astro profile provides analyzers optimized for Astro projects, with support for file-based routing, content collections, API endpoints, and Astro-specific configuration.

## Detection

The Astro profile is automatically detected when:

1. **Astro dependency:** `astro` in package.json
2. **Astro config:** `astro.config.mjs`, `astro.config.ts`, or `astro.config.js` exists

```bash
# Force Astro profile
branch-narrator --profile astro
```

## Analyzers Included

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | File change summary |
| `file-category` | File categorization |
| `astro-routes` | Astro page and endpoint changes |
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

## Astro-Specific Detection

### Pages
```
src/pages/
├── index.astro          → /
├── about.astro          → /about
├── about.md             → /about
├── blog/
│   ├── index.astro      → /blog
│   └── [slug].astro     → /blog/:slug
└── docs/
    └── [...path].astro  → /docs/:path*
```

### API Endpoints
```
src/pages/
├── api/
│   └── users.ts         → GET, POST, etc.
└── api/
    └── health.js        → Health check
```

### Layouts
```
src/layouts/
├── BaseLayout.astro
├── BlogLayout.astro
└── DocsLayout.astro
```

### Content Collections
```
src/content/
├── blog/
│   ├── post-1.md
│   └── post-2.mdx
├── docs/
│   └── intro.md
└── authors/
    └── jane.json
```

## HTTP Method Detection

API endpoints export named functions for each HTTP method:

```typescript
// src/pages/api/users.ts
export const GET = async ({ params }) => { ... };
export const POST = async ({ request }) => { ... };
export const PUT = async ({ request }) => { ... };
export const DELETE = async ({ params }) => { ... };
export const PATCH = async ({ request }) => { ... };
export const ALL = async () => { ... };  // Catch-all
```

## Example Output

### Markdown Summary

```markdown
## Routes / API

| Route | Type | Change | Methods |
|-------|------|--------|---------|
| `/` | page | modified | - |
| `/api/users` | endpoint | added | GET, POST |
| `/blog/:slug` | page | added | - |
```

### JSON Finding

```json
{
  "type": "route-change",
  "routeId": "/api/users",
  "file": "src/pages/api/users.ts",
  "change": "added",
  "routeType": "endpoint",
  "methods": ["GET", "POST"]
}
```

### Content Collection Finding

```json
{
  "type": "route-change",
  "routeId": "/content/blog/new-post.md",
  "file": "src/content/blog/new-post.md",
  "change": "added",
  "routeType": "page",
  "tags": ["content-collection"]
}
```

## Special Route Types

| Type | Description | Example |
|------|-------------|---------|
| `page` | Astro/Markdown/MDX pages | `index.astro`, `about.md` |
| `endpoint` | API routes | `api/users.ts` |
| `layout` | Layout components | `layouts/Base.astro` |
| `error` | Error pages | `404.astro`, `500.astro` |

## Usage

```bash
# Auto-detect (recommended)
branch-narrator

# Force Astro profile
branch-narrator --profile astro

# JSON output
branch-narrator facts --profile astro
```

## Related Profiles

- **SvelteKit:** For SvelteKit projects
- **Next:** For Next.js projects
- **Vue:** For Vue/Nuxt projects
