# Frontend Test Specifications — Custom Observability Dashboard

**Version:** 2.0
**Date:** 2026-03-18
**Scope:** React frontend only (BFF is tested separately)
**Architecture reference:** `metrics-dashboard-read-path-architecture.md` v2.0
**Wireframe reference:** `dashboard-appshell-agent-overview.html`, `dashboard-tool-call-performance.html`, `dashboard-llm-token-usage.html`, `dashboard-error-breakdown.html`, `dashboard-cost-tracking.html`

---

## 1. System under test

The frontend is a React 18+ / TypeScript SPA that renders 5 predefined, read-only dashboard pages. It fetches structured JSON from the BFF (`GET /api/views/{view_id}`), and renders the response into chart components. There are no user-editable controls beyond sidebar navigation. All PromQL lives in the BFF — the browser never sends or sees query language.

### 1.1 Application structure

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

### 1.2 Technology stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 18+ |
| Language | TypeScript | 5.x |
| Build tool | Vite | 6.x |
| Time-series charts | uPlot + `uplot-react` | 1.6.x |
| Complex charts | Apache ECharts + `echarts-for-react` | 5.5.x |
| UI components | Ant Design | 5.x |
| Data fetching | TanStack Query | 5.x |
| Routing | React Router | 7.x |

### 1.3 BFF response schema (contract the frontend tests against)

```typescript
// types/views.ts

interface ViewListItem {
  id: string;
  title: string;
  description: string;
}

interface ViewResponse {
  view: {
    id: string;
    title: string;
    description: string;
    refreshSec: number;
  };
  panels: Panel[];
}

interface Panel {
  id: string;
  title: string;
  type: "stat" | "timeseries" | "bar" | "table" | "heatmap" | "gauge";
  unit: "reqps" | "seconds" | "bytes" | "percent" | "short" | "USD" | "tokens" | "tokps";
  data: PanelData;
  subtitle?: string;
  subtitleColor?: "success" | "danger" | "warning" | "muted";
  valueColor?: "success" | "danger" | "warning";
  displayValue?: string;
  thresholds?: Threshold[];
  annotations?: Annotation[];
}

type PanelData =
  | { resultType: "matrix"; result: MatrixResult[] }
  | { resultType: "vector"; result: VectorResult[] }
  | { resultType: "scalar"; result: [number, string] };

interface MatrixResult {
  metric: Record<string, string>;
  values: [number, string][];  // range vector: [[ts, val], ...]
}

interface VectorResult {
  metric: Record<string, string>;
  value: [number, string];     // instant vector: [timestamp, value]
}

interface Threshold {
  value: number;
  label: string;
  color?: "danger" | "warning" | "success";
}

interface Annotation {
  timestamp: number;
  value: number;
  label: string;
  color?: "danger" | "warning" | "success";
}
```

### 1.4 Predefined views (test targets)

| View ID | Page component | Stat panels | Timeseries panels | Bar panels | Table panels | Heatmap panels | refreshSec |
|---|---|---|---|---|---|---|---|
| `agent-overview` | `AgentOverview.tsx` | active_agents, total_invocations_24h, error_rate_current, p95_latency_current | invocation_rate, error_rate, p95_latency | errors_by_type, guardrail_pass_fail | — | step_distribution | 30 |
| `tool-call-performance` | `ToolCallPerformance.tsx` | active_tools, total_tool_calls_24h, tool_error_rate_current, retry_rate | tool_latency_percentiles, tool_error_rates | retry_rate_by_tool | slowest_tools | — | 30 |
| `llm-token-usage` | `LLMTokenUsage.tsx` | total_tokens_24h, token_rate, estimated_cost_24h, avg_tokens_per_invocation | token_rate_by_model, prompt_vs_completion | cost_by_model | top_token_consumers | — | 60 |
| `error-breakdown` | `ErrorBreakdown.tsx` | total_errors_24h, error_rate_overall, error_budget_remaining, most_common_error | error_rate_trend | errors_by_type, errors_by_agent | top_error_messages | — | 30 |
| `cost-tracking` | `CostTracking.tsx` | estimated_daily_cost, projected_monthly_cost, cost_per_invocation_avg, cost_change_wow | cost_trend, cost_per_invocation | cost_by_agent, cost_by_model | — | — | 300 |

---

## 2. Test pyramid strategy

```
          ┌──────────┐
          │   E2E    │  ~10 tests   — Playwright against real BFF
          │          │  Validates: critical user journeys end-to-end
          ├──────────┤
          │          │
          │Integratio│  ~35 tests   — Vitest + React Testing Library
          │   n      │  Validates: component composition, hooks with
          │          │  mocked API, page-level rendering, routing
          ├──────────┤
          │          │
          │          │
          │   Unit   │  ~90 tests   — Vitest (jsdom)
          │          │  Validates: formatters, type guards, API client,
          │          │  individual component rendering, PanelRenderer
          │          │  routing, data transformations
          │          │
          └──────────┘
```

**Guiding principle**: if a behavior can be tested by passing data directly to a function or rendering a single component with props, it belongs at the unit level. Integration tests exist for behaviors that emerge from component composition (hooks + components + routing). E2E tests exist only for things that cannot be verified without a real network stack.

### 2.1 Test file structure

