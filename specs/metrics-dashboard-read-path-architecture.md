# Metrics Dashboard Read Path Architecture — Phase 1

**Version:** 2.0
**Date:** 2026-03-18
**Status:** Draft
**Scope:** Custom tenant-facing dashboard + internal Grafana, metrics layer only (Mimir)
**Prerequisites:** Metrics pipeline architecture (metrics-write-path), system requirements v5.0

**Changelog:**
v2.0 — Fundamental simplification: tenant dashboards are fully predefined by the platform engineering team, deployed with code releases. Tenants see static views with no interactive controls (no time range picker, no filters, no query builder, no drill-down). All PromQL is server-owned — the browser never sends or sees PromQL. This eliminates the query builder, dashboard CRUD, PostgreSQL for dashboard state, PromQL editor, Explore page, react-grid-layout, and most query validation logic. The BFF becomes a thin view-serving layer rather than a query proxy.

---

## 1. Executive Summary

This document defines the detailed architecture for the metrics dashboard read path — the system that presents workspace users with **predefined, read-only metric views** of their AI agent health, while platform engineers use Grafana internally for ad-hoc investigation and hypothesis testing. Both consumers share the same Grafana Mimir backend.

The architecture introduces three new components:

1. **Backend-for-Frontend (BFF)** — a Go service that authenticates users, owns all PromQL query definitions, injects `X-Scope-OrgID` for workspace isolation, executes queries against Mimir, and returns structured JSON to the frontend. The browser never sends or receives PromQL.
2. **Custom Dashboard Frontend** — a React + TypeScript SPA that renders predefined dashboard pages with static chart layouts. The frontend requests named data endpoints from the BFF and renders the results. All dashboard definitions are compiled into the application and deployed via CI/CD by the platform engineering team.
3. **Internal Grafana Instance** — a Helm-deployed Grafana restricted to platform engineers, configured with per-tenant datasources and cross-tenant federation for exploratory analysis.

### 1.1 Key Design Decision: Server-Owned Queries

The most important architectural decision in this design is that **all PromQL lives in the BFF, not the frontend**. The browser requests structured data from named API endpoints (e.g., `GET /api/views/agent-overview`), and the BFF translates those into PromQL, executes them against Mimir with the correct `X-Scope-OrgID`, and returns formatted results.

This eliminates an entire class of security concerns:

- No PromQL injection surface — the browser cannot send arbitrary queries
- No query validation needed — all queries are pre-tested by engineers
- No operation allowlisting — the BFF never proxies user-supplied content
- No time range abuse — time windows are server-controlled
- No cardinality-exploring queries — query patterns are known at deploy time
- Simpler RBAC — access control is per-view, not per-query-capability

The tradeoff is flexibility: tenants cannot explore their data ad-hoc or build custom dashboards. For this use case, that is acceptable — Grafana serves the ad-hoc exploration need for platform engineers, and tenant self-service exploration can be added in a future phase if demand warrants it.

---

## 2. Architectural Context

### 2.1 Where the Read Path Fits

```
WRITE PATH (existing)                    READ PATH (this document)
─────────────────────                    ────────────────────────
AI Agents                                Custom Dashboard (React)
  → OTel Collector                         → BFF (Go)
    → API Gateway                            → Mimir Query Frontend
      → Mimir Distributor                      → Query Scheduler
        → Kafka                                  → Queriers
          → Ingester ←────────────────────────── ← Fan-out to:
            → Object Storage ←─────────────────── ← Store Gateways
                                             
                                         Grafana (Internal)
                                           → Mimir Query Frontend
                                             (same path, internal network)
```

### 2.2 Requirements Traceability

| Requirement | ID | How Addressed |
|---|---|---|
| Self-service dashboard per workspace | MT-008 | Predefined views with workspace-scoped data |
| Workspace-scoped data access on all queries | DS-004 | BFF injects `X-Scope-OrgID`; browser never touches PromQL |
| Tenant context from credentials, never client-supplied | MT-011 | BFF derives workspace_id from JWT; no client-supplied identifiers accepted |
| Per-workspace query concurrency limits | RG-005 | Mimir query-scheduler per-tenant queues + BFF-level concurrency control |
| Query complexity limits | RG-006 | Not needed — all queries predefined and tested by engineers |
| Dashboard query response ≤ 5s | NFR-002 | Mimir result caching, query splitting, shuffle sharding; queries optimized at authoring time |
| Cross-tenant analytics for platform owners | MT-006 | Grafana with tenant federation |
| Pre-built dashboard templates | DS-008 | All dashboards are pre-built; this is the only mode |
| Zero cross-workspace leakage | NFR-015 | No user-supplied queries; `X-Scope-OrgID` enforced server-side |

