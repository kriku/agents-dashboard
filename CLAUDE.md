# CLAUDE.md — Multi-Tenant AI Agent Monitoring Dashboard

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **frontend application** for a multi-tenant AI agent monitoring platform. It is a React SPA that renders predefined, read-only dashboard views for AI agent fleet metrics.

**Scope of this repo:** This repository contains only the custom dashboard frontend. The Go BFF (Backend-for-Frontend) is a separate service, not implemented here. During development, all data comes from mock responses defined in `src/mocks/bff-mock-data.ts`.

The architecture follows a **predefined, read-only dashboard model** (Phase 1) where all queries are server-owned — the browser never sends or sees PromQL. The BFF translates named view requests into PromQL, executes against Mimir, and returns structured JSON. This frontend consumes that JSON.

There are two consumers of the same Grafana Mimir backend:
1. **Custom Dashboard** (this repo) — tenant-facing React SPA with predefined views, served via a Go BFF
2. **Internal Grafana** — platform-engineer-only tool for ad-hoc exploration and hypothesis testing

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ WRITE PATH                          READ PATH                        │
│                                                                       │
│ AI Agents                           Custom Dashboard (React)          │
│   → OTel Collector (DaemonSet)        → CDN (CloudFront + S3)        │
│     → API Gateway                     → BFF (Go) @ api.monitoring.*  │
│       → Mimir Distributor                 → Mimir Query Frontend     │
│         → Kafka (ingest storage)            → Query Scheduler        │
│           → Ingester                          → Queriers             │
│             → Object Storage (S3/GCS)         → Store Gateways       │
│                                                                       │
│                                     Grafana (Internal, VPN only)      │
│                                       → Mimir Query Frontend         │
│                                         (same read path)             │
└──────────────────────────────────────────────────────────────────────┘
```

### Tenant Hierarchy

Three-level: **Organization** (billing/identity boundary) → **Workspace** (trust/data isolation boundary) → **Project** (logical grouping).

Mimir tenant ID encoding: `org-{org_id}__ws-{workspace_id}`

All data isolation is enforced at the **workspace** level via the `X-Scope-OrgID` header. This header is always derived server-side from JWT claims — never from client-supplied values.

---

## Tech Stack

### Frontend

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | **React** | 18+ | Industry standard for observability UIs |
| Language | **TypeScript** | 5.x | Type safety for panel/view data structures |
| Build tool | **Vite** | 6.x | Fast builds, native ESM |
| Time-series charts | **uPlot** + `uplot-react` | 1.6.x | 50KB, 150K points in 34ms; same lib Grafana uses |
| Complex charts | **Apache ECharts** + `echarts-for-react` | 5.5.x | Heatmaps, gauges, bar charts |
| Data fetching | **TanStack Query** (React Query) | 5.x | Polling/refetch, stale-while-revalidate |
| Routing | **React Router** | 7.x | View-based page navigation |

**NOT in the stack** (eliminated in v2.0): `react-grid-layout`, `@lezer/promql`, PromQL editor, `@grafana/ui` (not usable outside Grafana), Plotly.js (too heavy), Recharts (SVG-limited).

### BFF (Context Only)

The BFF is a separate Go service (~1,500 LoC) that owns all PromQL queries, validates JWTs, derives tenant IDs, and returns structured JSON to this frontend. It is **not implemented in this repo**. See `specs/02-metrics-dashboard-read-path.md` for the full BFF design.

---

## Project Structure

```
src/
├── __tests__/
│   ├── test-utils.tsx          # renderWithProviders(), mockViewEndpoint()
│   └── e2e/                    # Playwright E2E tests
├── __fixtures__/
│   ├── factories.ts            # makeStatPanel(), makeTimeSeriesPanel(), etc.
│   ├── views/                  # View-level fixture data
│   ├── panels/                 # Panel-level fixture data
│   └── errors/                 # Error response fixtures
├── api/
│   ├── __tests__/              # API client unit tests
│   ├── client.ts               # Base fetch wrapper with JWT injection
│   └── views.ts                # Typed API: fetchView(), fetchPanel()
├── mocks/
│   ├── bff-mock-data.ts         # Source of truth for mock data & response types
│   └── handlers.ts             # Mock data layer — imports from bff-mock-data.ts
├── components/
│   ├── charts/
│   │   ├── __tests__/          # Chart component tests
│   │   ├── TimeSeriesChart.tsx  # uPlot wrapper — "timeseries" panels
│   │   ├── StatChart.tsx        # Single-value stat — "stat" panels
│   │   ├── GaugeChart.tsx       # ECharts gauge — "gauge" panels
│   │   ├── HeatmapChart.tsx     # ECharts heatmap — "heatmap" panels
│   │   ├── BarChart.tsx         # ECharts bar — "bar" panels
│   │   ├── TableChart.tsx       # Ant Design table — "table" panels
│   │   └── PanelRenderer.tsx    # Routes panel.type → chart component
│   └── layout/
│       ├── __tests__/           # Layout component tests
│       ├── AppShell.tsx         # Nav sidebar, header, auth state
│       ├── ViewPage.tsx         # Generic view renderer
│       └── PanelCard.tsx        # Card wrapper: title, skeleton, error
├── pages/
│   ├── __tests__/              # Page integration tests
│   ├── AgentOverview.tsx        # View: "agent-overview"
│   ├── ToolCallPerformance.tsx  # View: "tool-call-performance"
│   ├── LLMTokenUsage.tsx        # View: "llm-token-usage"
│   ├── ErrorBreakdown.tsx       # View: "error-breakdown"
│   └── CostTracking.tsx         # View: "cost-tracking"
├── hooks/
│   ├── __tests__/              # Hook unit tests
│   ├── useView.ts              # TanStack Query: fetch + poll a view
│   └── useAuth.ts              # JWT management, token refresh
├── types/
│   ├── __tests__/              # Type guard/validation tests
│   └── views.ts                # TypeScript types matching BFF response
└── utils/
    ├── __tests__/              # Formatter unit tests (100% coverage target)
    └── formatters.ts           # Unit formatting (bytes, duration, rate, %)
