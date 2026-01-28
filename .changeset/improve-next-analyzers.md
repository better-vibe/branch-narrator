---
"@better-vibe/branch-narrator": minor
---

Comprehensively improve Next.js analyzers with full App Router convention support

- Add missing route file types: template, default, global-error (all JS/TS extensions)
- Add proper RouteType values: "loading", "template", "default", "metadata"
- Detect Next.js metadata file conventions: sitemap, robots, manifest, opengraph-image, twitter-image, icon, apple-icon
- Generate findings for next.config changes (new NextConfigChangeFinding type with feature detection)
- Support next.config.cjs
- Detect instrumentation.ts as security-sensitive file
- Handle parallel routes (@folder convention) with tags
- Handle intercepting routes ((.)folder convention) with tags
- Detect Server Actions ("use server" directive) as route tags
- Detect generateStaticParams and generateMetadata exports as route tags
- Enrich route highlights with page/endpoint/layout breakdown
- Add next.config change highlights with experimental/routing feature awareness
- Add risk scoring for next.config changes