### 2.3 What Is Explicitly Out of Scope

The following capabilities from the requirements doc are **deferred to future phases** and not implemented in Phase 1:

- Natural-language query interface (DS-001, DS-002) — requires LLM integration
- AI-generated dashboards (DS-005) — requires LLM integration
- "Explain this panel" (DS-007) — requires LLM integration
- User-configurable alert rules (AL-003, AL-006) — separate alerting system
- User-editable dashboards (DS-006) — predefined only in Phase 1
- Interactive time range, filters, drill-down — static views in Phase 1

---

## 3. Component Architecture

### 3.1 Backend-for-Frontend (BFF)

The BFF is a stateless Go HTTP service deployed as a Kubernetes Deployment (3+ replicas, HPA-scaled). It serves two functions: authenticate users and serve predefined metric views by executing server-owned PromQL against Mimir.

#### 3.1.1 Responsibilities

1. **Authentication**: Validate JWT tokens issued by the platform's IAM service. Extract `user_id`, `workspace_id`, `org_id`, and `role` from token claims.

2. **Tenant Context Injection**: Derive the Mimir tenant ID (`org-{org_id}__ws-{workspace_id}`) from the authenticated JWT. No client-supplied tenant identifiers are accepted.

3. **View Execution**: Receive requests for named views (e.g., `agent-overview`, `llm-token-usage`), look up the corresponding PromQL queries from compiled view definitions, execute them against Mimir with the correct `X-Scope-OrgID`, and return structured JSON.

4. **Concurrency Control**: Limit the number of concurrent Mimir requests per workspace (via semaphore), complementing Mimir's query-scheduler per-tenant queues.

5. **Audit Logging**: Log every view request with workspace_id, user_id, view name, response time, and status (per DS-010, SA-001).

#### 3.1.2 View Definition Model

Each predefined dashboard is a **view** — a named collection of **panels**, where each panel maps to one or more PromQL queries with fixed parameters. View definitions are Go structs compiled into the BFF binary:

```go
// pkg/views/definitions.go

type PanelQuery struct {
    PromQL   string        // The query template
    Legend   string        // Series legend format
    StepSec  int           // Query resolution step
}

type Panel struct {
    ID       string        // e.g., "error_rate_by_agent"
    Title    string        // "Error Rate by Agent"
    Type     string        // "timeseries", "stat", "gauge", "heatmap", "bar", "table"
    Unit     string        // "reqps", "seconds", "bytes", "percent", "short"
    Queries  []PanelQuery  // One or more PromQL queries
    TimeRange string       // "1h", "24h", "7d" — fixed per panel
}

type View struct {
    ID          string    // URL slug: "agent-overview"
    Title       string    // "Agent Execution Overview"
    Description string    // Brief description shown in UI
    RefreshSec  int       // Auto-refresh interval (e.g., 30)
    Panels      []Panel   // Ordered list of panels
}
```

Example view definition:

```go
var AgentOverview = View{
    ID:          "agent-overview",
    Title:       "Agent Execution Overview",
    Description: "Real-time view of agent health, error rates, and execution performance",
    RefreshSec:  30,
    Panels: []Panel{
        {
            ID: "active_agents", Title: "Active Agents", Type: "stat",
            Unit: "short", TimeRange: "5m",
            Queries: []PanelQuery{
                {PromQL: `count(count by (agent_name) (agent_invocations_total))`, Legend: "agents"},
            },
        },
        {
            ID: "invocation_rate", Title: "Invocation Rate", Type: "timeseries",
            Unit: "reqps", TimeRange: "24h",
            Queries: []PanelQuery{
                {PromQL: `sum by (agent_name) (rate(agent_invocations_total[5m]))`, Legend: "{{agent_name}}", StepSec: 60},
            },
        },
        {
            ID: "error_rate", Title: "Error Rate", Type: "timeseries",
            Unit: "percent", TimeRange: "24h",
            Queries: []PanelQuery{
                {PromQL: `sum(rate(agent_errors_total[5m])) / sum(rate(agent_invocations_total[5m])) * 100`, Legend: "error %", StepSec: 60},
            },
        },
        {
            ID: "p95_latency", Title: "Execution Latency (p95)", Type: "timeseries",
            Unit: "seconds", TimeRange: "24h",
            Queries: []PanelQuery{
                {PromQL: `histogram_quantile(0.95, sum by (le, agent_name) (rate(agent_duration_seconds_bucket[5m])))`, Legend: "{{agent_name}}", StepSec: 60},
            },
        },
        {
            ID: "errors_by_type", Title: "Errors by Type", Type: "bar",
            Unit: "short", TimeRange: "24h",
            Queries: []PanelQuery{
                {PromQL: `sum by (error_type) (increase(agent_errors_total[24h]))`, Legend: "{{error_type}}"},
            },
        },
        {
            ID: "step_distribution", Title: "Steps per Execution", Type: "heatmap",
            Unit: "short", TimeRange: "24h",
            Queries: []PanelQuery{
                {PromQL: `sum by (le) (rate(agent_steps_total_bucket[5m]))`, Legend: "", StepSec: 300},
            },
        },
    },
}
```

