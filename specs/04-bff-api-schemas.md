# BFF API Schemas

Canonical reference for the Go BFF response types and JSON wire format.
TypeScript mirror: `src/types/views.ts`

---

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/views` | GET | List available views |
| `GET /api/views/{view_id}` | GET | All panels for a view |
| `GET /api/views/{view_id}/panels/{panel_id}` | GET | Single panel (targeted refresh) |
| `GET /api/health` | GET | Liveness (`{"status":"ok"}`) |
| `GET /api/ready` | GET | Readiness — Mimir reachable (`{"status":"ready"}`) |

All endpoints require `Authorization: Bearer <JWT>`. The BFF derives the Mimir tenant ID (`org-{org_id}__ws-{workspace_id}`) from JWT claims — the frontend never supplies it.

---

## Go Structs

### View List (`GET /api/views`)

```go
// ViewListItem is one entry in the view catalogue.
type ViewListItem struct {
    ID          string `json:"id"`
    Title       string `json:"title"`
    Description string `json:"description"`
}
```

### View Response (`GET /api/views/{view_id}`)

```go
// ViewResponse is the top-level envelope returned for a view.
type ViewResponse struct {
    View   ViewMeta `json:"view"`
    Panels []Panel  `json:"panels"`
}

// ViewMeta contains view-level metadata.
type ViewMeta struct {
    ID          string `json:"id"`
    Title       string `json:"title"`
    Description string `json:"description"`
    RefreshSec  int    `json:"refreshSec"`
}
```

### Panel

```go
// Panel represents a single dashboard panel.
type Panel struct {
    ID            string      `json:"id"`
    Title         string      `json:"title"`
    Type          PanelType   `json:"type"`
    Unit          PanelUnit   `json:"unit"`
    Data          PanelData   `json:"data"`
    Subtitle      string      `json:"subtitle,omitempty"`
    SubtitleColor string      `json:"subtitleColor,omitempty"` // "success"|"danger"|"warning"|"muted"
    ValueColor    string      `json:"valueColor,omitempty"`    // "success"|"danger"|"warning"
    DisplayValue  string      `json:"displayValue,omitempty"`  // overrides formatted numeric value
    Thresholds    []Threshold `json:"thresholds,omitempty"`
    Annotations   []Annotation`json:"annotations,omitempty"`
}

// PanelType enumerates the chart types the frontend can render.
type PanelType string

const (
    PanelTypeTimeseries PanelType = "timeseries"
    PanelTypeStat       PanelType = "stat"
    PanelTypeGauge      PanelType = "gauge"
    PanelTypeHeatmap    PanelType = "heatmap"
    PanelTypeBar        PanelType = "bar"
    PanelTypeTable      PanelType = "table"
)

// PanelUnit controls how the frontend formats numeric values.
type PanelUnit string

const (
    UnitReqPS   PanelUnit = "reqps"   // requests per second
    UnitSeconds PanelUnit = "seconds" // duration
    UnitBytes   PanelUnit = "bytes"   // binary bytes (KB/MB/GB)
    UnitPercent PanelUnit = "percent" // percentage (0–100)
    UnitShort   PanelUnit = "short"   // compact number (1K, 1M)
    UnitUSD     PanelUnit = "USD"     // US dollars
    UnitTokens  PanelUnit = "tokens"  // token count
    UnitTokPS   PanelUnit = "tokps"   // tokens per second
)
```

### Thresholds & Annotations

```go
// Threshold draws a horizontal reference line on timeseries charts.
type Threshold struct {
    Value float64 `json:"value"`
    Label string  `json:"label"`
    Color string  `json:"color,omitempty"` // "danger"|"warning"|"success"
}

