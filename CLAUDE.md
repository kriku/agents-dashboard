# CLAUDE.md — Multi-Tenant AI Agent Monitoring Dashboard

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **pnpm monorepo** containing a full-stack AI agent monitoring platform: a React dashboard, an Express.js BFF (backend-for-frontend), ClickHouse schema/seed tooling, and shared TypeScript types. The system provides predefined, read-only dashboard views for AI agent fleet metrics with tenant isolation enforced server-side.

The architecture follows a **server-owned query model** — the browser never sees SQL. The BFF translates named view requests into parameterized ClickHouse SQL, executes them, and returns structured JSON. Workspace isolation is enforced by injecting `workspace_id` from JWT claims into every query.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ WRITE PATH (Production Design)      READ PATH (Implemented)          │
│                                                                      │
│ AI Agents                           React Dashboard (port 3000)      │
│   → OTel Collector (DaemonSet)        → nginx reverse proxy          │
│     → API Gateway                       → Express.js BFF (port 3001) │
│       → Kafka (partitioned by ws)         → ClickHouse (port 8123)   │
│         → ClickHouse MergeTree                                       │
│                                     Grafana (Internal, planned)      │
│ (Mocked via seed data generator)      → ClickHouse datasource plugin │
└──────────────────────────────────────────────────────────────────────┘
```

### Tenant Hierarchy

Three-level: **Organization** (billing/identity boundary) → **Workspace** (trust/data isolation boundary) → **Project** (logical grouping).

All data isolation is enforced at the **workspace** level. The BFF extracts `workspace_id` from JWT claims and injects it as a parameterized value into every ClickHouse query — never from client-supplied values.

---

## Tech Stack

### Frontend (`packages/frontend/`)

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | **React** | 18+ | Functional components only |
| Language | **TypeScript** | 5.6 | Strict mode |
| Build tool | **Vite** | 6.x | Fast builds, native ESM |
| Time-series charts | **uPlot** + `uplot-react` | 1.6.x | 50KB, same lib Grafana uses |
| Complex charts | **Apache ECharts** + `echarts-for-react` | 5.5.x | Heatmaps, gauges, bar charts |
| Tables | **Ant Design** `Table` | 5.x | Sortable data tables |
| Data fetching | **TanStack Query** (React Query) | 5.x | Polling/refetch, stale-while-revalidate |
| Routing | **React Router** | 7.x | View-based page navigation |
| API mocking | **MSW** (Mock Service Worker) | 2.x | Network-level mocking for dev/test |

### BFF (`packages/bff/`)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | **Express.js** + TypeScript | ~35 parameterized SQL queries across 5 view modules |
| ClickHouse client | **@clickhouse/client-web** | HTTP interface, parameterized queries |
| Auth | **jsonwebtoken** | JWT validation, workspace_id extraction |
| Logging | **pino** | Structured JSON logging |

### Storage (`packages/clickhouse/`)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Database | **ClickHouse 24.3** | MergeTree tables, monthly partitioning, 90-day TTL |
| Schema | 6 tables + 3 materialized views | `init/001_create_tables.sql`, `init/002_materialized_views.sql` |
| Seed data | TypeScript generator | 30 days, 3 orgs, 5 workspaces, 10 agents, 15 tools, 4 models |

### Shared Types (`packages/shared/`)

TypeScript-only package exporting `ViewResponse`, `Panel`, `PanelData`, `PanelType`, `PanelUnit`, and runtime validators (`isPanel`, `isViewResponse`, `isMetricResult`).

---

## Project Structure

```
agent-monitor/                      # pnpm monorepo root
├── packages/
│   ├── frontend/                   # React 18 + TypeScript + Vite
│   │   ├── src/
│   │   │   ├── api/                # apiFetch() wrapper, fetchView(), fetchViewList()
│   │   │   ├── components/
│   │   │   │   ├── charts/         # TimeSeriesChart, StatChart, GaugeChart, HeatmapChart,
│   │   │   │   │                   # BarChart, TableChart, PanelRenderer
│   │   │   │   ├── layout/         # AppShell, ViewPage, PanelCard
│   │   │   │   └── auth/           # RequireAuth route guard
│   │   │   ├── contexts/           # WorkspaceContext (demo workspace switcher)
│   │   │   ├── hooks/              # useView (TanStack Query), useAuth (JWT in localStorage)
│   │   │   ├── pages/              # AgentOverview, ToolCallPerformance, LLMTokenUsage,
│   │   │   │                       # ErrorBreakdown, CostTracking, Login
│   │   │   ├── mocks/              # MSW handlers + bff-mock-data.ts (dev/test fallback)
│   │   │   ├── utils/              # formatters.ts (bytes, duration, rate, %, cost)
│   │   │   ├── __tests__/          # test-utils.tsx, views.test.ts
│   │   │   └── __fixtures__/       # factories.ts, panel/view fixtures
│   │   └── vitest.config.ts
│   ├── bff/                        # Express.js API server
│   │   ├── src/
│   │   │   ├── app.ts              # Express app factory, CORS, routes
│   │   │   ├── middleware/auth.ts  # JWT validation → req.user.workspace_id
│   │   │   ├── clickhouse/client.ts # ClickHouse HTTP client wrapper
│   │   │   ├── routes/             # views.ts, auth.ts (demo token endpoint)
│   │   │   └── queries/            # 5 view modules + helpers.ts + registry.ts
│   │   │       ├── agent-overview.ts
│   │   │       ├── tool-performance.ts
│   │   │       ├── llm-token-usage.ts
│   │   │       ├── error-breakdown.ts
│   │   │       └── cost-tracking.ts
│   │   ├── src/__tests__/          # SQL correctness, tenant isolation, auth, edge cases
│   │   └── vitest.config.ts
│   ├── clickhouse/                 # Schema and seed data
│   │   ├── init/                   # DDL: CREATE TABLE, materialized views
│   │   ├── seed/                   # Deterministic data generator (99K+ rows)
│   │   └── config/                 # allow-remote.xml for Docker
│   └── shared/                     # @agent-monitor/shared TypeScript types
│       └── src/views.ts            # ViewResponse, Panel, PanelData, validators
├── specs/                          # System design documents
│   ├── 00-core-requirements.md     # 41 requirements across 9 sections
│   ├── 01-development-plan.md      # 6-phase implementation roadmap
│   └── 02-test-scenarios.md        # Test pyramid, 130 scenarios
├── diagrams/                       # SVG architecture diagrams (3 files)
├── docker-compose.yml              # ClickHouse + BFF + Frontend
├── .github/workflows/ci.yml        # Lint → Test → Build → Deploy (GitHub Pages)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Key Design Decisions