#### 3.1.3 API Surface

The BFF exposes a small, purpose-built API — not a PromQL proxy:

| Endpoint | Method | Purpose | Response |
|---|---|---|---|
| `/api/views` | GET | List all available views | `[{id, title, description}]` |
| `/api/views/{view_id}` | GET | Fetch all panel data for a view | `{view metadata + panel results}` |
| `/api/views/{view_id}/panels/{panel_id}` | GET | Fetch a single panel (targeted refresh) | `{panel metadata + query results}` |
| `/api/health` | GET | Liveness check | `{status: "ok"}` |
| `/api/ready` | GET | Readiness (Mimir reachable) | `{status: "ready"}` |

**View response structure:**

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
    },
    {
      "id": "error_rate",
      "title": "Error Rate",
      "type": "timeseries",
      "unit": "percent",
      "data": { "..." : "..." }
    }
  ]
}
```

The BFF executes all panel queries for a view in parallel (bounded by per-workspace concurrency limit), merges results, and returns them in a single response. The frontend makes one request per view load and one request per panel on auto-refresh.

#### 3.1.4 Request Flow

```
Browser                BFF                          Mimir Query Frontend
───────                ───                          ────────────────────
  │                     │                                    │
  │ GET /api/views/agent-overview                            │
  │ Authorization: Bearer <JWT>                              │
  │────────────────────>│                                    │
  │                     │                                    │
  │                     │ 1. Validate JWT                    │
  │                     │ 2. Extract workspace_id from claims│
  │                     │ 3. Look up "agent-overview" view   │
  │                     │    (compiled Go struct)             │
  │                     │ 4. Derive X-Scope-OrgID            │
  │                     │                                    │
  │                     │ 5. Execute all panel queries in    │
  │                     │    parallel (bounded concurrency): │
  │                     │                                    │
  │                     │    Panel 1: GET /prometheus/api/v1/│
  │                     │      query?query=count(...)        │
  │                     │    Panel 2: GET /prometheus/api/v1/│
  │                     │      query_range?query=sum(...)    │
  │                     │    Panel 3: ...                    │
  │                     │    (all with X-Scope-OrgID header) │
  │                     │────────────────────────────────────>│
  │                     │                                    │
  │                     │    All results returned            │
  │                     │<────────────────────────────────────│
  │                     │                                    │
  │                     │ 6. Assemble view response          │
  │                     │ 7. Log audit event                 │
  │                     │                                    │
  │  200 OK             │                                    │
  │  {view + panels}    │                                    │
  │<────────────────────│                                    │
```

#### 3.1.5 Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| Language | Go 1.22+ | Same as Mimir; efficient HTTP client with connection pooling |
| HTTP framework | `net/http` (stdlib) | Lightweight; no framework needed for this small API surface |
| Mimir client | `net/http` with `X-Scope-OrgID` header injection | Direct HTTP to Mimir Prometheus-compatible API |
| JWT validation | `github.com/golang-jwt/jwt/v5` | Industry standard, JWKS support |
| Concurrency control | `golang.org/x/sync/semaphore` | Per-workspace bounded parallelism for Mimir queries |
| View definitions | Compiled Go structs | No database needed; deployed with code; type-safe |
| Metrics | Prometheus `client_golang` | Self-monitoring: view latency, Mimir upstream latency, auth failures |

#### 3.1.6 What Is Eliminated (vs. v1.0)

| Eliminated | Reason |
|---|---|
| PromQL parsing (`promql/parser`) | No user-supplied PromQL to parse |
| Query validation (time range, selectors, blocked functions) | All queries predefined and tested |
| Operation allowlisting | No proxy mode; BFF only executes its own queries |
| Per-workspace rate limiting (token bucket) | Replaced by simpler concurrency semaphore |
| PostgreSQL (dashboard state, saved queries) | No user-created dashboards |
| Dashboard CRUD endpoints | No user-editable dashboards |
| Redis (label metadata cache, dashboard definition cache) | No query autocomplete; view defs compiled in binary |

#### 3.1.7 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-bff
  namespace: monitoring-platform
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: metrics-bff
          image: platform/metrics-bff:latest
          ports:
            - containerPort: 8080  # API
            - containerPort: 9090  # Prometheus metrics
          env:
            - name: MIMIR_QUERY_FRONTEND_URL
              value: "http://mimir-query-frontend.mimir.svc.cluster.local:8080"
            - name: JWT_JWKS_URL
              value: "http://iam-service.auth.svc.cluster.local/.well-known/jwks.json"
            - name: MAX_CONCURRENT_QUERIES_PER_WORKSPACE
              value: "10"
          resources:
            requests: { cpu: 200m, memory: 128Mi }
            limits: { cpu: 500m, memory: 256Mi }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: metrics-bff-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: metrics-bff
  minReplicas: 3
  maxReplicas: 15
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: metrics-bff-egress
spec:
  podSelector:
    matchLabels: { app: metrics-bff }
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector: { matchLabels: { name: mimir } }
      ports:
        - port: 8080  # Mimir query-frontend only
    - to:
        - namespaceSelector: { matchLabels: { name: auth } }
      ports:
        - port: 8080  # IAM service for JWKS
```

