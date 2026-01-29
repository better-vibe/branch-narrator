---
"@better-vibe/branch-narrator": minor
---

Comprehensively improve Angular analyzers with richer metadata extraction and feature detection

**Angular Routes Analyzer:**
- Add route guard detection (canActivate, canDeactivate, canMatch, canLoad, canActivateChild)
- Add route resolver detection
- Add route data and title extraction
- Add loadComponent detection for standalone lazy components
- Add route modification detection (guards, resolvers, lazy loading changes)
- Add named outlet detection
- Add feature tags from diff content (standalone API features, navigation patterns, route events)
- Add wildcard catch-all route detection

**Angular Components Analyzer:**
- Add @Input() and @Output() property extraction via AST and regex
- Add signal-based input()/output()/model() detection (Angular 17+)
- Add change detection strategy detection (OnPush/Default)
- Add resolver file type detection
- Add companion template/style file co-change detection
- Add feature tags: lifecycle hooks, DI patterns, RxJS, signals, forms, HTTP, view queries, control flow, defer blocks
- Improve rendering with richer details table (inputs, outputs, CD strategy)

**Highlights:**
- Add Angular component changes to highlights system
