---
"@better-vibe/branch-narrator": minor
---

Add Angular framework support with routes and components analyzers

This release adds comprehensive Angular framework support to branch-narrator:

- **New Analyzers:**
  - `angular-routes` - Detects Angular Router configuration changes (RouterModule.forRoot/forChild, provideRouter)
  - `angular-components` - Tracks Angular components, modules, services, directives, pipes, guards, and interceptors

- **New Profile:**
  - `angular` - Auto-detected Angular profile with all Angular-specific analyzers
  - Detects Angular projects via @angular/core dependency or angular.json config

- **Features:**
  - Full support for Angular 2-17+ routing patterns
  - Support for both NgModule-based and standalone components
  - Lazy route detection (loadChildren)
  - Redirect route tracking
  - Nested route hierarchy support
  - Component decorator extraction (selector, standalone, providers)

- **Documentation:**
  - Added `docs/03-analyzers/angular-routes.md`
  - Added `docs/03-analyzers/angular-components.md`
  - Added `docs/07-profiles/angular.md`

- **Tests:**
  - Comprehensive test coverage for both analyzers
  - 100+ test cases covering various Angular patterns