Compared to v1.0: memory limits halved (no PromQL parser, no Redis client, no PostgreSQL driver) and NetworkPolicy drops PostgreSQL egress entirely.


### 3.2 Custom Dashboard Frontend

The frontend is a static React application with hardcoded page layouts. Each page corresponds to a predefined view. The frontend requests data from the BFF's named view endpoints, receives structured JSON, and renders it into chart components. There is no user interaction beyond navigation between views.

#### 3.2.1 Technology Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | React | 18+ | Industry standard; deepest visualization ecosystem |
| Language | TypeScript | 5.x | Type safety for panel/view data structures |
| Build tool | Vite | 6.x | Fast builds, native ESM |
| Time-series charts | uPlot + `uplot-react` | 1.6.x | 50KB, renders 150K points in 34ms; same library Grafana uses |
| Complex charts | Apache ECharts + `echarts-for-react` | 5.5.x | Heatmaps, gauges, bar charts; GPU-accelerated Canvas |
| UI components | Ant Design | 5.x | Layout grid, cards, typography, navigation |
| Data fetching | TanStack Query (React Query) | 5.x | Polling/refetching on interval, stale-while-revalidate |
| Routing | React Router | 7.x | View-based page navigation |

#### 3.2.2 What Is Eliminated (vs. v1.0)

| Eliminated | Reason |
|---|---|
| `react-grid-layout` | No drag-and-drop panel arrangement |
| `@lezer/promql` / PromQL editor | No query editing |
| `MetricExplorer`, `QueryBuilder`, `PromQLEditor` | No query building |
| `TimeRangePicker` | Time ranges fixed per panel |
| `DashboardGrid` (user-configurable) | Layouts hardcoded in React components |
| `WorkspaceSwitcher` | Users belong to workspaces via auth; no switching |
| Explore page | No ad-hoc exploration |
| Dashboard CRUD (create/edit/save/share) | All dashboards predefined |
| Template selector | All views are pre-built; there is only one mode |

#### 3.2.3 Application Structure

```
src/
├── api/
│   ├── client.ts              # Base fetch wrapper with JWT injection
│   └── views.ts               # Typed API: fetchView(), fetchPanel()
├── components/
│   ├── charts/
│   │   ├── TimeSeriesChart.tsx # uPlot wrapper — renders "timeseries" panels
│   │   ├── StatChart.tsx       # Single-value stat — renders "stat" panels
│   │   ├── GaugeChart.tsx      # ECharts gauge — renders "gauge" panels
│   │   ├── HeatmapChart.tsx    # ECharts heatmap — renders "heatmap" panels
│   │   ├── BarChart.tsx        # ECharts bar chart — renders "bar" panels
│   │   ├── TableChart.tsx      # Ant Design table — renders "table" panels
│   │   └── PanelRenderer.tsx   # Routes panel.type → correct chart component
│   └── layout/
│       ├── AppShell.tsx        # Navigation sidebar, header, auth state
│       ├── ViewPage.tsx        # Generic view renderer: fetches view, renders panels
│       └── PanelCard.tsx       # Card wrapper: title, loading skeleton, error state
├── pages/
│   ├── AgentOverview.tsx       # View: "agent-overview"
│   ├── ToolCallPerformance.tsx # View: "tool-call-performance"
│   ├── LLMTokenUsage.tsx       # View: "llm-token-usage"
│   ├── ErrorBreakdown.tsx      # View: "error-breakdown"
│   └── CostTracking.tsx        # View: "cost-tracking"
├── hooks/
│   ├── useView.ts              # TanStack Query hook: fetch + poll a view
│   └── useAuth.ts              # JWT management, token refresh
├── types/
│   └── views.ts                # TypeScript types matching BFF response schema
└── utils/
    └── formatters.ts           # Unit formatting (bytes, duration, rate, percent)
```

