# Profiles Overview

Profiles define which analyzers run for a given project type.

## What is a Profile?

A profile is a collection of analyzers optimized for a specific framework or project type.

```typescript
interface Profile {
  name: ProfileName;
  analyzers: Analyzer[];
}
```

## Profile Resolution

```mermaid
flowchart TD
    A[CLI: --profile option] --> B{Value?}
    B -->|"auto"| C[detectProfile]
    B -->|"sveltekit"| D[Use SvelteKit]

    C --> E{src/routes exists?}
    E -->|Yes| D
    E -->|No| F{@sveltejs/kit in package.json?}
    F -->|Yes| D
    F -->|No| J{react + react-router-dom?}
    J -->|Yes| K{next in package.json?}
    K -->|No| L[Use React]
    K -->|Yes| G[Use Default]
    J -->|No| G[Use Default]

    D --> H[SvelteKit Analyzers]
    L --> M[React Analyzers]
    G --> I[Default Analyzers]
```

## Available Profiles

| Profile | Description | Detection |
|---------|-------------|-----------|
| `sveltekit` | SvelteKit fullstack apps | `src/routes/` or `@sveltejs/kit` |
| `react` | React + React Router apps | `react` + `react-router-dom` (no `next`) |
| `auto` (default) | Generic projects | Fallback when no framework detected |

## Profile Comparison

```mermaid
graph LR
    subgraph Default["Default Profile"]
        D1[file-summary]
        D2[file-category]
        D3[env-var]
        D4[cloudflare]
        D5[vitest]
        D6[dependencies]
        D7[security-files]
        D8[test-parity]
        D9[impact]
    end

    subgraph SvelteKit["SvelteKit Profile"]
        S1[file-summary]
        S2[file-category]
        S3[route-detector]
        S4[supabase]
        S5[env-var]
        S6[cloudflare]
        S7[vitest]
        S8[dependencies]
        S9[security-files]
    end

    subgraph React["React Profile"]
        R1[file-summary]
        R2[file-category]
        R3[react-router-routes]
        R4[env-var]
        R5[cloudflare]
        R6[vitest]
        R7[dependencies]
        R8[security-files]
    end
```

**Default-specific:**
- `test-parity` - Convention enforcement for test coverage
- `impact` - Blast radius analysis for modified files

**SvelteKit-specific:**
- `route-detector` - SvelteKit routes
- `supabase` - Migration analysis

**React-specific:**
- `react-router-routes` - React Router route detection

## API

```typescript
// Resolve profile name (auto-detect if needed)
function resolveProfileName(
  requested: ProfileName,
  changeSet: ChangeSet,
  cwd: string
): ProfileName;

// Get profile configuration
function getProfile(name: ProfileName): Profile;

// Check for SvelteKit
function isSvelteKitProject(changeSet: ChangeSet, cwd: string): boolean;
```

## Usage

```bash
# Auto-detect profile
branch-narrator pr-body

# Force specific profile
branch-narrator pr-body --profile sveltekit
```

## Planned Profiles

| Profile | Framework | Status |
|---------|-----------|--------|
| `nextjs` | Next.js | 🔮 Planned |
| `astro` | Astro | 🔮 Planned |
| `remix` | Remix | 🔮 Planned |

