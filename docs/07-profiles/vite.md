# Vite Profile

Full-featured profile for Vite-based projects that don't match a more specific framework profile.

## Detection

The Vite profile is auto-detected when:

1. `vite` is in package.json dependencies (dev or prod), AND
2. No more specific framework is detected (SvelteKit, Next.js, React Router, Vue/Nuxt, Astro, Angular)

**Detection Priority:**
The Vite profile has lower priority than framework-specific profiles. For example:
- A React + Vite project with React Router will use the **React** profile
- A Vue + Vite project will use the **Vue** profile
- A vanilla Vite project (or Vite with vanilla JS/TS) will use the **Vite** profile

## Analyzers

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | Summarize file changes |
| `file-category` | Categorize files by type |
| `env-var` | Extract environment variables (including `import.meta.env`) |
| `cloudflare` | Detect Cloudflare changes |
| `vitest` | Detect test changes |
| `dependencies` | Analyze package.json |
| `security-files` | Detect security-sensitive files |
| `impact` | Analyze blast radius of changes |
| `vite-config` | Detect Vite config changes |
| `tailwind` | Detect Tailwind CSS config changes |
| `typescript-config` | Detect TypeScript config changes |
| `large-diff` | Detect large changesets |
| `lockfiles` | Detect lockfile/manifest mismatches |
| `test-gaps` | Detect production code changes without tests |
| `sql-risks` | Detect risky SQL in migrations |
| `ci-workflows` | Detect CI/CD workflow changes |
| `infra` | Detect infrastructure changes |
| `api-contracts` | Detect API contract changes |

## Vite-Specific Features

### Vite Config Change Detection

Detects changes to Vite configuration files:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  plugins: [],
});
```

Detected changes:
- Build configuration (outDir, target, sourcemap)
- Server settings (port, proxy, cors)
- Plugin additions/removals
- Environment prefix changes
- SSR configuration

### Breaking Change Detection

The analyzer identifies potentially breaking changes:

| Change | Impact |
|--------|--------|
| `base` path changed | All asset URLs affected |
| `outDir` changed | Deployment may break |
| `target` changed | Browser compatibility affected |
| `resolve.alias` removed | Import paths may break |
| `envPrefix` changed | Env variables may not be exposed |
| `define` constants removed | Runtime errors possible |

### Environment Variable Detection

Detects Vite-style environment variables:

```typescript
// Using import.meta.env
const apiUrl = import.meta.env.VITE_API_URL;
const apiKey = import.meta.env.VITE_API_KEY;
const mode = import.meta.env.MODE;
const dev = import.meta.env.DEV;
```

Pattern: `import.meta.env.VITE_[A-Z0-9_]+`

Also detects:
- `import.meta.env.MODE`
- `import.meta.env.DEV`
- `import.meta.env.PROD`
- `import.meta.env.SSR`
- `import.meta.env.BASE_URL`

### Plugin Detection

The vite-config analyzer detects common plugins:

- `@vitejs/plugin-react` - React support
- `@vitejs/plugin-vue` - Vue support
- `@vitejs/plugin-vue-jsx` - Vue JSX support
- `@vitejs/plugin-legacy` - Legacy browser support
- `@sveltejs/vite-plugin-svelte` - Svelte support
- `vite-plugin-pwa` - PWA support
- `vite-tsconfig-paths` - TypeScript paths support
- `vitest` - Vitest integration

## Detection Logic

```typescript
function detectProfile(changeSet: ChangeSet): ProfileName {
  // 1. Check for specific frameworks first (SvelteKit, React, Next.js, etc.)
  // ...

  // 2. Check for Vite (generic Vite project)
  if (hasViteDependency(changeSet.headPackageJson)) {
    if (hasViteConfig(cwd)) {
      return "vite"; // High confidence
    }
    return "vite"; // Medium confidence
  }

  // 3. Default
  return "auto";
}
```

## Source

```typescript
// src/profiles/vite.ts
export const viteProfile: Profile = {
  name: "vite",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
    impactAnalyzer,
    viteConfigAnalyzer,
    tailwindAnalyzer,
    typescriptConfigAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
```

## Usage

```bash
# Auto-detect (if Vite project without specific framework)
branch-narrator pr-body

# Force Vite profile
branch-narrator pr-body --profile vite

# Preview changes with Vite profile
branch-narrator pretty --profile vite

# Get JSON facts with Vite analysis
branch-narrator facts --profile vite
```

## Example PR Output

```markdown
## Vite Configuration

| Setting | Change |
|---------|--------|
| `build.target` | `es2020` → `esnext` |
| `build.sourcemap` | added |
| `server.port` | `5173` → `3000` |

**Breaking Changes:**
- Build target changed (affects browser compatibility)

## Environment Variables

- `VITE_API_URL`
- `VITE_API_KEY`
- `VITE_APP_NAME`
```

## When to Use

Use the Vite profile when:
- Building a vanilla Vite project (without specific framework)
- Building a Vite-based library
- Using Vite with a framework not specifically supported
- Want detailed Vite config change detection

Don't use when:
- Using React with React Router (use React profile)
- Using Vue or Nuxt (use Vue profile)
- Using SvelteKit (use SvelteKit profile)
- Using Next.js (use Next.js profile)
- Using Astro (use Astro profile)

## Comparison with Other Profiles

| Feature | Vite Profile | React Profile | Vue Profile |
|---------|--------------|---------------|-------------|
| **Vite Config** | Full detection | Basic (via vitest) | Basic (via vitest) |
| **Route Detection** | None | React Router | Vue Router |
| **Env Vars** | `import.meta.env` | `import.meta.env` + CRA | `import.meta.env` |
| **Auto-detected** | Vite + no framework | React + Router | Vue/Nuxt |

## Requirements

For Vite profile detection:
- `vite` must be in package.json (dependencies or devDependencies)
- No more specific framework should be detected

For vite-config analyzer:
- `vite.config.{ts,js,mjs,mts,cjs}` must exist in the changeset

## Limitations

- Does not detect framework-specific routing (use framework profiles instead)
- Plugin detection is based on import patterns, not actual plugin configuration
- Cannot detect runtime configuration changes
