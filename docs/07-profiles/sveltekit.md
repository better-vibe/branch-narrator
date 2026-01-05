# SvelteKit Profile

Full-featured profile for SvelteKit fullstack applications.

## Detection

The SvelteKit profile is auto-detected when:

1. `src/routes/` directory exists, OR
2. `@sveltejs/kit` is in package.json dependencies

## Analyzers

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | Summarize file changes |
| `file-category` | Categorize files by type |
| `route-detector` | Detect SvelteKit routes |
| `supabase` | Scan Supabase migrations |
| `env-var` | Extract environment variables |
| `cloudflare` | Detect Cloudflare changes |
| `vitest` | Detect test changes |
| `dependencies` | Analyze package.json |
| `security-files` | Detect security-sensitive files |

## SvelteKit-Specific Features

### Route Detection

Detects routes under `src/routes/`:

| File | Type |
|------|------|
| `+page.svelte`, `+page.ts` | Page |
| `+layout.svelte`, `+layout.ts` | Layout |
| `+server.ts` | Endpoint |
| `+error.svelte` | Error |

### Route Groups

Handles SvelteKit route groups:

```
src/routes/(app)/dashboard/+page.svelte
```

- **Route ID**: `/(app)/dashboard`
- **URL Path**: `/dashboard` (group removed)

### HTTP Methods

Detects methods in `+server.ts`:

```typescript
export const GET = async () => { ... };
export const POST = async () => { ... };
```

### SvelteKit Env Imports

Detects env var imports:

```typescript
import { PUBLIC_API_URL } from '$env/static/public';
import { DATABASE_URL } from '$env/static/private';
```

## Test Plan Suggestions

When SvelteKit is detected:

```markdown
## Suggested Test Plan

- [ ] `bun run test` - Run test suite
- [ ] `bun run check` - Run SvelteKit type check
- [ ] Test `GET /api/users` endpoint
- [ ] Verify `/dashboard` page renders correctly
```

## Source

```typescript
// src/profiles/sveltekit.ts
export const sveltekitProfile: Profile = {
  name: "sveltekit",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    routeDetectorAnalyzer,
    supabaseAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
  ],
};
```

## Usage

```bash
# Auto-detect (if SvelteKit project)
branch-narrator pr-body

# Force SvelteKit profile
branch-narrator pr-body --profile sveltekit
```

