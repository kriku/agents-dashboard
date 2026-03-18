# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant AI agent fleet monitoring dashboard. Provides predefined, read-only metrics views to tenants while platform engineers use internal Grafana for ad-hoc exploration. Both consume the same Grafana Mimir backend.

**Status:** Planning/specification phase — architecture docs and mock data exist, source code is not yet implemented.

## Architecture

### Core Design: Server-Owned Queries

All PromQL lives in the BFF (Go), never in the frontend. The browser requests named data endpoints (e.g., `GET /api/views/agent-overview`) with no PromQL visible or controllable by the client. This eliminates PromQL injection, query DoS, and cross-tenant data access risks.

### Stack

- **BFF:** Go 1.22+, `net/http` stdlib, `golang-jwt/jwt/v5`, `golang.org/x/sync/semaphore`, Prometheus client
- **Frontend:** React 18+, TypeScript 5.x, Vite 6.x, uPlot (time-series), ECharts (heatmaps/gauges/bars), Ant Design 5.x, TanStack Query 5.x, React Router 7.x
- **Metrics Store:** Grafana Mimir (multi-tenant PromQL engine) with Memcached result cache
- **Auth:** IAM Service issuing JWTs, JWKS endpoint for validation

### Request Flow

1. Browser sends `GET /api/views/{view_id}` with JWT
2. BFF validates JWT, extracts `org_id` + `ws_id` from claims
3. BFF derives `X-Scope-OrgID: org-{org_id}__ws-{ws_id}` (never from client input)
4. BFF executes all panel PromQL queries in parallel against Mimir with bounded per-workspace concurrency
5. BFF assembles and returns view response

### BFF API Surface

```
GET /api/views                              → List available views
GET /api/views/{view_id}                    → All panel data for a view (auth required)
GET /api/views/{view_id}/panels/{panel_id}  → Single panel refresh (auth required)
GET /api/health                             → Liveness
GET /api/ready                              → Readiness (Mimir reachable)
```

### Five Predefined Views

| View ID | Refresh | Description |
|---------|---------|-------------|
| `agent-overview` | 30s | Active agents, invocation rates, error rates, latency, guardrails |
| `tool-call-performance` | 30s | Tool call latency percentiles, frequency, error rates by tool |
| `llm-token-usage` | 60s | Token rates by model, input/output breakdown, LLM latency, cost |
| `error-breakdown` | 30s | Error trends by type/agent/stage/version, top error messages |
| `cost-tracking` | 300s | Daily/monthly cost estimates, cost per invocation by agent/model |

Panel types: `timeseries`, `stat`, `gauge`, `heatmap`, `bar`, `table`

### Multi-Tenancy

Three-level hierarchy: Organization → Workspace → Project. Data isolation enforced at workspace level via Mimir's `X-Scope-OrgID`. JWT claims (`org_id`, `ws_id`) are the sole source of tenant identity — never trust client-supplied values.

## Key Documentation Files

- `specs/metrics-dashboard-read-path-architecture.md` — Full Phase 1 (v2.0) architecture spec
- `specs/monitoring-system-requirements-v5.md` — Functional + non-functional requirements
- `specs/bff-mock-data.ts` — Mock data with exact JSON response shapes (source of truth for frontend contracts)
- `specs/metrics-read-path-architecture.mermaid` — Full read path flowchart
- `specs/metrics-write-path.mermaid` — OTel → Mimir write path

## Implementation Constraints

- **X-Scope-OrgID must always be derived from JWT claims** — never accept tenant ID from client
- **All PromQL is predefined in BFF Go structs** — no client-supplied queries
- **Per-workspace semaphore** for Mimir query concurrency (not global)
- **JWT tokens ≤1 hour lifetime**, refresh rotation required
- **Audit logging** on every view request (workspace, user, view, latency, status)
- **`specs/bff-mock-data.ts` shapes must match BFF output exactly** — frontend contracts depend on it

## Adding a New View

1. Prototype PromQL in internal Grafana against real tenant data
2. Add view definition as Go struct in BFF (`pkg/views/definitions.go`)
3. Create React page component using `useView(viewId)` hook
4. Add route in `src/App.tsx`
5. No database migrations or config changes needed — all code