### 1. Server-Owned Queries (Most Important Decision)

All SQL lives in the BFF as parameterized TypeScript query functions. The browser requests named endpoints (`GET /api/views/agent-overview`), and the BFF executes parameterized SQL against ClickHouse and returns structured JSON.

**This eliminates:** SQL injection, cross-workspace query manipulation, unbounded query DoS, cardinality exploration attacks, schema exposure.

**The tradeoff:** Tenants cannot explore data ad-hoc. An internal Grafana with the ClickHouse datasource plugin serves that need for platform engineers.

### 2. ClickHouse as Analytical Storage

ClickHouse (same engine used by Langfuse, Helicone, PostHog) handles both time-series ingestion and analytical queries in a single system. MergeTree tables with monthly partitioning and 90-day TTL. Three materialized views (`AggregatingMergeTree`) pre-aggregate hourly stats for agents, models, and tools using mergeable `quantileState()`.

### 3. No User-Editable Dashboards (Phase 1)

All dashboards are predefined and deployed via CI/CD. No dashboard CRUD, no user-supplied SQL, no query builder. Five static views with auto-refresh.

### 4. uPlot for Time-Series, ECharts for Everything Else

uPlot handles all time-series rendering (50KB bundle). ECharts fills gaps: heatmaps, gauges, bar charts (~1MB, tree-shakeable). Do NOT use Plotly.js (3.6MB) or `@grafana/ui` (not usable outside Grafana).

### 5. Tenant ID Derived from JWT, Never Client-Supplied

The BFF extracts `workspace_id` from authenticated JWT claims and injects it into every query as a parameterized value. The frontend has a demo workspace switcher that requests new tokens from `/api/auth/demo-token`.

---

## BFF API Contract