#### 3.2.4 Page Rendering Pattern

Every page follows the same pattern — the only difference is the view ID and the panel grid layout:

```tsx
// pages/AgentOverview.tsx
import { useView } from '../hooks/useView';
import { PanelCard } from '../components/layout/PanelCard';
import { PanelRenderer } from '../components/charts/PanelRenderer';

export function AgentOverview() {
  const { data, isLoading, error } = useView('agent-overview');

  if (error) return <ErrorState error={error} />;

  return (
    <div className="view-page">
      <h1>{data?.view.title ?? 'Agent Overview'}</h1>

      {/* Row 1: Key stats */}
      <div className="grid grid-cols-4 gap-4">
        <PanelCard panelId="active_agents" panels={data?.panels} loading={isLoading} />
        <PanelCard panelId="total_invocations" panels={data?.panels} loading={isLoading} />
        <PanelCard panelId="error_rate_current" panels={data?.panels} loading={isLoading} />
        <PanelCard panelId="p95_latency_current" panels={data?.panels} loading={isLoading} />
      </div>

      {/* Row 2: Time series */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <PanelCard panelId="invocation_rate" panels={data?.panels} loading={isLoading} />
        <PanelCard panelId="error_rate" panels={data?.panels} loading={isLoading} />
      </div>

      {/* Row 3: Detailed breakdowns */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <PanelCard panelId="errors_by_type" panels={data?.panels} loading={isLoading} />
        <PanelCard panelId="p95_latency" panels={data?.panels} loading={isLoading} />
      </div>
    </div>
  );
}
```

The `useView` hook handles auto-refresh:

```tsx
// hooks/useView.ts
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

#### 3.2.5 Predefined Views (DS-008)

Five views ship with the platform, each corresponding to a page in the frontend and a view definition in the BFF:

| View ID | Page | Panels | Refresh |
|---|---|---|---|
| `agent-overview` | Agent Execution Overview | Active agents (stat), invocation rate (timeseries), error rate (timeseries), p95 latency (timeseries), errors by type (bar), step distribution (heatmap) | 30s |
| `tool-call-performance` | Tool Call Performance | Per-tool latency p50/p95/p99 (timeseries), tool error rates (timeseries), tool call frequency (bar), retry rate by tool (bar), slowest tools (table) | 30s |
| `llm-token-usage` | LLM Token Usage | Total tokens (stat), tokens by model (timeseries), prompt vs. completion split (timeseries), token rate (timeseries), cost by model (bar), top consumers (table) | 60s |
| `error-breakdown` | Error Breakdown | Total errors (stat), error rate trend (timeseries), errors by type (bar), errors by agent (bar), errors by version (bar), top error messages (table) | 30s |
| `cost-tracking` | Cost Tracking | Estimated daily cost (stat), cost trend (timeseries), cost by agent (bar), cost by model (bar), cost per invocation (timeseries), projected monthly cost (stat) | 300s |

#### 3.2.6 Adding a New View (Developer Workflow)

To add a new predefined view, a platform engineer:

1. **Prototypes in Grafana** — uses internal Grafana to write and validate PromQL against real tenant data, iterating on queries until they produce the desired visualizations.
2. **Defines the view in Go** — adds a new `View` struct in `pkg/views/definitions.go` with panels and the validated PromQL queries.
3. **Creates the React page** — adds a new page component in `src/pages/` using the `ViewPage` pattern, defining the static grid layout.
4. **Adds the route** — adds a route in `src/App.tsx` and a nav entry in `AppShell.tsx`.
5. **Deploys via CI/CD** — both BFF and frontend are rebuilt and deployed. No database migration, no configuration change — it is all code.

This workflow makes Grafana the **hypothesis testing tool** and the custom dashboard the **production delivery mechanism**:

```
Platform Engineer                  Grafana               BFF + Frontend
─────────────────                  ───────               ──────────────

1. Hypothesis: "We should track     │                         │
   tool retry rate per agent"        │                         │
                                     │                         │
2. Open Grafana, select tenant  ────>│                         │
   datasource, write PromQL          │                         │
                                     │                         │
3. Iterate on query, adjust     ────>│                         │
   aggregations, time ranges         │                         │
                                     │                         │
4. Validate across multiple     ────>│                         │
   tenant datasources                │                         │
                                     │                         │
5. Query looks good — codify:        │                         │
   • Add Panel to BFF View struct    │                    ────>│
   • Add chart slot to React page    │                    ────>│
   • Deploy via CI/CD                │                    ────>│
                                     │                         │