```
src/
├── __tests__/
│   └── e2e/
│       ├── navigation.spec.ts          # E2E: sidebar nav, deep linking
│       ├── dashboard-views.spec.ts     # E2E: all 5 views render with real BFF
│       └── auth-redirect.spec.ts       # E2E: unauthenticated redirect
├── api/
│   ├── __tests__/
│   │   ├── client.test.ts             # Unit: fetch wrapper, JWT injection, error handling
│   │   └── views.test.ts             # Unit: fetchView/fetchPanel response parsing
├── components/
│   ├── charts/
│   │   ├── __tests__/
│   │   │   ├── StatChart.test.tsx     # Unit: renders value, unit, delta
│   │   │   ├── TimeSeriesChart.test.tsx # Unit: passes correct config to uPlot
│   │   │   ├── BarChart.test.tsx      # Unit: renders sorted bars, labels, values
│   │   │   ├── TableChart.test.tsx    # Unit: renders columns, rows, formatting
│   │   │   ├── HeatmapChart.test.tsx  # Unit: passes bucket data to ECharts
│   │   │   ├── GaugeChart.test.tsx    # Unit: renders gauge with correct range
│   │   │   └── PanelRenderer.test.tsx # Unit: routes panel.type to correct component
│   └── layout/
│       ├── __tests__/
│       │   ├── AppShell.test.tsx       # Integration: sidebar items, active state
│       │   ├── ViewPage.test.tsx       # Integration: useView hook + panel rendering
│       │   └── PanelCard.test.tsx      # Unit: loading, error, success states
├── pages/
│   ├── __tests__/
│   │   ├── AgentOverview.test.tsx      # Integration: correct panels in correct grid
│   │   ├── ToolCallPerformance.test.tsx
│   │   ├── LLMTokenUsage.test.tsx
│   │   ├── ErrorBreakdown.test.tsx
│   │   └── CostTracking.test.tsx
├── hooks/
│   ├── __tests__/
│   │   ├── useView.test.ts            # Integration: polling, staleTime, error
│   │   └── useAuth.test.ts            # Unit: token parsing, expiry check, refresh
├── types/
│   ├── __tests__/
│   │   └── views.test.ts             # Unit: type guards, validation helpers
└── utils/
    ├── __tests__/
    │   └── formatters.test.ts         # Unit: all formatting functions
└── __fixtures__/
    ├── views/
    │   ├── agent-overview.json        # Full BFF response fixture
    │   ├── tool-call-performance.json
    │   ├── llm-token-usage.json
    │   ├── error-breakdown.json
    │   └── cost-tracking.json
    ├── panels/
    │   ├── stat-panel.json            # Single panel fixtures by type
    │   ├── timeseries-panel.json
    │   ├── bar-panel.json
    │   ├── table-panel.json
    │   └── heatmap-panel.json
    └── errors/
        ├── network-error.json
        ├── 401-response.json
        ├── 404-response.json
        └── partial-failure.json
```

### 2.2 Tooling

| Layer | Tool | Runner | Environment |
|---|---|---|---|
| Unit | Vitest | `vitest run` | jsdom |
| Integration | Vitest + React Testing Library | `vitest run` | jsdom |
| E2E | Playwright | `playwright test` | Chromium against deployed frontend + BFF |

### 2.3 Shared test utilities

```typescript
// src/__tests__/test-utils.tsx

// Wraps component in all required providers for integration tests
export function renderWithProviders(
  ui: React.ReactElement,
  options?: {
    route?: string;
    queryClient?: QueryClient;
  }
) {
  const queryClient = options?.queryClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options?.route ?? '/']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Creates a mock BFF handler for MSW
export function mockViewEndpoint(
  viewId: string,
  response: ViewResponse | null,
  status: number = 200
) {
  return http.get(`/api/views/${viewId}`, () => {
    if (response === null) return HttpResponse.error();
    return HttpResponse.json(response, { status });
  });
}
```

---

## 3. Unit tests (~90 tests)

Unit tests run in jsdom with no network, no routing context, and no provider wrappers (except where a single provider is needed for a component). Each test receives data via props or function arguments. These are fast (sub-second total) and form the bulk of coverage.

### 3.1 Formatters — `utils/formatters.test.ts`

Pure functions, zero dependencies. These are the highest-value unit tests because formatting bugs are visible to every user on every page.

