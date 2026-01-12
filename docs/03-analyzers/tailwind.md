# Tailwind CSS Analyzer

**File:** `src/analyzers/tailwind.ts`
**Finding Type:** `tailwind-config`

## Purpose

Detects changes to Tailwind CSS and PostCSS configuration files, identifying potentially breaking changes to themes, plugins, content paths, and other critical settings.

## Finding Type

```typescript
type TailwindConfigType = "tailwind" | "postcss";

interface TailwindConfigFinding {
  type: "tailwind-config";
  kind: "tailwind-config";
  category: "config_env";
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  status: FileStatus;
  configType: TailwindConfigType;
  isBreaking: boolean;
  affectedSections: string[];
  breakingReasons: string[];
}
```

## Detection Rules

### Tailwind Config Files
| File Pattern | Description |
|--------------|-------------|
| `tailwind.config.js` | JavaScript config |
| `tailwind.config.ts` | TypeScript config |
| `tailwind.config.cjs` | CommonJS config |
| `tailwind.config.mjs` | ES Module config |

### PostCSS Config Files
| File Pattern | Description |
|--------------|-------------|
| `postcss.config.js` | JavaScript config |
| `postcss.config.cjs` | CommonJS config |
| `postcss.config.mjs` | ES Module config |

## Critical Sections Tracked

### Top-Level Sections
- `content` - File patterns for class purging
- `theme` - Design tokens and customization
- `plugins` - Plugin configuration
- `presets` - Preset configurations
- `prefix` - Class prefix
- `important` - Important selector
- `darkMode` - Dark mode strategy
- `safelist` - Safelisted classes

### Theme Subsections
- `colors` - Color palette
- `spacing` - Spacing scale
- `screens` - Responsive breakpoints
- `fontFamily`, `fontSize`, `fontWeight`
- `extend` - Theme extensions

## Breaking Change Detection

| Change Type | Reason |
|-------------|--------|
| Content paths modified | May affect CSS purging |
| Class prefix changed | Requires updating all class names |
| Theme colors removed | May break existing color classes |
| Screen breakpoints changed | May affect responsive design |
| Plugins removed | May remove utility classes |
| Dark mode strategy changed | May break dark mode implementation |

## Example Output

### Content Path Change

```json
{
  "type": "tailwind-config",
  "kind": "tailwind-config",
  "category": "config_env",
  "confidence": "high",
  "file": "tailwind.config.ts",
  "status": "modified",
  "configType": "tailwind",
  "isBreaking": true,
  "affectedSections": ["content"],
  "breakingReasons": [
    "Content paths modified (may affect CSS purging)"
  ]
}
```

### Theme Extension

```json
{
  "type": "tailwind-config",
  "kind": "tailwind-config",
  "category": "config_env",
  "confidence": "medium",
  "file": "tailwind.config.js",
  "status": "modified",
  "configType": "tailwind",
  "isBreaking": false,
  "affectedSections": ["theme", "theme.extend"],
  "breakingReasons": []
}
```

## Profiles

Included in:
- Vue profile
- Astro profile