6. All tenants see the new panel     │                    ────>│
```

#### 3.2.7 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dashboard-frontend
  namespace: monitoring-platform
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: frontend
          image: platform/dashboard-frontend:latest
          ports:
            - containerPort: 80
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { cpu: 200m, memory: 128Mi }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dashboard-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
    - hosts: [monitoring.example.com]
      secretName: dashboard-tls
  rules:
    - host: monitoring.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service: { name: metrics-bff, port: { number: 8080 } }
          - path: /
            pathType: Prefix
            backend:
              service: { name: dashboard-frontend, port: { number: 80 } }
```


### 3.3 Internal Grafana Instance

Grafana serves two purposes: **hypothesis testing** (exploring metrics before codifying views) and **cross-tenant investigation** (debugging tenant-specific issues with full PromQL flexibility). It is not exposed to tenants.

#### 3.3.1 Deployment via Helm

```yaml
# values.yaml for grafana/grafana Helm chart
replicas: 2

grafana.ini:
  server:
    root_url: https://grafana-internal.platform.svc.cluster.local
  auth:
    disable_login_form: true
  auth.generic_oauth:
    enabled: true
    name: "Platform SSO"
    client_id: grafana-internal
    client_secret: ${GRAFANA_OAUTH_SECRET}
    scopes: openid profile email groups
    auth_url: https://idp.example.com/auth
    token_url: https://idp.example.com/token
    api_url: https://idp.example.com/userinfo
    role_attribute_path: "contains(groups[*], 'platform-engineers') && 'Admin' || 'Viewer'"
  security:
    allow_embedding: false
  users:
    allow_sign_up: false

sidecar:
  dashboards:
    enabled: true
    label: grafana_dashboard
    folderAnnotation: grafana_folder
    provider:
      allowUiUpdates: false  # GitOps discipline
  datasources:
    enabled: true
    label: grafana_datasource
```

#### 3.3.2 Per-Tenant Datasource Configuration

Each workspace gets a provisioned datasource. Grafana's datasource proxy injects `X-Scope-OrgID` server-side via `secureJsonData`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasource-tenant-a
  labels:
    grafana_datasource: "1"
data:
  tenant-a.yaml: |
    apiVersion: 1
    datasources:
      - name: "Mimir · Workspace A (Production)"
        type: prometheus
        access: proxy
        url: http://mimir-query-frontend.mimir.svc.cluster.local:8080/prometheus
        isDefault: false
        jsonData:
          httpHeaderName1: "X-Scope-OrgID"
          timeInterval: "15s"
        secureJsonData:
          httpHeaderValue1: "org-acme__ws-prod"
```

For cross-tenant fleet views (platform owner only, per MT-006/MT-007):

```yaml
- name: "Mimir · Fleet View (All Tenants)"
  type: prometheus
  access: proxy
  url: http://mimir-query-frontend.mimir.svc.cluster.local:8080/prometheus
  jsonData:
    httpHeaderName1: "X-Scope-OrgID"
  secureJsonData:
    httpHeaderValue1: "org-acme__ws-prod|org-acme__ws-staging|org-beta__ws-prod"
```

Requires `-tenant-federation.enabled=true` on Mimir query-frontend, querier, and ruler. Federated queries add a `__tenant_id__` label.

#### 3.3.3 Dashboards-as-Code (Grafonnet)

Internal Grafana dashboards are managed via Grafonnet in a Git repository:

```
grafana-dashboards/
├── jsonnetfile.json
├── lib/
│   └── common.libsonnet       # Shared variables, datasource refs
├── dashboards/
│   ├── fleet-overview.jsonnet     # All-tenant fleet health
│   ├── tenant-deep-dive.jsonnet   # Single-tenant investigation
│   ├── version-comparison.jsonnet # Cross-version metrics
│   ├── anomaly-investigation.jsonnet
│   └── capacity-planning.jsonnet
└── Makefile                   # jsonnet → JSON → ConfigMap
```

Engineers use the datasource template variable `$datasource` to switch between tenant contexts when investigating specific workspaces.

---

## 4. Mimir Read Path Integration

### 4.1 Query Flow Through Mimir

Both the BFF and Grafana hit the same Mimir query-frontend. No modifications to the existing read path are needed:

1. **Query Frontend** (stateless, 2+ replicas): Receives PromQL, splits large time ranges into 24h sub-queries, checks result cache (Memcached, keyed by tenant_id + query + time range), enqueues uncached sub-queries.

2. **Query Scheduler** (stateless, 2+ replicas): Per-tenant in-memory queues (depth: 100). Round-robin across tenant queues prevents monopolization. HTTP 429 when a tenant's queue fills.

3. **Queriers** (stateless, shuffle-sharded per tenant): Execute sub-queries by fanning out to ingesters (recent ~2h data) and store-gateways (historical data). Shuffle sharding contains blast radius.

4. **Store Gateways** (stateful, 3+ replicas): Lazy-load block indexes from object storage, download only required chunks. Memcached for index and chunk caching.

### 4.2 Per-Tenant Query Limits (Hot-Reloadable)

Mimir runtime configuration, reloading within 10 seconds per RG-014:

```yaml
# mimir-runtime-config.yaml
overrides:
  "org-free__ws-default":
    max_query_parallelism: 8
    max_fetched_series_per_query: 10000
    max_fetched_chunk_bytes_per_query: 1073741824  # 1 GB
    max_queriers_per_tenant: 4
    results_cache_ttl: 5m

  "org-acme__ws-prod":
    max_query_parallelism: 32
    max_fetched_series_per_query: 100000
    max_fetched_chunk_bytes_per_query: 5368709120  # 5 GB
    max_queriers_per_tenant: 8
    results_cache_ttl: 1m

  "org-enterprise__ws-prod":
    max_query_parallelism: 64
    max_fetched_series_per_query: 500000
    max_fetched_chunk_bytes_per_query: 10737418240  # 10 GB
    max_queriers_per_tenant: 16
    results_cache_ttl: 30s