mockups/
├── dashboard-appshell-agent-overview.html  # AppShell + Agent Overview layout
├── dashboard-cost-tracking.html            # Cost Tracking view
├── dashboard-error-breakdown.html          # Error Breakdown view
├── dashboard-llm-token-usage.html          # LLM Token Usage view
└── dashboard-tool-call-performance.html    # Tool Call Performance view
public/
index.html
vite.config.ts
tsconfig.json
package.json
```

---

## Key Design Decisions

### 1. Server-Owned Queries (Most Important Decision)

All PromQL lives in the BFF as compiled Go structs. The browser requests named endpoints (`GET /api/views/agent-overview`), and the BFF translates those to PromQL, executes against Mimir, and returns structured JSON.

**This eliminates:** PromQL injection, cross-workspace query manipulation, unbounded query DoS, cardinality exploration attacks, time range abuse, admin endpoint exposure.

**The tradeoff:** Tenants cannot explore data ad-hoc. Grafana serves that need for platform engineers.

### 2. No User-Editable Dashboards (Phase 1)

All dashboards are predefined by the platform engineering team and deployed via CI/CD. No PostgreSQL, no Redis, no dashboard CRUD, no user-supplied PromQL, no query builder.

### 3. uPlot for Time-Series, ECharts for Everything Else

uPlot handles all time-series rendering (50KB bundle, 150K points in 34ms). ECharts fills gaps: heatmaps, gauges, pie charts, bar charts (~1MB, tree-shakeable). Do NOT use Plotly.js (3.6MB) or `@grafana/ui` (not usable outside Grafana).

### 4. Tenant ID Derived from JWT, Never Client-Supplied

The BFF derives `org-{org_id}__ws-{workspace_id}` from authenticated JWT claims. No client-supplied `X-Scope-OrgID` is ever accepted. This is the primary security boundary.

---

## BFF API Contract

The frontend codes against a small, purpose-built API — not a PromQL proxy. **Currently mocked** — response shapes are defined in `src/mocks/bff-mock-data.ts`. For Go structs, JSON wire format, and examples see `specs/04-bff-api-schemas.md`. TypeScript interfaces: `src/types/views.ts`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/views` | GET | List available views → `ViewListItem[]` |
| `GET /api/views/{view_id}` | GET | All panels for a view → `ViewResponse` |
| `GET /api/views/{view_id}/panels/{panel_id}` | GET | Single panel → `Panel` |
| `GET /api/health` | GET | Liveness |
| `GET /api/ready` | GET | Readiness (Mimir reachable) |

---

## Predefined Views (Phase 1)

| View ID | Page | Key Panels | Refresh |
|---------|------|------------|---------|
| `agent-overview` | Agent Execution Overview | Active agents (stat), invocation rate (timeseries), error rate (timeseries), p95 latency (timeseries), errors by type (bar), step distribution (heatmap) | 30s |
| `tool-call-performance` | Tool Call Performance | Per-tool latency p50/p95/p99, tool error rates, call frequency, retry rate, slowest tools (table) | 30s |
| `llm-token-usage` | LLM Token Usage | Total tokens (stat), tokens by model, prompt vs completion split, token rate, cost by model, top consumers (table) | 60s |
| `error-breakdown` | Error Breakdown | Total errors (stat), error rate trend, errors by type/agent/version, top error messages (table) | 30s |
| `cost-tracking` | Cost Tracking | Est. daily cost (stat), cost trend, cost by agent/model, cost per invocation, projected monthly | 300s |