// Annotation marks a specific point on a timeseries chart (e.g. spike).
type Annotation struct {
    Timestamp int64   `json:"timestamp"` // unix epoch seconds
    Value     float64 `json:"value"`
    Label     string  `json:"label"`
    Color     string  `json:"color,omitempty"` // "danger"|"warning"|"success"
}
```

### Panel Data (Prometheus-Compatible)

The `data` field uses the same envelope as Prometheus query results:

```go
// PanelData wraps Prometheus-compatible query results.
// Exactly one of Matrix, Vector, or Scalar is non-nil.
type PanelData struct {
    ResultType string        `json:"resultType"` // "matrix"|"vector"|"scalar"
    Result     json.RawMessage `json:"result"`   // decoded per resultType
}

// MatrixResult is a time series — used by timeseries and heatmap panels.
type MatrixResult struct {
    Metric map[string]string `json:"metric"`
    Values [][2]interface{}  `json:"values"` // [][unix_epoch, string_value]
}

// VectorResult is an instant vector — used by stat, bar, and table panels.
type VectorResult struct {
    Metric map[string]string `json:"metric"`
    Value  [2]interface{}    `json:"value"` // [unix_epoch, string_value]
}
```

---

## JSON Examples

### Matrix result (timeseries panel)

```json
{
  "id": "invocation_rate",
  "title": "Invocation Rate",
  "type": "timeseries",
  "unit": "reqps",
  "subtitle": "req/s · 24h · by agent",
  "thresholds": [
    {"value": 3, "label": "SLO 3%", "color": "warning"}
  ],
  "annotations": [
    {"timestamp": 1710723600, "value": 9.2, "label": "spike 9.2%", "color": "danger"}
  ],
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
```

### Vector result (stat panel)

```json
{
  "id": "active_agents",
  "title": "Active Agents",
  "type": "stat",
  "unit": "short",
  "displayValue": "42",
  "subtitle": "▲ 12% vs yesterday",
  "subtitleColor": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {},
        "value": [1710720000, "42"]
      }
    ]
  }
}
```

### View list response

```json
[
  {"id": "agent-overview",        "title": "Agent Execution Overview",  "description": "Real-time agent health and performance"},
  {"id": "tool-call-performance", "title": "Tool Call Performance",     "description": "Per-tool latency and error rates"},
  {"id": "llm-token-usage",       "title": "LLM Token Usage",          "description": "Token consumption and cost by model"},
  {"id": "error-breakdown",       "title": "Error Breakdown",          "description": "Error categorization and trends"},
  {"id": "cost-tracking",         "title": "Cost Tracking",            "description": "Estimated costs and projections"}
]
```

### Full view response

```json
{
  "view": {
    "id": "agent-overview",
    "title": "Agent Execution Overview",
    "description": "Real-time view of agent health, error rates, and execution performance",
    "refreshSec": 30
  },
  "panels": [
    { "...stat panel..." : "..." },
    { "...timeseries panel..." : "..." }
  ]
}
```

---

## Panel Type → Result Type Mapping

| Panel Type | Expected `resultType` | Notes |
|---|---|---|
| `timeseries` | `matrix` | Multi-series time series |
| `heatmap` | `matrix` | Y-axis from `le` label (histogram buckets) |
| `stat` | `vector` | Single value from first result |
| `gauge` | `vector` | Single value, `max: 100` for percent unit |
| `bar` | `vector` | One bar per result entry |
| `table` | `vector` | Columns from metric keys + value |

---

## Request Flow

```
Browser                BFF                          Mimir Query Frontend
───────                ───                          ────────────────────
  │                     │                                    │
  │ GET /api/views/agent-overview                            │
  │ Authorization: Bearer <JWT>                              │
  │────────────────────▶│                                    │
  │                     │ Extract org_id, workspace_id       │
  │                     │ from JWT claims                    │
  │                     │                                    │
  │                     │ X-Scope-OrgID: org-acme__ws-prod   │
  │                     │ POST /prometheus/api/v1/query_range│
  │                     │────────────────────────────────────▶│
  │                     │◀────────────────────────────────────│
  │                     │                                    │
  │                     │ Assemble ViewResponse              │
  │◀────────────────────│                                    │
  │                     │                                    │
```

The BFF executes all panel queries for a view in parallel (bounded by per-workspace concurrency limit), merges results, and returns them in a single response.
