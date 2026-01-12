---
"@better-vibe/branch-narrator": minor
---

Add new analyzers and profiles for enhanced framework detection

**New Analyzers:**
- `graphql`: Detect GraphQL schema changes with breaking change detection
- `typescript-config`: Detect tsconfig.json changes and strictness modifications
- `tailwind`: Detect Tailwind CSS and PostCSS configuration changes
- `monorepo`: Detect monorepo config changes (Turborepo, pnpm, Lerna, Nx, Yarn, Changesets)
- `package-exports`: Detect package.json exports field changes for library authors
- `vue-routes`: Detect Vue Router and Nuxt file-based route changes
- `astro-routes`: Detect Astro page, endpoint, and content collection changes

**New Profiles:**
- `vue`: Profile for Vue.js and Nuxt projects
- `astro`: Profile for Astro projects
- `library`: Profile for npm package/library development focused on API surface changes

**New Finding Types:**
- `graphql-change`: GraphQL schema modifications
- `typescript-config`: TypeScript configuration changes
- `tailwind-config`: Tailwind CSS configuration changes
- `monorepo-config`: Monorepo tool configuration changes
- `package-exports`: Package entry point changes
