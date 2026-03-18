# CLAUDE.md — Multi-Tenant AI Agent Monitoring Dashboard

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **frontend application** for a multi-tenant AI agent monitoring platform. It is a React SPA that renders predefined, read-only dashboard views for AI agent fleet metrics.

**Scope of this repo:** This repository contains only the custom dashboard frontend. The Go BFF (Backend-for-Frontend) is a separate service, not implemented here. During development, all data comes from mock responses defined in `specs/bff-mock-data.ts`.

The architecture follows a **predefined, read-only dashboard model** (Phase 1) where all queries are server-owned — the browser never sends or sees PromQL. The BFF translates named view requests into PromQL, executes against Mimir, and returns structured JSON. This frontend consumes that JSON.

There are two consumers of the same Grafana Mimir backend:
1. **Custom Dashboard** (this repo) — tenant-facing React SPA with predefined views, served via a Go BFF
2. **Internal Grafana** — platform-engineer-only tool for ad-hoc exploration and hypothesis testing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ WRITE PATH                          READ PATH                   │
│                                                                  │
│ AI Agents                           Custom Dashboard (React)     │
│   → OTel Collector (DaemonSet)        → BFF (Go)                │
│     → API Gateway                       → Mimir Query Frontend   │
│       → Mimir Distributor                 → Query Scheduler      │
│         → Kafka (ingest storage)            → Queriers           │
│           → Ingester                          → Ingesters (2h)   │
│             → Object Storage (S3/GCS)         → Store Gateways   │
│                                                                  │
│                                     Grafana (Internal, VPN only) │
│                                       → Mimir Query Frontend     │
│                                         (same read path)         │
└─────────────────────────────────────────────────────────────────┘
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
| UI components | **Ant Design** | 5.x | Layout grid, cards, typography, navigation |
| Data fetching | **TanStack Query** (React Query) | 5.x | Polling/refetch, stale-while-revalidate |
| Routing | **React Router** | 7.x | View-based page navigation |

**NOT in the stack** (eliminated in v2.0): `react-grid-layout`, `@lezer/promql`, PromQL editor, `@grafana/ui` (not usable outside Grafana), Plotly.js (too heavy), Recharts (SVG-limited).

### BFF (Context Only)

The BFF is a separate Go service (~1,500 LoC) that owns all PromQL queries, validates JWTs, derives tenant IDs, and returns structured JSON to this frontend. It is **not implemented in this repo**. See `specs/metrics-dashboard-read-path-architecture.md` for the full BFF design.

---

## Project Structure

```
src/
├── api/
│   ├── client.ts               # Base fetch wrapper with JWT injection
│   └── views.ts                # Typed API: fetchView(), fetchPanel()
├── mocks/
│   └── handlers.ts             # Mock data layer — imports from specs/bff-mock-data.ts
├── components/
│   ├── charts/
│   │   ├── TimeSeriesChart.tsx  # uPlot wrapper — "timeseries" panels
│   │   ├── StatChart.tsx        # Single-value stat — "stat" panels
│   │   ├── GaugeChart.tsx       # ECharts gauge — "gauge" panels
│   │   ├── HeatmapChart.tsx     # ECharts heatmap — "heatmap" panels
│   │   ├── BarChart.tsx         # ECharts bar — "bar" panels
│   │   ├── TableChart.tsx       # Ant Design table — "table" panels
│   │   └── PanelRenderer.tsx    # Routes panel.type → chart component
│   └── layout/
│       ├── AppShell.tsx         # Nav sidebar, header, auth state
│       ├── ViewPage.tsx         # Generic view renderer
│       └── PanelCard.tsx        # Card wrapper: title, skeleton, error
├── pages/
│   ├── AgentOverview.tsx        # View: "agent-overview"
│   ├── ToolCallPerformance.tsx  # View: "tool-call-performance"
│   ├── LLMTokenUsage.tsx        # View: "llm-token-usage"
│   ├── ErrorBreakdown.tsx       # View: "error-breakdown"
│   └── CostTracking.tsx         # View: "cost-tracking"
├── hooks/
│   ├── useView.ts              # TanStack Query: fetch + poll a view
│   └── useAuth.ts              # JWT management, token refresh
├── types/
│   └── views.ts                # TypeScript types matching BFF response
└── utils/
    └── formatters.ts           # Unit formatting (bytes, duration, rate, %)
specs/
└── bff-mock-data.ts            # Source of truth for mock data & response types
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

The frontend codes against this API surface. **Currently mocked** — response shapes are defined in `specs/bff-mock-data.ts`.

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/views` | GET | List all available views | `[{id, title, description}]` |
| `/api/views/{view_id}` | GET | Fetch all panel data for a view | `{view: {...}, panels: [...]}` |
| `/api/views/{view_id}/panels/{panel_id}` | GET | Fetch single panel (targeted refresh) | `{panel metadata + query results}` |
| `/api/health` | GET | Liveness | `{status: "ok"}` |
| `/api/ready` | GET | Readiness (Mimir reachable) | `{status: "ready"}` |