The frontend codes against a small, purpose-built API. TypeScript interfaces are in `packages/shared/src/views.ts`.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/views` | List available views → `ViewListItem[]` |
| `GET /api/views/{view_id}` | All panels for a view → `ViewResponse` |
| `GET /api/views/{view_id}/panels/{panel_id}` | Single panel → `Panel` |
| `GET /api/auth/demo-token?workspace={id}` | Issue a dev JWT for a demo workspace |
| `GET /api/health` | Liveness |

---

## ClickHouse Schema

**6 tables:**
- `agent_executions` — One row per agent invocation (status, duration, tokens, cost)
- `tool_calls` — One row per tool call (tool_name, duration, retry_count)
- `llm_requests` — One row per LLM API call (model, tokens, cost, TTFT)
- `agent_errors` — Denormalized error detail (error_type, stack_trace)
- `guardrail_validations` — Guardrail check results (pass/fail/warn)
- `workspaces` — Dimension table (org_id, workspace_name, tier)

**3 materialized views** (AggregatingMergeTree):
- `hourly_agent_stats` — Invocation count, error count, duration percentiles per agent per hour
- `hourly_model_usage` — Token counts, cost, latency percentiles per model per hour
- `hourly_tool_stats` — Call count, error count, duration percentiles per tool per hour

All tables: `ORDER BY (workspace_id, ..., timestamp)`, `PARTITION BY toYYYYMM(timestamp)`, `TTL timestamp + INTERVAL 90 DAY`.

---

## Predefined Views (Phase 1)

| View ID | Key Panels | Refresh |
|---------|------------|---------|
| `agent-overview` | Active agents (stat), invocation rate (timeseries), error rate (timeseries), p95 latency (timeseries), errors by type (bar), step distribution (heatmap) | 30s |
| `tool-call-performance` | Per-tool latency p50/p95/p99, tool error rates, call frequency, retry rate, slowest tools (table) | 30s |
| `llm-token-usage` | Total tokens (stat), tokens by model, prompt vs completion split, token rate, cost by model, top consumers (table) | 60s |
| `error-breakdown` | Total errors (stat), error rate trend, errors by type/agent/version, top error messages (table) | 30s |
| `cost-tracking` | Est. daily cost (stat), cost trend, cost by agent/model, cost per invocation, projected monthly | 300s |

---

## Frontend Patterns

### Page Component Pattern

Every page uses the shared `ViewPage` component with a layout grid:

```tsx
import ViewPage from '../components/layout/ViewPage';

const LAYOUT = [
  ['active_agents', 'invocation_rate', 'error_rate', 'p95_latency'],
  ['invocation_rate_by_agent'],
  ['errors_by_type', 'step_distribution_heatmap'],
];

export default function AgentOverview() {
  return <ViewPage viewId="agent-overview" layout={LAYOUT} />;
}
```

### useView Hook (TanStack Query)

```tsx
export function useView(viewId: string) {
  return useQuery({
    queryKey: ['view', viewId],
    queryFn: () => fetchView(viewId),
    refetchInterval: (query) =>
      (query.state.data?.view.refreshSec ?? 30) * 1000,
    staleTime: 10_000,
  });
}
```

### PanelRenderer Routing

Routes `panel.type` to the correct chart component: `TimeSeriesChart` (uPlot), `StatChart`, `GaugeChart`, `HeatmapChart`, `BarChart` (ECharts), `TableChart` (Ant Design).

---

## Development

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker
pnpm install

# Full stack via Docker
docker compose up -d
pnpm --filter @agent-monitor/clickhouse seed   # 30 days of realistic data
open http://localhost:3000

# Local development servers
pnpm dev:frontend    # Vite dev server (port 5173)
pnpm dev:bff         # BFF with hot reload (port 3001)
```

### Adding a New View

1. **Add ClickHouse queries** — create a new query module in `packages/bff/src/queries/` following existing patterns
2. **Register the view** — add the `ViewDefinition` to `packages/bff/src/queries/registry.ts`
3. **Create the React page** — add a page component in `packages/frontend/src/pages/` using `ViewPage`
4. **Add the route** — add route in `App.tsx` and nav entry in `AppShell.tsx`
5. **Add MSW mock** — add mock data in `packages/frontend/src/mocks/bff-mock-data.ts` for dev/test fallback