| ID | Function | Input | Expected output |
|---|---|---|---|
| U-FMT-001 | `formatRate` | `12.5` | `"12.5 req/s"` |
| U-FMT-002 | `formatRate` | `0.003` | `"0.003 req/s"` |
| U-FMT-003 | `formatRate` | `0` | `"0 req/s"` |
| U-FMT-004 | `formatDuration` | `0.045` | `"45ms"` |
| U-FMT-005 | `formatDuration` | `1.823` | `"1.82s"` |
| U-FMT-006 | `formatDuration` | `125.4` | `"2m 5s"` |
| U-FMT-007 | `formatDuration` | `0` | `"0ms"` |
| U-FMT-008 | `formatPercent` | `2.3` | `"2.3%"` |
| U-FMT-009 | `formatPercent` | `0.001` | `"0.001%"` |
| U-FMT-010 | `formatPercent` | `100` | `"100%"` |
| U-FMT-011 | `formatLargeNumber` | `48200` | `"48.2K"` |
| U-FMT-012 | `formatLargeNumber` | `14800000` | `"14.8M"` |
| U-FMT-013 | `formatLargeNumber` | `999` | `"999"` |
| U-FMT-014 | `formatLargeNumber` | `1000` | `"1.0K"` |
| U-FMT-015 | `formatLargeNumber` | `0` | `"0"` |
| U-FMT-016 | `formatCurrency` | `284` | `"$284"` |
| U-FMT-017 | `formatCurrency` | `0.006` | `"$0.006"` |
| U-FMT-018 | `formatCurrency` | `8520.5` | `"$8,521"` |
| U-FMT-019 | `formatCurrency` | `0` | `"$0"` |
| U-FMT-020 | `formatUnit` (dispatcher) | `("12.5", "reqps")` | `"12.5 req/s"` |
| U-FMT-021 | `formatUnit` (dispatcher) | `("1.82", "seconds")` | `"1.82s"` |
| U-FMT-022 | `formatUnit` (dispatcher) | `("2.3", "percent")` | `"2.3%"` |
| U-FMT-023 | `formatUnit` (dispatcher) | `("48200", "short")` | `"48,200"` |
| U-FMT-024 | `formatUnit` (unknown unit) | `("42", "unknown")` | `"42"` (passthrough) |

### 3.2 Type guards and validators — `types/views.test.ts`

These validate runtime shapes from the BFF, ensuring the frontend handles unexpected data gracefully.

| ID | Function | Input | Expected |
|---|---|---|---|
| U-TYPE-001 | `isPanel` | Valid panel object | `true` |
| U-TYPE-002 | `isPanel` | Missing `type` field | `false` |
| U-TYPE-003 | `isPanel` | Unknown `type: "pie"` | `false` |
| U-TYPE-004 | `isPanel` | Missing `data` field | `false` |
| U-TYPE-005 | `isViewResponse` | Valid view response | `true` |
| U-TYPE-006 | `isViewResponse` | Missing `view` object | `false` |
| U-TYPE-007 | `isViewResponse` | Empty `panels` array | `true` (valid, just no data) |
| U-TYPE-008 | `isViewResponse` | `panels` is not an array | `false` |
| U-TYPE-009 | `isMetricResult` | Vector result with `value` | `true` |
| U-TYPE-010 | `isMetricResult` | Matrix result with `values` | `true` |
| U-TYPE-011 | `isMetricResult` | Neither `value` nor `values` | `false` |
| U-TYPE-012 | `panelTypes` constant | — | Contains exactly: `"stat"`, `"timeseries"`, `"bar"`, `"table"`, `"heatmap"`, `"gauge"` |

### 3.3 API client — `api/client.test.ts`

Tests the fetch wrapper in isolation using `vi.fn()` to mock `globalThis.fetch`. No network calls.

| ID | Test case | Setup | Expected |
|---|---|---|---|
| U-API-001 | JWT injected into headers | Mock fetch; call `apiClient.get("/api/views")` | `fetch` called with `Authorization: Bearer <token>` header |
| U-API-002 | Base URL prepended | Call `apiClient.get("/api/views")` | `fetch` called with full URL including base |
| U-API-003 | 200 response parsed as JSON | Mock fetch returning `{ok: true, json: () => data}` | Returns parsed data |
| U-API-004 | 401 throws AuthError | Mock fetch returning 401 | Throws `AuthError` with status code |
| U-API-005 | 404 throws NotFoundError | Mock fetch returning 404 | Throws `NotFoundError` |
| U-API-006 | 500 throws ServerError | Mock fetch returning 500 | Throws `ServerError` |
| U-API-007 | Network error throws | Mock fetch rejecting with `TypeError` | Throws `NetworkError` |
| U-API-008 | Content-Type: application/json set | Call any method | Request includes `Content-Type: application/json` header |

### 3.4 Views API — `api/views.test.ts`

Tests the typed API functions that parse BFF responses. Uses mocked `apiClient`.

| ID | Test case | Setup | Expected |
|---|---|---|---|
| U-VIEWS-001 | `fetchViewList` returns typed array | Mock apiClient returning view list JSON | Returns `ViewListItem[]` with `id`, `title`, `description` |
| U-VIEWS-002 | `fetchView` calls correct endpoint | Call `fetchView("agent-overview")` | apiClient called with `/api/views/agent-overview` |
| U-VIEWS-003 | `fetchView` returns typed ViewResponse | Mock apiClient returning view JSON fixture | Returns `ViewResponse` with `view` and `panels` |
| U-VIEWS-004 | `fetchPanel` calls correct endpoint | Call `fetchPanel("agent-overview", "invocation_rate")` | apiClient called with `/api/views/agent-overview/panels/invocation_rate` |
| U-VIEWS-005 | `fetchView` propagates errors | Mock apiClient throwing `NotFoundError` | `fetchView` re-throws the error |
| U-VIEWS-006 | `findPanel` extracts panel by ID | Pass ViewResponse + panelId | Returns matching panel or `undefined` |
| U-VIEWS-007 | `findPanel` returns undefined for missing | Pass ViewResponse + nonexistent panelId | Returns `undefined` |

### 3.5 Auth hook utilities — `hooks/useAuth.test.ts`

Test the pure utility functions that `useAuth` depends on. The hook's React-specific behavior is tested at integration level.