### View Response Schema

```json
{
  "view": {
    "id": "agent-overview",
    "title": "Agent Execution Overview",
    "refreshSec": 30
  },
  "panels": [
    {
      "id": "invocation_rate",
      "title": "Invocation Rate",
      "type": "timeseries",
      "unit": "reqps",
      "data": {
        "resultType": "matrix",
        "result": [
          {
            "metric": {"agent_name": "order-processor"},
            "values": [[1710720000, "12.5"], [1710720060, "13.1"]]
          }
        ]
      }
    }
  ]
}
```

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

### Frontend Deployment

- 2 replicas, nginx serving static Vite build
- Resources: 50m/64Mi requests, 200m/128Mi limits
- Ingress: `/api` → BFF, `/` → Frontend (both under `monitoring.example.com`)
- Kubernetes namespace: `monitoring-platform`

---

## Security (Frontend Perspective)

The frontend handles JWT tokens for authentication. Key considerations:

- **JWT storage**: Tokens are short-lived (≤1h) with refresh token rotation
- **No PromQL exposure**: The frontend never constructs or sends PromQL — all queries are server-owned
- **No tenant selection**: The workspace is derived from JWT claims server-side; the frontend has no workspace switcher or tenant ID input
- **RBAC**: Phase 1 is authentication-only. Role field exists in JWT claims (`viewer`, `operator`, `admin`) but is not enforced for view access yet

---

## Adding a New View (Developer Workflow)

1. **Add mock data** — add a new `ViewResponse` object in `specs/bff-mock-data.ts` following existing patterns
2. **Create the React page** — add a page component in `src/pages/` using the ViewPage pattern
3. **Add the route** — add route in `src/App.tsx` and nav entry in `AppShell.tsx`

---

## Implementation Roadmap

| Phase | Scope |
|-------|-------|
| **1: Foundation** | Vite + React + TypeScript project setup, TanStack Query, React Router, Ant Design theming |
| **2: Layout & Navigation** | AppShell (sidebar nav, header), route structure for 5 views, PanelCard skeleton |
| **3: Chart Components** | 6 chart components: TimeSeriesChart (uPlot), StatChart, GaugeChart, HeatmapChart, BarChart (ECharts), TableChart (Ant Design) |
| **4: Panel Rendering** | PanelRenderer routing, useView hook, mock data integration via `specs/bff-mock-data.ts` |
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

- `specs/monitoring-system-requirements-v5.md` — Functional and non-functional requirements (v5.0, security-hardened)
- `specs/metrics-dashboard-read-path-architecture.md` — Read path: BFF + Frontend + Grafana (this is the primary implementation spec)
- `specs/bff-mock-data.ts` — Mock data with exact JSON response shapes (source of truth for frontend contracts and type definitions)
- `specs/metrics-read-path-architecture.mermaid` — Dashboard read path diagram
- `specs/metrics-write-path.mermaid` — Metrics ingestion pipeline diagram
