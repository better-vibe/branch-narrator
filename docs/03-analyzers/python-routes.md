# Python Routes Analyzer

Detects route/endpoint changes in Python web frameworks.

## File Location

`src/analyzers/python-routes.ts`

## Finding Type

`RouteChangeFinding`

## Supported Frameworks

### FastAPI

Detects route decorators:
- `@app.get("/path")`
- `@router.post("/path")`
- `@app.api_route("/path")`

Detected file patterns: `routers.py`, `endpoints.py`, `api.py`, `main.py`, `app.py`, `routes.py`

### Django

Detects URL patterns:
- `path('route/', view)`
- `re_path(r'^route/$', view)`
- `url(r'^route/$', view)`

Detected file patterns: `urls.py`

### Flask

Detects route decorators:
- `@app.route("/path")`
- `@blueprint.route("/path", methods=["GET", "POST"])`

Detected file patterns: `views.py`, `routes.py`, `app.py`, `api.py`, `__init__.py`

## Detection Rules

1. **Framework detection**: Identifies framework from imports and patterns
2. **Route extraction**: Parses route paths and HTTP methods
3. **Change detection**: Tracks added, modified, and deleted routes
4. **Path normalization**: Converts framework-specific paths to standard format

## Example Output

```json
{
  "type": "route-change",
  "kind": "route-change",
  "category": "routes",
  "confidence": "high",
  "evidence": [
    {
      "file": "app/routers.py",
      "excerpt": "@router.get(\"/users\")"
    }
  ],
  "routeId": "/users",
  "file": "app/routers.py",
  "change": "added",
  "routeType": "endpoint",
  "methods": ["GET"]
}
```

## Route ID Normalization

| Framework | Original | Normalized |
|-----------|----------|------------|
| Django | `users/` | `/users` |
| Django | `^api/v1/items/$` | `/api/v1/items` |
| FastAPI | `/users/{id}` | `/users/{id}` |
| Flask | `/api/users` | `/api/users` |

## Profile Inclusion

- Python profile (primary)