| ID | Test case | Input | Expected |
|---|---|---|---|
| U-AUTH-001 | `parseJwtClaims` decodes payload | Valid JWT string | Returns `{user_id, workspace_id, org_id, role, exp}` |
| U-AUTH-002 | `parseJwtClaims` returns null for malformed | `"not.a.jwt"` | Returns `null` |
| U-AUTH-003 | `isTokenExpired` returns false for future exp | JWT with `exp` 1 hour from now | `false` |
| U-AUTH-004 | `isTokenExpired` returns true for past exp | JWT with `exp` 1 minute ago | `true` |
| U-AUTH-005 | `isTokenExpired` includes buffer | JWT expiring in 30s with 60s buffer | `true` (within buffer) |
| U-AUTH-006 | `getWorkspaceId` extracts from claims | Valid JWT | Returns `workspace_id` string |
| U-AUTH-007 | `getUserInitials` | `{name: "Jane Doe"}` | `"JD"` |
| U-AUTH-008 | `getUserInitials` single name | `{name: "Jane"}` | `"J"` |

### 3.6 PanelRenderer — `components/charts/PanelRenderer.test.tsx`

This is the routing hub. Test that each `panel.type` maps to the correct chart component. Uses shallow rendering or mocked child components.

| ID | Test case | Props | Expected |
|---|---|---|---|
| U-PR-001 | Routes `stat` to StatChart | `panel.type = "stat"` | Renders `<StatChart>` with panel data |
| U-PR-002 | Routes `timeseries` to TimeSeriesChart | `panel.type = "timeseries"` | Renders `<TimeSeriesChart>` with panel data |
| U-PR-003 | Routes `bar` to BarChart | `panel.type = "bar"` | Renders `<BarChart>` with panel data |
| U-PR-004 | Routes `table` to TableChart | `panel.type = "table"` | Renders `<TableChart>` with panel data |
| U-PR-005 | Routes `heatmap` to HeatmapChart | `panel.type = "heatmap"` | Renders `<HeatmapChart>` with panel data |
| U-PR-006 | Routes `gauge` to GaugeChart | `panel.type = "gauge"` | Renders `<GaugeChart>` with panel data |
| U-PR-007 | Unknown type renders fallback | `panel.type = "unknown"` | Renders fallback message, no crash |
| U-PR-008 | Passes `unit` prop through | `panel.unit = "reqps"` | Child component receives `unit="reqps"` |
| U-PR-009 | Passes `title` prop through | `panel.title = "Invocation Rate"` | Child component receives title |

### 3.7 StatChart — `components/charts/StatChart.test.tsx`

Renders a single big number with optional delta. Pure component, props-driven.

| ID | Test case | Props (panel fixture) | Expected DOM |
|---|---|---|---|
| U-STAT-001 | Renders value | `data.result[0].value = [ts, "12"]` | Text "12" visible |
| U-STAT-002 | Formats value with unit | `unit: "reqps"`, value `"33.5"` | Text "33.5 req/s" visible |
| U-STAT-003 | Formats large number | `unit: "short"`, value `"48200"` | Text "48.2K" visible |
| U-STAT-004 | Formats percent | `unit: "percent"`, value `"2.3"` | Text "2.3%" visible |
| U-STAT-005 | Formats currency | `unit: "dollars"`, value `"284"` | Text "$284" visible |
| U-STAT-006 | Renders title | `title: "Active agents"` | Text "Active agents" visible |
| U-STAT-007 | Renders with empty data | `data.result = []` | Renders "—" or "No data" placeholder, no crash |
| U-STAT-008 | Danger color for error rate | `unit: "percent"`, value `"2.3"`, `semanticColor: "danger"` | Value element has danger/red color style |
| U-STAT-009 | Success color for improvement | `semanticColor: "success"` | Value element has success/green color style |

### 3.8 BarChart — `components/charts/BarChart.test.tsx`

Renders horizontal bars from vector data. Passed panel data as props.

| ID | Test case | Props (panel fixture) | Expected |
|---|---|---|---|
| U-BAR-001 | Renders correct number of bars | 5 items in `data.result` | 5 bar elements rendered |
| U-BAR-002 | Bars sorted by value descending | Values: 342, 228, 142, 71, 38 | First bar label is the item with value 342 |
| U-BAR-003 | Labels rendered | metric labels `{error_type: "LLM timeout"}` | Text "LLM timeout" visible |
| U-BAR-004 | Values rendered | value `"342"` | Text "342" visible next to bar |
| U-BAR-005 | Bar widths proportional | Max value 342, another 171 | Second bar approximately 50% width of first |
| U-BAR-006 | Empty data shows placeholder | `data.result = []` | "No data" visible, no crash |
| U-BAR-007 | Single item renders | 1 item in `data.result` | 1 bar at full width |
| U-BAR-008 | Formats values with unit | `unit: "percent"`, value `"12.3"` | Text "12.3%" visible |

### 3.9 TableChart — `components/charts/TableChart.test.tsx`

Renders an Ant Design table from panel data.

