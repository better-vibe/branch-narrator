---
"@better-vibe/branch-narrator": minor
---

## New Analyzers

Added 5 new analyzers for modern web framework detection:

### Drizzle ORM Analyzer
- Detects changes to Drizzle schema files (`*.schema.ts`, `schema/**/*.ts`)
- Detects Drizzle migration SQL files
- Identifies breaking changes like removed tables, columns, or constraints
- Added to: default, next, react, vue, astro, sveltekit, vite, library profiles

### TanStack Query Analyzer
- Detects changes to React Query hooks (`useQuery`, `useMutation`, `useInfiniteQuery`)
- Identifies cache-affecting changes (query keys, staleTime, gcTime)
- Flags removed hooks as breaking changes
- Added to: next, react profiles

### tRPC v11 Router Analyzer
- Detects changes to tRPC v11 routers and procedures
- Identifies procedure additions, removals, and modifications
- Detects breaking changes in input/output schemas
- Added to: next, react, vue, sveltekit profiles

### Svelte 5 Runes Analyzer
- Detects changes to Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$inspect`, `$bindable`)
- Identifies Svelte 4 to 5 migration patterns
- Detects breaking rune changes
- Added to: sveltekit profile

### Next.js RSC Boundary Analyzer
- Detects changes to React Server Components boundaries
- Monitors "use client" and "use server" directive changes
- Identifies breaking changes when removing directives from browser-dependent code
- Added to: next profile

All analyzers include comprehensive test suites with 100+ test cases combined.
