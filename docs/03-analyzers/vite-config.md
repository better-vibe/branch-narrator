# Vite Config Analyzer

**File:** `src/analyzers/vite-config.ts`
**Finding Type:** `vite-config`

## Purpose

Detects changes to Vite configuration files, identifying potentially breaking changes to build settings, plugins, server configuration, and optimization options.

## Finding Type

```typescript
interface ViteConfigFinding {
  type: "vite-config";
  kind: "vite-config";
  category: "config_env";
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  status: FileStatus;
  isBreaking: boolean;
  affectedSections: string[];
  breakingReasons: string[];
  pluginsDetected: string[];
}
```

## Detection Rules

### Vite Config Files
| File Pattern | Description |
|--------------|-------------|
| `vite.config.ts` | TypeScript config |
| `vite.config.js` | JavaScript config |
| `vite.config.mjs` | ES Module config |
| `vite.config.mts` | TypeScript ES Module config |
| `vite.config.cjs` | CommonJS config |

## Critical Sections Tracked

### Top-Level Sections
- `build` - Build output configuration
- `server` - Development server settings
- `preview` - Preview server settings
- `resolve` - Module resolution
- `plugins` - Vite plugins
- `define` - Build-time constants
- `base` - Base public path
- `publicDir` - Static assets directory
- `envPrefix` - Environment variable prefix
- `optimizeDeps` - Dependency optimization
- `esbuild` - esbuild options
- `ssr` - Server-side rendering config

### Build Subsections
- `target` - Browser compatibility target
- `outDir` - Output directory
- `assetsDir` - Static assets directory
- `assetsInlineLimit` - Asset inlining threshold
- `cssCodeSplit` - CSS code splitting
- `sourcemap` - Sourcemap generation
- `minify` - Minification settings
- `rollupOptions` - Rollup bundler options
- `lib` - Library mode configuration
- `manifest` - Build manifest

### Server Subsections
- `host` - Server host
- `port` - Server port
- `proxy` - API proxy configuration
- `cors` - CORS settings
- `https` - HTTPS configuration
- `hmr` - Hot Module Replacement
- `watch` - File watching options

## Plugin Detection

The analyzer detects common Vite plugins:

| Plugin | Import Pattern |
|--------|----------------|
| React | `@vitejs/plugin-react` |
| Vue | `@vitejs/plugin-vue` |
| Vue JSX | `@vitejs/plugin-vue-jsx` |
| Legacy Browser Support | `@vitejs/plugin-legacy` |
| Svelte | `@sveltejs/vite-plugin-svelte` |
| PWA | `vite-plugin-pwa` |
| TypeScript Paths | `vite-tsconfig-paths` |
| Vitest | `vitest` |
| Angular | `@angular/build` |
| Solid | `vite-plugin-solid` |
| Qwik | `vite-plugin-qwik` |

## Breaking Change Detection

| Change Type | Reason |
|-------------|--------|
| Base path changed | Affects all asset URLs |
| Output directory changed | May affect deployment |
| Build target changed | Affects browser compatibility |
| Plugins modified | May affect build behavior |
| Path aliases modified | May break imports |
| Environment prefix changed | Affects env variable exposure |
| Build-time constants modified | May break runtime behavior |
| Sourcemap configuration changed | Affects debugging |
| SSR configuration changed | Affects server rendering |

## Example Output

### Plugin Change with Breaking Settings

```json
{
  "type": "vite-config",
  "kind": "vite-config",
  "category": "config_env",
  "confidence": "high",
  "file": "vite.config.ts",
  "status": "modified",
  "isBreaking": true,
  "affectedSections": ["build", "plugins", "build.target"],
  "breakingReasons": [
    "Build target changed (affects browser compatibility)"
  ],
  "pluginsDetected": ["React", "PWA"]
}
```

### Server Configuration Change

```json
{
  "type": "vite-config",
  "kind": "vite-config",
  "category": "config_env",
  "confidence": "medium",
  "file": "vite.config.ts",
  "status": "modified",
  "isBreaking": false,
  "affectedSections": ["server", "server.port", "server.proxy"],
  "breakingReasons": [],
  "pluginsDetected": ["Vue"]
}
```

## Profiles

Included in:
- Vite profile
- SvelteKit profile (via default analyzers)
- React profile (via default analyzers)
- Vue profile (via default analyzers)
- Astro profile (via default analyzers)

## Usage

The vite-config analyzer is automatically included in the Vite profile and runs when:
1. A project has `vite` as a dependency
2. A `vite.config.{ts,js,mjs,mts,cjs}` file is present

```bash
# Auto-detect Vite project
branch-narrator facts

# Force Vite profile
branch-narrator facts --profile vite
```

## Related Analyzers

- [vitest](./vitest.md) - Vitest test configuration
- [typescript-config](./typescript-config.md) - TypeScript configuration
- [tailwind](./tailwind.md) - Tailwind CSS configuration