| ID | Test case | Props (panel fixture) | Expected |
|---|---|---|---|
| U-TBL-001 | Renders header row | `slowest_tools` fixture | Column headers: "Tool", "p95", "Calls", "Errors" (or derived from metric keys) |
| U-TBL-002 | Renders correct row count | 5 items in `data.result` | 5 data rows |
| U-TBL-003 | Cell values formatted | p95 value `"4.2"`, unit `"seconds"` | Cell shows "4.2s" |
| U-TBL-004 | Rows sorted by primary column | p95 values: 4.2, 3.1, 2.8, 1.4, 0.9 | First row has 4.2s |
| U-TBL-005 | Danger color on high values | p95 > 3s | Cell rendered in danger color |
| U-TBL-006 | Warning color on medium values | 2s < p95 ≤ 3s | Cell rendered in warning color |
| U-TBL-007 | Empty data shows placeholder | `data.result = []` | Empty table state, no crash |
| U-TBL-008 | Monospace formatting for error messages | `top_error_messages` fixture | Error text rendered in monospace font |

### 3.10 TimeSeriesChart — `components/charts/TimeSeriesChart.test.tsx`

Tests the uPlot wrapper. Since uPlot renders to canvas (not DOM), these tests focus on correct data transformation and option construction passed to the uPlot instance.

| ID | Test case | Props (panel fixture) | Expected |
|---|---|---|---|
| U-TS-001 | Transforms matrix to uPlot format | 3 series, 10 timestamps each | uPlot data array: `[timestamps, series1values, series2values, series3values]` |
| U-TS-002 | Series labels from metric | `metric: {agent_name: "order-processor"}` | uPlot series config includes `label: "order-processor"` |
| U-TS-003 | Y-axis label from unit | `unit: "reqps"` | uPlot axes config includes label "req/s" |
| U-TS-004 | Y-axis label for percent | `unit: "percent"` | uPlot axes config includes label "%" |
| U-TS-005 | Y-axis label for seconds | `unit: "seconds"` | uPlot axes config includes label "s" |
| U-TS-006 | Single series renders | 1 series in data | uPlot data has 2 arrays (timestamps + 1 series) |
| U-TS-007 | Empty data handled | `data.result = []` | Component renders "No data" placeholder, uPlot not initialized |
| U-TS-008 | Timestamp conversion | BFF timestamps in seconds | Converted correctly for uPlot (expects seconds) |
| U-TS-009 | String values parsed to numbers | `values: [[ts, "12.5"]]` | Numeric `12.5` in uPlot data |
| U-TS-010 | Distinct colors per series | 3 series | 3 different stroke colors in series config |

### 3.11 HeatmapChart — `components/charts/HeatmapChart.test.tsx`

| ID | Test case | Props | Expected |
|---|---|---|---|
| U-HM-001 | Passes bucket data to ECharts | Matrix with `le` labels | ECharts option includes heatmap series with correct bucket boundaries |
| U-HM-002 | Empty data handled | `data.result = []` | Renders placeholder, no crash |

### 3.12 PanelCard — `components/layout/PanelCard.test.tsx`

Wrapper component with three states: loading, error, success.

| ID | Test case | Props | Expected DOM |
|---|---|---|---|
| U-PC-001 | Loading state | `loading: true, panels: undefined` | Skeleton placeholder visible; no chart rendered |
| U-PC-002 | Success state | `loading: false, panels: [validPanel]` | Panel title visible; PanelRenderer rendered |
| U-PC-003 | Panel not found | `loading: false, panels: [], panelId: "missing"` | Renders "Panel not available" message |
| U-PC-004 | Title displayed | Panel with `title: "Error Rate"` | Text "Error Rate" visible |
| U-PC-005 | Error state | `error: new Error("fail")` | Error message visible; no chart rendered |
| U-PC-006 | Subtitle with unit and time range | Panel with `unit: "reqps"` | Subtitle includes unit descriptor |

---

## 4. Integration tests (~35 tests)

Integration tests render multiple components together with mocked network (MSW). They validate behaviors that emerge from composition: hooks fetching data, pages laying out panels, routing selecting pages.

MSW (Mock Service Worker) intercepts `fetch` calls and returns fixture data. No real BFF needed.

### 4.1 useView hook — `hooks/useView.test.ts`

Uses `renderHook` from React Testing Library with a `QueryClientProvider` wrapper and MSW.

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-HOOK-001 | Returns data on success | MSW returns agent-overview fixture | `result.current.data` matches fixture; `isLoading` transitions false → true → false |
| I-HOOK-002 | Returns error on 404 | MSW returns 404 | `result.current.error` is truthy; `data` is undefined |
| I-HOOK-003 | Returns error on network failure | MSW returns network error | `result.current.error` is truthy |
| I-HOOK-004 | Polling interval from response | MSW returns `{view: {refreshSec: 60}}` | After initial fetch, next refetch scheduled ~60s later (verify with `vi.advanceTimersByTime`) |
| I-HOOK-005 | Default polling interval | MSW returns response without `refreshSec` | Falls back to 30s polling |
| I-HOOK-006 | staleTime prevents immediate refetch | Render hook, trigger refetch within 10s | No additional network request (staleTime: 10000) |
| I-HOOK-007 | Query key includes viewId | Render hooks for two different viewIds | Two separate cache entries; changing viewId triggers new fetch |