```

Since all queries are predefined by engineers, these limits serve as safety rails rather than user-facing guardrails. Engineers validate that their queries perform within limits during the Grafana prototyping phase.

### 4.3 Result Caching

Mimir's query-frontend caches results in Memcached with **tenant-scoped cache keys** (no cross-workspace leakage). Since predefined views use the same PromQL for every tenant, cache hit rates will be high — the same query runs on a 30s refresh cycle, and Mimir's split-queries-by-interval (24h) means historical chunks cache almost perfectly.

```yaml
query_frontend:
  results_cache:
    backend: memcached
    memcached:
      addresses: "memcached.mimir.svc.cluster.local:11211"
      max_item_size: 10485760  # 10 MB
      timeout: 500ms
  cache_results: true
  split_queries_by_interval: 24h
```

---

## 5. Security Architecture

### 5.1 Threat Model Simplification

The server-owned query model eliminates several threat vectors present in a user-facing query system:

| Threat | Status | Explanation |
|---|---|---|
| PromQL injection | **Eliminated** | Browser never sends PromQL |
| Cross-workspace query manipulation | **Eliminated** | `X-Scope-OrgID` derived from JWT server-side |
| Unbounded query DoS | **Eliminated** | All queries predefined and tested |
| Cardinality exploration attack | **Eliminated** | No arbitrary metric discovery |
| Time range abuse | **Eliminated** | Time ranges fixed in view definitions |
| Admin endpoint exposure | **Eliminated** | BFF has no proxy mode; only calls known Mimir API paths |
| Tenant ID spoofing | **Mitigated** | Client-supplied headers ignored; tenant derived from JWT (MT-011) |

### 5.2 Remaining Attack Surface

| Threat | Mitigation |
|---|---|
| JWT theft/replay | Short-lived tokens (≤1h), refresh token rotation |
| Authentication bypass | JWKS validation; token signature verification |
| DDoS on BFF | Per-workspace concurrency semaphore; Kubernetes HPA; upstream rate limiting at ingress |
| BFF compromise leading to Mimir access | BFF can only reach Mimir query-frontend (NetworkPolicy); Mimir enforces per-tenant limits independently |

### 5.3 Network Isolation

```
┌─────────────────────────────────────────────────────────┐
│ Kubernetes Cluster                                       │
│                                                          │
│  ┌──────────────────────┐    ┌───────────────────────┐  │
│  │ monitoring-platform   │    │ mimir namespace        │  │
│  │                       │    │                        │  │
│  │  ┌─────────┐         │    │  ┌──────────────────┐  │  │
│  │  │ BFF     │─────────┼────┼─>│ Query Frontend   │  │  │
│  │  └─────────┘         │    │  │ (ClusterIP only) │  │  │
│  │       ↑              │    │  └──────────────────┘  │  │
│  │  ┌─────────┐         │    │                        │  │
│  │  │Frontend │         │    └───────────────────────┘  │
│  │  │(nginx)  │         │                               │
│  │  └─────────┘         │    ┌───────────────────────┐  │
│  └──────────────────────┘    │ grafana-internal       │  │
│                              │  ┌─────────┐           │  │
│                              │  │ Grafana │───────────┼──┘
│                              │  └─────────┘           │
│                              └───────────────────────┘
│                                                          │
│  Ingress (TLS)                                           │
│  ├─ monitoring.example.com → BFF + Frontend              │
│  └─ grafana-internal.example.com → Grafana (VPN only)   │
└─────────────────────────────────────────────────────────┘
```

### 5.4 RBAC

With predefined dashboards and no user interaction, RBAC simplifies to authentication-only in Phase 1:

| Role | Can Access Views | Purpose |
|---|---|---|
| Viewer | All predefined views | Monitor agent health |
| Operator | All predefined views | Same as Viewer in Phase 1 (differentiation comes with alerts/config in later phases) |
| Admin | All predefined views | Same as Viewer in Phase 1 (differentiation comes with workspace settings in later phases) |

The BFF checks that the JWT is valid and the user belongs to the workspace. Role-based differentiation is structurally supported (role is in the JWT claims) but not enforced for view access since all roles see the same read-only dashboards.

---

## 6. Observability of the Read Path

### 6.1 BFF Metrics

```
# View performance
bff_view_request_duration_seconds{workspace, view_id, status}       # Histogram
bff_view_request_total{workspace, view_id, status}                  # Counter
bff_panel_query_duration_seconds{workspace, view_id, panel_id}      # Histogram

