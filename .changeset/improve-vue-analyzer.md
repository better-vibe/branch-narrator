---
"@better-vibe/branch-narrator": minor
---

Comprehensively improve Vue/Nuxt routes analyzer with expanded detection capabilities:

- Detect Nuxt app-level middleware files (middleware/*.ts) as route metadata
- Detect Nuxt error page (error.vue) as error route type
- Detect Nuxt app-level files (app.vue, app.config.ts) as template route type
- Distinguish default layout from named layouts (route type "default" vs "layout")
- Convert server route file paths to proper API paths (e.g., server/api/users.get.ts → /api/users)
- Support optional dynamic segments (pages/users/[[id]].vue → /users/:id?)
- Extract feature tags from diff content: definePageMeta, useFetch, useAsyncData, useRoute, useRouter, navigateTo, defineEventHandler, defineCachedEventHandler, defineWebSocketHandler, readValidatedBody, setResponseStatus, and more
- Parse Vue Router config diffs to extract individual route paths (added/removed)
- Detect Vue Router config features: createRouter, navigation guards, scroll behavior, lazy loading, route meta, nested routes, redirects, aliases
- Add deduplication and deterministic sorting of findings
- Add router/routes.ts to recognized Vue Router config patterns