### 4.2 useAuth hook — `hooks/useAuth.test.ts`

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-AUTH-001 | Provides auth state from stored token | localStorage has valid JWT | `result.current.isAuthenticated` is `true`; `workspaceName` populated |
| I-AUTH-002 | Redirects on expired token | localStorage has expired JWT | `result.current.isAuthenticated` is `false` |
| I-AUTH-003 | Token refresh before expiry | JWT expiring in 30s, refresh endpoint mocked | Refresh request fired; new token stored |

### 4.3 AppShell — `components/layout/AppShell.test.tsx`

Rendered with `MemoryRouter` and mocked `useAuth`. Tests sidebar navigation and layout structure.

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-SHELL-001 | Renders all 5 nav items | Render AppShell at `/` | Sidebar contains: "Agent overview", "Tool call performance", "LLM token usage", "Error breakdown", "Cost tracking" |
| I-SHELL-002 | Active indicator on current route | Render at `/views/agent-overview` | "Agent overview" nav item has active styling (e.g., `aria-current="page"`) |
| I-SHELL-003 | Active indicator follows navigation | Click "Cost tracking" | "Cost tracking" gets active styling; "Agent overview" loses it |
| I-SHELL-004 | Header shows workspace name | Mock useAuth returning `{workspaceName: "Acme Corp"}` | Text "Acme Corp" visible in header |
| I-SHELL-005 | Header shows user initials | Mock useAuth returning `{userInitials: "JD"}` | Avatar element with "JD" visible |
| I-SHELL-006 | Live indicator visible | Render AppShell | Green dot + "Live" text visible in header |
| I-SHELL-007 | Logo/brand rendered | Render AppShell | Application name/logo visible in header |

### 4.4 Page components — per-view integration tests

Each page test renders the page component with MSW returning the corresponding view fixture. Validates that the correct panels appear in the correct grid layout.

#### 4.4.1 Agent overview — `pages/AgentOverview.test.tsx`

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-AO-001 | Renders page title | MSW returns agent-overview fixture | Heading "Agent Execution Overview" visible |
| I-AO-002 | Row 1: four stat panels | Inspect rendered DOM | 4 stat cards: "Active agents", "Total invocations", "Error rate", "p95 latency" |
| I-AO-003 | Row 2: two timeseries panels | Inspect rendered DOM | "Invocation rate" and "Error rate" panels visible |
| I-AO-004 | Row 3: bar + timeseries | Inspect rendered DOM | "Errors by type" and "Execution latency (p95)" panels visible |
| I-AO-005 | All panels receive data | Wait for loading to complete | No panels show loading skeleton; no panels show "No data" |
| I-AO-006 | Error state on BFF failure | MSW returns 500 | Error message displayed; no panels crash |

#### 4.4.2 Tool call performance — `pages/ToolCallPerformance.test.tsx`

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-TCP-001 | Renders page title | MSW returns fixture | Heading "Tool Call Performance" visible |
| I-TCP-002 | Row 1: four stat cards | Inspect DOM | "Active tools", "Total tool calls", "Tool error rate", "Retry rate" |
| I-TCP-003 | Row 2: latency + error charts | Inspect DOM | "Tool latency p50/p95/p99" and "Tool error rates" panels visible |
| I-TCP-004 | Row 3: bar + table | Inspect DOM | "Retry rate by tool" bar chart and "Slowest tools" table visible |

#### 4.4.3 LLM token usage — `pages/LLMTokenUsage.test.tsx`

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-LTU-001 | Renders page title | MSW returns fixture | Heading "LLM Token Usage" visible |
| I-LTU-002 | Row 1: four stat cards | Inspect DOM | "Total tokens", "Token rate", "Estimated cost", "Avg tokens/invocation" |
| I-LTU-003 | Row 2: model chart + prompt/completion | Inspect DOM | "Tokens by model" and "Prompt vs completion" visible |
| I-LTU-004 | Row 3: cost bar + consumers table | Inspect DOM | "Cost by model" and "Top consumers" visible |

#### 4.4.4 Error breakdown — `pages/ErrorBreakdown.test.tsx`

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-EB-001 | Renders page title | MSW returns fixture | Heading "Error Breakdown" visible |
| I-EB-002 | Row 1: four stat cards | Inspect DOM | "Total errors", "Error rate", "Error budget remaining", "Most common error" |
| I-EB-003 | Row 2: trend + type bars | Inspect DOM | "Error rate trend" and "Errors by type" visible |
| I-EB-004 | Row 3: agent bars + messages table | Inspect DOM | "Errors by agent" and "Top error messages" visible |

#### 4.4.5 Cost tracking — `pages/CostTracking.test.tsx`

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-CT-001 | Renders page title | MSW returns fixture | Heading "Cost Tracking" visible |
| I-CT-002 | Row 1: four stat cards | Inspect DOM | "Daily cost", "Projected monthly", "Cost per invocation", "Week-over-week" |
| I-CT-003 | Row 2: cost trend + per-invocation | Inspect DOM | "Daily cost trend" and "Cost per invocation" visible |
| I-CT-004 | Row 3: agent bars + model bars | Inspect DOM | "Cost by agent" and "Cost by model" visible |

### 4.5 Routing — rendered within full `<App>` with MSW