---

## Testing

### Test Pyramid

| Package | Tests | Runner | Scope |
|---------|-------|--------|-------|
| frontend | 187 | Vitest + RTL + MSW | Components, hooks, formatters, routing |
| bff | 78 | Vitest | SQL correctness, tenant isolation, auth, edge cases |
| clickhouse | 16 | Vitest | Seed data generator correctness |
| **Total** | **281** | | |

### Tooling

- **Vitest** — unit and integration tests (fast, Vite-native)
- **React Testing Library (RTL)** — component rendering and interaction
- **MSW (Mock Service Worker)** — API mocking at the network level for frontend tests
- **ClickHouse service container** — BFF tests run against real ClickHouse in CI

### Run Commands

```bash
pnpm test                                    # All packages (281 tests)
pnpm --filter @agent-monitor/frontend test   # Frontend only
pnpm --filter @agent-monitor/bff test        # BFF only (needs ClickHouse)
```

### Coverage Targets

- **Overall**: 90%+ lines, 85%+ branches
- **`utils/` and `types/`**: 100% lines and branches

---

## CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`):

1. **Lint** — `tsc --noEmit` for frontend + BFF
2. **Frontend Tests** — Vitest with MSW mocks (no external deps)
3. **BFF Integration Tests** — Vitest against real ClickHouse service container (schema applied, test data seeded)
4. **Build** — Vite production build (`VITE_MOCK_API=true` for static demo)
5. **Deploy** — GitHub Pages (main/master branch only)

---

## Security (Frontend Perspective)

- **JWT storage**: Tokens stored in localStorage, short-lived
- **No SQL exposure**: The frontend never constructs or sends SQL — all queries are server-owned
- **Workspace isolation**: `workspace_id` extracted from JWT claims server-side, injected as parameterized values
- **Demo workspace switcher**: Requests new tokens from `/api/auth/demo-token` — in production, workspace is derived from SSO claims
- **RBAC**: Phase 1 is authentication-only. Role field exists in JWT claims (`viewer`, `operator`, `admin`) but is not enforced for view access yet

---

## Code Style & Conventions

### TypeScript

- Functional components only, no class components
- Hooks for all state management (no Redux, no Zustand)
- TanStack Query for all server state — no manual fetch/useEffect patterns
- Strict TypeScript (`strict: true` in tsconfig)
- Component file naming: PascalCase for components, camelCase for hooks/utils
- Shared types in `packages/shared/`; package-local types co-located with usage

### SQL (BFF Queries)

- All queries use `{workspace_id: String}` parameterized placeholders — never string interpolation
- `workspace_id` always comes from `req.user.workspace_id` (JWT claims)
- Panel builder helpers in `queries/helpers.ts`: `statPanel()`, `timeseriesPanel()`, `barPanel()`, `tablePanel()`

### General

- All config via environment variables (12-factor)
- No hardcoded tenant IDs, URLs, or secrets in source code
- pnpm workspaces for monorepo dependency management

---

## What NOT to Build (Phase 1 Scope)

These are explicitly deferred to future phases:

- Natural-language query interface (requires LLM integration)
- AI-generated dashboards (requires LLM integration)
- User-configurable alert rules (separate alerting system)
- User-editable dashboards (predefined only)
- Interactive time range picker, filters, drill-down (static views only)
- Query builder or SQL editor
- Dashboard CRUD (create/edit/save/share)
- Production OIDC/SAML SSO (demo uses static JWTs)
- Kafka ingestion pipeline (demo uses seed data generator)
- Internal Grafana instance

---

## Reference Documents

| Document | Covers |
|----------|--------|
| `specs/00-core-requirements.md` | 41 requirements across 9 sections |
| `specs/01-development-plan.md` | 6-phase implementation roadmap with acceptance criteria |
| `specs/02-test-scenarios.md` | Test pyramid, 130 test scenarios, coverage targets |
| `diagrams/*.svg` | Architecture overview, write path, read path (3 SVG diagrams) |
| `packages/shared/src/views.ts` | TypeScript types matching BFF response shapes |
| `packages/frontend/src/mocks/bff-mock-data.ts` | Mock data for dev/test (MSW fallback) |
