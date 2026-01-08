---
"@better-vibe/branch-narrator": minor
---

Add Next.js profile with App Router support

- New `next` profile for Next.js 13+ App Router projects
- Route detection for `app/` directory (pages, layouts, loading, error, not-found)
- API route detection (`route.ts`) with HTTP method extraction (GET, POST, etc.)
- Middleware change detection flagged as security-sensitive
- Support for route groups `(name)` and dynamic segments `[slug]`, `[...slug]`, `[[...slug]]`
- Auto-detection based on `next` dependency and `app/` directory presence