| ID | Test case | Setup | Expected |
|---|---|---|---|
| I-ROUTE-001 | Root redirects to agent overview | Render App at `/` | Agent overview page renders |
| I-ROUTE-002 | Direct URL to view | Render App at `/views/cost-tracking` | Cost tracking page renders |
| I-ROUTE-003 | Unknown route shows 404 | Render App at `/views/nonexistent` | "View not found" message within AppShell |
| I-ROUTE-004 | Navigation updates URL | Click "Error breakdown" in sidebar | URL contains `/views/error-breakdown`; Error breakdown renders |

---

## 5. E2E tests (~10 tests)

E2E tests run in Playwright against a deployed frontend + BFF (staging or local Docker Compose). They validate what cannot be tested without a real browser and real network stack: full page rendering with Canvas-based charts, navigation transitions, auto-refresh over time, and authentication redirects.

**Every E2E test must justify why it cannot be covered at a lower level.**

### 5.1 Test environment

```yaml
# docker-compose.test.yml
services:
  mimir:
    image: grafana/mimir:latest
    # Pre-seeded with test data via mimirtool
  bff:
    image: platform/metrics-bff:test
    environment:
      MIMIR_QUERY_FRONTEND_URL: http://mimir:8080
      JWT_JWKS_URL: http://mock-iam:8080/.well-known/jwks.json
  frontend:
    image: platform/dashboard-frontend:test
    ports: ["3000:80"]
  mock-iam:
    image: platform/mock-iam:test
    # Issues valid JWTs for test workspace
```

### 5.2 Test cases

| ID | Test case | Justification (why not lower level) | Steps | Expected |
|---|---|---|---|---|
| E2E-001 | Full agent overview renders with charts | Canvas-based uPlot/ECharts charts are invisible to jsdom; need real browser to verify they render pixels | Login → navigate to agent overview → wait for data | All 4 stat cards show numeric values; chart canvases have non-zero dimensions; no blank panels |
| E2E-002 | Full tool call performance renders | Same: Canvas chart verification | Navigate to tool call performance | Stat cards, charts, and table all populated |
| E2E-003 | Full LLM token usage renders | Same | Navigate to LLM token usage | All panels populated |
| E2E-004 | Full error breakdown renders | Same | Navigate to error breakdown | All panels populated, error messages in monospace |
| E2E-005 | Full cost tracking renders | Same | Navigate to cost tracking | Bar chart colors visible (green/amber/red) |
| E2E-006 | Sidebar navigation cycle | Multi-page transition with scroll position and active state, hard to fully simulate in jsdom | Click each sidebar item sequentially | Each page loads, sidebar active state updates, URL changes, no stale content from previous page |
| E2E-007 | Auto-refresh updates data | Requires real time passage and network; `vi.advanceTimersByTime` doesn't exercise real polling | Navigate to agent overview → wait 35s → modify Mimir data → wait for next poll | Stat card values update without page reload; no loading flash |
| E2E-008 | Unauthenticated redirect | Full browser redirect behavior including cookie handling | Open dashboard URL with no session/token | Browser redirects to login page; no dashboard content flashes |
| E2E-009 | Deep link with authentication | Full auth + routing integration | Open `/views/error-breakdown` directly with valid cookie | Error breakdown page renders (not agent overview); sidebar highlights correctly |
| E2E-010 | Charts resize on viewport change | Canvas resize behavior is browser-native | Load agent overview → resize viewport to 1024px → resize to 1440px | Charts resize to fill container; no overflow; no cropped axes; legends remain visible |

---

## 6. Test data fixtures

### 6.1 Fixture design principles

Fixtures are JSON files matching the BFF `ViewResponse` schema exactly. Each fixture contains realistic data that exercises edge cases visible in the wireframes.

```
src/__fixtures__/
├── views/
│   ├── agent-overview.json          # 6 panels: 4 stat + invocation_rate + error_rate + errors_by_type + p95_latency + step_distribution
│   ├── tool-call-performance.json   # stat cards + percentile chart + error rates + retry bar + slowest table
│   ├── llm-token-usage.json         # stat cards + stacked area + prompt/completion + cost bar + consumers table
│   ├── error-breakdown.json         # stat cards + error trend + type bar + agent bar + messages table
│   └── cost-tracking.json           # stat cards + daily cost bar + per-invocation trend + agent bar + model bar
├── panels/
│   ├── stat-panel-normal.json       # Single value, no semantic color
│   ├── stat-panel-danger.json       # Value that should render in danger color
│   ├── stat-panel-success.json      # Value with positive delta
│   ├── timeseries-single.json       # 1 series, 24h of data points
│   ├── timeseries-multi.json        # 3 series (order-processor, support-bot, data-enricher)
│   ├── timeseries-empty.json        # 0 series
│   ├── bar-sorted.json              # 5 items in descending order
│   ├── bar-single.json              # 1 item
│   ├── bar-empty.json               # 0 items
│   ├── table-tools.json             # Slowest tools table data
│   ├── table-errors.json            # Error messages table data
│   ├── table-consumers.json         # Top consumers table data
│   ├── table-empty.json             # 0 rows
│   └── heatmap-buckets.json         # Histogram bucket data with le labels
└── errors/
    ├── network-error.json           # For simulating fetch failure
    ├── 401-response.json            # Unauthorized
    ├── 404-response.json            # View not found
    └── partial-failure.json         # View response where some panels have errors
```

### 6.2 Fixture factory functions