# Concurrency
bff_concurrent_queries{workspace}                                    # Gauge
bff_concurrency_limit_rejections_total{workspace}                    # Counter

# Mimir upstream
bff_mimir_request_duration_seconds{status_code}                      # Histogram
bff_mimir_errors_total{status_code}                                  # Counter

# Auth
bff_auth_failures_total{reason}                                      # Counter
```

### 6.2 Key Alerts

| Alert | Condition | Severity |
|---|---|---|
| BFF error rate high | `rate(bff_view_request_total{status="5xx"}[5m]) > 0.05` | Critical |
| BFF view latency high | `histogram_quantile(0.95, bff_view_request_duration_seconds) > 5` | Warning |
| Mimir query-frontend unreachable | `up{job="mimir-query-frontend"} == 0` | Critical |
| Per-tenant query queue saturated | `cortex_query_scheduler_queue_length > 80` | Warning |

---

## 7. ClickHouse Integration Seam (Future Phase 2)

The BFF's view model naturally extends to ClickHouse. When added:

1. Panel definitions gain a `DataSource` field (`mimir` or `clickhouse`).
2. ClickHouse panels define SQL instead of PromQL.
3. The BFF routes panel queries to the appropriate backend.
4. The frontend `PanelRenderer` is unchanged — it renders based on `panel.type`, not data source.
5. Tenant isolation in ClickHouse uses the same `workspace_id`, injected into SQL `WHERE` clauses server-side.

```go
// Future: extended panel definition
type PanelQuery struct {
    DataSource string  // "mimir" (default) or "clickhouse"
    PromQL     string  // Used when DataSource == "mimir"
    SQL        string  // Used when DataSource == "clickhouse"
    Legend     string
    StepSec    int
}
```

---

## 8. Implementation Roadmap

| Phase | Scope | Duration | Dependencies |
|---|---|---|---|
| **1a: BFF** | Go service: JWT auth, view definitions (5 views), parallel Mimir query execution, `X-Scope-OrgID` injection, audit logging, Prometheus metrics | 2-3 weeks | IAM service, Mimir cluster |
| **1b: Frontend** | React app: AppShell with navigation, 5 page components, chart components (TimeSeriesChart, StatChart, GaugeChart, HeatmapChart, BarChart, TableChart), PanelRenderer, useView hook with auto-refresh | 3-4 weeks | BFF deployed |
| **1c: Grafana** | Helm deployment, per-tenant datasources, Grafonnet dashboards (fleet overview, tenant deep-dive), sidecar provisioning, OIDC auth | 1-2 weeks | Parallel with 1a |
| **1d: Hardening** | Load testing, verify per-tenant limits, NetworkPolicy audit, security review | 1-2 weeks | All above |

**Total estimated duration: 6-8 weeks** with 2 engineers (1 Go backend, 1 React frontend) working in parallel.

### 8.1 Complexity Comparison: v1.0 vs v2.0

| Dimension | v1.0 (User-Editable) | v2.0 (Predefined) |
|---|---|---|
| BFF Go code | ~4,000 LoC | ~1,500 LoC |
| BFF dependencies | 8+ (JWT, PromQL parser, rate limiter, Redis, PostgreSQL driver, ...) | 3 (JWT, semaphore, Prometheus client) |
| BFF infrastructure | Pod + PostgreSQL + Redis | Pod only |
| Frontend React components | ~25 | ~12 |
| Frontend pages | 6 (including Explore, Settings) | 5 (view pages only) |
| NetworkPolicy egress rules | 3 (Mimir, IAM, PostgreSQL) | 2 (Mimir, IAM) |
| Security threat surface | PromQL injection, query DoS, time range abuse, admin endpoint exposure | JWT theft only |
| Estimated delivery | 10-14 weeks | 6-8 weeks |

---

*End of document.*