---

## Frontend Patterns

### Page Component Pattern

Every page follows the same pattern — only the view ID and grid layout differ:

```tsx
import { useView } from '../hooks/useView';
import { PanelCard } from '../components/layout/PanelCard';

export function AgentOverview() {
  const { data, isLoading, error } = useView('agent-overview');
  if (error) return <ErrorState error={error} />;

  return (
    <div className="view-page">
      <h1>{data?.view.title ?? 'Agent Overview'}</h1>
      <div className="grid grid-cols-4 gap-4">
        <PanelCard panelId="active_agents" panels={data?.panels} loading={isLoading} />
        {/* ... more panels ... */}
      </div>
    </div>
  );
}
```

### useView Hook (TanStack Query)

```tsx
import { useQuery } from '@tanstack/react-query';
import { fetchView } from '../api/views';

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

```tsx
export function PanelRenderer({ panel }: { panel: PanelData }) {
  switch (panel.type) {
    case 'timeseries': return <TimeSeriesChart data={panel.data} unit={panel.unit} />;
    case 'stat':       return <StatChart data={panel.data} unit={panel.unit} />;
    case 'gauge':      return <GaugeChart data={panel.data} unit={panel.unit} />;
    case 'heatmap':    return <HeatmapChart data={panel.data} />;
    case 'bar':        return <BarChart data={panel.data} unit={panel.unit} />;
    case 'table':      return <TableChart data={panel.data} />;
    default:           return <UnsupportedPanel type={panel.type} />;
  }
}
```

---

## Metrics Catalog Reference

The system monitors AI agents using 80 metrics across 9 categories, following OTel GenAI Semantic Conventions v1.40.0. Key metrics to understand:

### Common Label Set (on every metric)

`tenant.id`, `service.name`, `service.version`, `deployment.environment`, `gen_ai.agent.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.operation.name`

### Priority 0 (Ship-Blocking) Metrics Include

- `gen_ai.token.usage` — Token consumption (Counter, by type: input/output/total)
- `agent.invocation.duration` — End-to-end agent execution time (Histogram)
- `agent.invocation.count` — Agent invocations (Counter, by status)
- `agent.error.count` — Agent errors (Counter, by error type)
- `tool.call.duration` — Tool execution latency (Histogram)
- `tool.call.count` — Tool invocations (Counter)
- `gen_ai.client.operation.duration` — LLM API call latency (Histogram)

### Cardinality Rules

- `gen_ai.agent.id` is **trace-only** — NEVER use as a metric label (unbounded)
- `trace_id`, `span_id` are **exemplar-only**
- `rag.index.name` should be bounded or normalized to `rag.index.type`
- `agent.source.name` × `agent.target.name` creates N² cardinality — use with caution

---

## Deployment

The Vite build output is deployed to S3 and served via CDN (CloudFront) at `monitoring.example.com`. Content-hashed assets get immutable cache headers; `index.html` gets short TTL and is invalidated on deploy. The BFF is served at a separate domain (`api.monitoring.example.com`) — API requests go directly to the BFF ALB, not through the CDN. See `specs/02-frontend-deployment.md` for the full spec, deploy scripts, and rollback procedure.

---

## Security (Frontend Perspective)

The frontend handles JWT tokens for authentication. Key considerations:

- **JWT storage**: Tokens are short-lived (≤1h) with refresh token rotation
- **No PromQL exposure**: The frontend never constructs or sends PromQL — all queries are server-owned
- **No tenant selection**: The workspace is derived from JWT claims server-side; the frontend has no workspace switcher or tenant ID input
- **RBAC**: Phase 1 is authentication-only. Role field exists in JWT claims (`viewer`, `operator`, `admin`) but is not enforced for view access yet

---

## Adding a New View (Developer Workflow)

1. **Add mock data** — add a new `ViewResponse` object in `src/mocks/bff-mock-data.ts` following existing patterns
2. **Create the React page** — add a page component in `src/pages/` using the ViewPage pattern
3. **Add the route** — add route in `src/App.tsx` and nav entry in `AppShell.tsx`

---

## Implementation Roadmap

| Phase | Scope |
|-------|-------|
| **1: Foundation** | Vite + React + TypeScript project setup, TanStack Query, React Router, Ant Design theming |
| **2: Layout & Navigation** | AppShell (sidebar nav, header), route structure for 5 views, PanelCard skeleton |
| **3: Chart Components** | 6 chart components: TimeSeriesChart (uPlot), StatChart, GaugeChart, HeatmapChart, BarChart (ECharts), TableChart (Ant Design) |
| **4: Panel Rendering** | PanelRenderer routing, useView hook, mock data integration via `src/mocks/bff-mock-data.ts` |
| **5: View Pages** | 5 page components with grid layouts: AgentOverview, ToolCallPerformance, LLMTokenUsage, ErrorBreakdown, CostTracking |
| **6: Polish** | Unit formatting, loading states, error states, responsive layout, auto-refresh indicators |

---

## Code Style & Conventions

### TypeScript (Frontend)

- Functional components only, no class components
- Hooks for all state management (no Redux, no Zustand)
- TanStack Query for all server state — no manual fetch/useEffect patterns
- Strict TypeScript (`strict: true` in tsconfig)
- Component file naming: PascalCase for components, camelCase for hooks/utils
- Co-locate types with their usage; shared types in `src/types/`

### General

- All config via environment variables (12-factor)
- No hardcoded tenant IDs, URLs, or secrets in source code

---

## Testing

### Test Pyramid

| Level | Count | Runner | Environment |
|-------|-------|--------|-------------|
| Unit | ~111 | Vitest | jsdom |
| Integration | ~43 | Vitest + RTL + MSW | jsdom |
| E2E | ~10 | Playwright | Chromium |

### Tooling

- **Vitest** — unit and integration tests (fast, Vite-native)
- **React Testing Library (RTL)** — component rendering and interaction
- **MSW (Mock Service Worker)** — API mocking at the network level
- **Playwright** — end-to-end browser tests

### File Conventions

- **Test files**: `__tests__/` directories co-located with source (e.g., `src/components/charts/__tests__/`)
- **Fixtures**: `src/__fixtures__/` for shared test data (views, panels, errors)
- **Fixture factories** in `src/__fixtures__/factories.ts`: `makeStatPanel()`, `makeTimeSeriesPanel()`, `makeBarPanel()`, `makeViewResponse()`
- **Shared test utilities** in `src/__tests__/test-utils.tsx`: `renderWithProviders()`, `mockViewEndpoint()`

### Coverage Targets

- **Overall**: 90%+ lines, 85%+ branches
- **`utils/` and `types/`**: 100% lines and branches

### Run Commands

- `vitest run` — unit + integration tests
- `playwright test` — E2E tests

See `specs/03-test-specifications.md` for detailed test case IDs and specifications.

---

## What NOT to Build (Phase 1 Scope)

These are explicitly deferred to future phases:

- BFF (Go service) — out of scope for this repo
- Natural-language query interface (requires LLM integration)
- AI-generated dashboards (requires LLM integration)
- "Explain this panel" feature (requires LLM integration)
- User-configurable alert rules (separate alerting system)
- User-editable dashboards (predefined only)
- Interactive time range picker, filters, drill-down (static views only)
- Explore page (Grafana serves this for platform engineers)
- Query builder or PromQL editor
- Dashboard CRUD (create/edit/save/share)
- Template selector
- WorkspaceSwitcher (users belong to workspaces via auth)

---

## Reference Documents

These documents in the project define the full system design:

- `specs/00-system-requirements.md` — Functional and non-functional requirements (v5.0, security-hardened)
- `specs/01-metrics-catalogue.md` — Metrics catalogue: 80 metrics across 9 categories, OTel GenAI conventions
- `specs/02-frontend-deployment.md` — Frontend deployment: S3 + CDN, push-based invalidation, deploy scripts, rollback
- `specs/02-metrics-dashboard-read-path.md` — Read path: BFF + Frontend + Grafana (this is the primary implementation spec)
- `specs/02-metrics-read-path.mermaid` — Dashboard read path diagram
- `specs/02-metrics-write-path.mermaid` — Metrics ingestion pipeline diagram
- `specs/03-test-specifications.md` — Frontend test specifications: test pyramid, ~164 test cases (unit/integration/E2E), fixture factories, coverage targets
- `specs/04-bff-api-schemas.md` — BFF API schemas: Go structs, JSON wire format, examples
- `src/mocks/bff-mock-data.ts` — Mock data with exact JSON response shapes (source of truth for frontend contracts and type definitions)
- `mockups/*.html` — Static HTML mockups for all 5 dashboard views (AppShell layout, charts, grid structure)