```typescript
// src/__fixtures__/factories.ts

export function makeStatPanel(overrides?: Partial<Panel>): Panel {
  return {
    id: "test_stat",
    title: "Test Stat",
    type: "stat",
    unit: "short",
    data: {
      resultType: "vector",
      result: [{ metric: {}, value: [Date.now() / 1000, "42"] }],
    },
    ...overrides,
  };
}

export function makeTimeSeriesPanel(
  seriesCount: number = 1,
  pointCount: number = 10,
  overrides?: Partial<Panel>
): Panel {
  const now = Math.floor(Date.now() / 1000);
  const step = 60;
  return {
    id: "test_timeseries",
    title: "Test Time Series",
    type: "timeseries",
    unit: "reqps",
    data: {
      resultType: "matrix",
      result: Array.from({ length: seriesCount }, (_, s) => ({
        metric: { agent_name: `agent-${s}` },
        values: Array.from({ length: pointCount }, (_, i) => [
          now - (pointCount - i) * step,
          String(Math.random() * 100),
        ] as [number, string]),
      })),
    },
    ...overrides,
  };
}

export function makeBarPanel(itemCount: number = 5, overrides?: Partial<Panel>): Panel {
  return {
    id: "test_bar",
    title: "Test Bar",
    type: "bar",
    unit: "short",
    data: {
      resultType: "vector",
      result: Array.from({ length: itemCount }, (_, i) => ({
        metric: { error_type: `error-${i}` },
        value: [Date.now() / 1000, String(100 - i * 15)] as [number, string],
      })),
    },
    ...overrides,
  };
}

export function makeViewResponse(
  viewId: string,
  panels: Panel[],
  refreshSec: number = 30
): ViewResponse {
  return {
    view: { id: viewId, title: `Test View: ${viewId}`, description: `Test description for ${viewId}`, refreshSec },
    panels,
  };
}
```

---

## 7. Coverage targets

| Layer | Line coverage | Branch coverage | Rationale |
|---|---|---|---|
| `utils/` | 100% | 100% | Pure functions, no excuse for gaps |
| `types/` | 100% | 100% | Type guards, pure logic |
| `api/` | 95%+ | 90%+ | Every error path and header injection |
| `components/charts/` | 90%+ | 85%+ | All panel types, all data states (empty, single, multi) |
| `components/layout/` | 90%+ | 85%+ | Loading, error, success states |
| `pages/` | 85%+ | 80%+ | Panel presence and grid layout per view |
| `hooks/` | 90%+ | 85%+ | Polling, error, stale-time behavior |
| **Overall** | **90%+** | **85%+** | — |

Exclusions from coverage: `main.tsx` (app bootstrap), Vite config, Canvas internals of uPlot/ECharts (tested via E2E).

---

## 8. CI integration

```yaml
# .github/workflows/frontend-tests.yml
name: Frontend Tests

on: [push, pull_request]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx vitest run --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    needs: unit-and-integration  # only run if unit/integration pass
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: docker compose -f docker-compose.test.yml up -d
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces
          path: test-results/
```

**Pipeline rule**: unit + integration tests must pass before E2E tests start. E2E failures produce Playwright trace files for debugging.

---

## 9. Test execution summary template

```
Run date:       ____-__-__
Frontend version: ________
Node version:     ________
Tester:           ________

Layer                          Total  Pass  Fail  Skip
──────────────────────────────────────────────────────
UNIT: Formatters (3.1)           24   ___   ___   ___
UNIT: Type guards (3.2)          12   ___   ___   ___
UNIT: API client (3.3)            8   ___   ___   ___
UNIT: Views API (3.4)             7   ___   ___   ___
UNIT: Auth utils (3.5)            8   ___   ___   ___
UNIT: PanelRenderer (3.6)         9   ___   ___   ___
UNIT: StatChart (3.7)             9   ___   ___   ___
UNIT: BarChart (3.8)              8   ___   ___   ___
UNIT: TableChart (3.9)            8   ___   ___   ___
UNIT: TimeSeriesChart (3.10)     10   ___   ___   ___
UNIT: HeatmapChart (3.11)         2   ___   ___   ___
UNIT: PanelCard (3.12)            6   ___   ___   ___
──────────────────────────────────────────────────────
Unit subtotal                   111   ___   ___   ___
──────────────────────────────────────────────────────
INTG: useView hook (4.1)          7   ___   ___   ___
INTG: useAuth hook (4.2)          3   ___   ___   ___
INTG: AppShell (4.3)              7   ___   ___   ___
INTG: Agent Overview (4.4.1)      6   ___   ___   ___
INTG: Tool Call Perf (4.4.2)      4   ___   ___   ___
INTG: LLM Token Usage (4.4.3)    4   ___   ___   ___
INTG: Error Breakdown (4.4.4)     4   ___   ___   ___
INTG: Cost Tracking (4.4.5)       4   ___   ___   ___
INTG: Routing (4.5)               4   ___   ___   ___
──────────────────────────────────────────────────────
Integration subtotal              43   ___   ___   ___
──────────────────────────────────────────────────────
E2E (5.2)                        10   ___   ___   ___
──────────────────────────────────────────────────────
TOTAL                           164   ___   ___   ___

Coverage:  lines ____%   branches ____%
```

---

*End of document.*
