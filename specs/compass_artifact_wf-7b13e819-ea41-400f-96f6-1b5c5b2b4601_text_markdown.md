# Building a custom observability dashboard on the Grafana LGTM stack

**The optimal architecture pairs a React + uPlot custom frontend with a Go backend-for-frontend (BFF) that enforces tenant isolation via `X-Scope-OrgID` injection, while Grafana runs alongside as an internal power-user tool.** This pattern lets you expose a branded, simplified monitoring experience to tenants while platform engineers retain Grafana's full exploratory capabilities — both querying the same Mimir, Loki, and Tempo backends. Perses, the Apache 2.0-licensed CNCF dashboard project, emerges as a compelling middle ground: its embeddable React components and native Prometheus/Loki/Tempo support can accelerate development without the licensing constraints of Grafana's AGPLv3. The architecture below draws on patterns proven at Unity Technologies (150M+ active series on Mimir), Amadeus (5,000+ Perses dashboards), and Grafana Cloud's own multi-tenant infrastructure.

---

## The recommended frontend stack mirrors what Grafana itself uses

**React + TypeScript is the unanimous choice** across every major observability platform. Grafana, Datadog, New Relic, SigNoz, and HyperDX all build on React. No major observability tool uses Vue or Angular for its primary dashboard UI. The ecosystem of visualization libraries, query editors, and log viewers is deepest in React.

For charting, the stack splits into two libraries by purpose. **uPlot** handles all time-series visualization — it renders **150,000 data points in 135ms** from cold start at just **~50 KB** bundled. Grafana itself migrated from Flot to uPlot, and subsequently hired uPlot's creator, Leon Sorokin. The `uplot-react` wrapper provides clean React integration. **Apache ECharts** fills the gaps uPlot doesn't cover: heatmaps, gauges, pie charts, bar charts, and statistical visualizations. At ~1 MB (tree-shakeable), ECharts handles 10K+ points well and supports both Canvas and SVG rendering. OpenObserve explicitly migrated from Plotly to ECharts for performance reasons.

| Library | Bundle size | 150K points cold start | Best for |
|---------|------------|----------------------|----------|
| **uPlot** | ~50 KB | **34 ms** | Time-series lines, areas, multi-axis |
| **Apache ECharts** | ~1 MB | 55 ms | Heatmaps, gauges, diverse chart types |
| Recharts | ~200 KB | SVG-limited | Simple dashboards (<10K points) |
| Plotly.js | **~3.6 MB** | 310 ms | Scientific/3D (avoid for observability) |
| Victory | ~150 KB | SVG-limited | Cross-platform (React Native) |

For **log viewing**, two strong React components exist: `@melloware/react-logviewer` (virtualized rendering, ANSI color, WebSocket streaming) and `@patternfly/react-log-viewer` from Red Hat (~13K weekly npm downloads, enterprise-grade). For **flame graphs and trace visualization**, `d3-flame-graph` (v12.3.3, maintained by Netflix's Martin Spier) and `@pyroscope/flamegraph` (Grafana's profiling component) both work well. Trace Gantt charts (span waterfall views) will likely need a custom Canvas-based component — `flame-chart-js` provides a starting point with waterfall support.

The full recommended stack:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18+ / TypeScript | Industry standard, deepest ecosystem |
| Time-series charts | uPlot via `uplot-react` | Same library Grafana uses, best performance |
| Complex visualizations | Apache ECharts via `echarts-for-react` | Heatmaps, gauges, statistical charts |
| Log viewer | `@melloware/react-logviewer` | Virtualized rendering, streaming support |
| Flame graphs | `d3-flame-graph` or `@pyroscope/flamegraph` | Mature, actively maintained |
| UI components | Material UI or Ant Design | As recommended by Grafana staff |
| Data fetching | TanStack Query (React Query) | Caching, refetching, query state management |

### Why Grafana's own libraries cannot be used standalone

**`@grafana/ui`, `@grafana/data`, and `@grafana/scenes` are not usable outside Grafana.** Multiple developers report compilation errors (`Module not found: Error: Can't resolve 'stream'`) when importing `@grafana/ui` into standalone Create React App or Vite projects. Grafana staff member Marcus Olsson confirmed: *"@grafana/ui is designed to be used for Grafana itself and plugin development. It's not intended to be used as a standalone design system."* The packages depend on `@grafana/runtime`, which requires Grafana's SystemJS module loading context.

**`@grafana/scenes`** is tightly coupled to the Grafana plugin runtime. Co-founder Torkel Ödegaard stated: *"The Scenes framework relies on the Grafana runtime... it doesn't include any visualizations. It doesn't include any data sources, so those must be loaded from the runtime."* Its peer dependencies include `@grafana/runtime >=10.4`, confirming it cannot function standalone. While Grafana has expressed interest in exploring a standalone runtime, none exists as of early 2026.

---

## The BFF pattern is mandatory for secure multi-tenant queries

**Never expose Mimir, Loki, or Tempo directly to the internet.** These systems have zero built-in authentication — they trust the `X-Scope-OrgID` header unconditionally. A malicious client could simply set the header to any tenant ID and access another tenant's data. The backends also expose administrative endpoints (`/config`, `/flush`, `/shutdown`) that must remain internal.

The correct architecture places a **backend-for-frontend (BFF) service** as the trust boundary:

```
┌──────────────┐     ┌──────────────────┐
│  Custom UI   │     │  Grafana          │
│  (Browser)   │     │  (Internal only)  │
└──────┬───────┘     └──────┬───────────┘
       │ HTTPS + JWT         │ Internal K8s DNS
       │                     │ + static X-Scope-OrgID
       ▼                     │   per datasource
┌──────────────┐             │
│   BFF (Go)   │             │
│              │             │
│ 1. Validate JWT            │
│ 2. Map user→tenant         │
│ 3. Inject X-Scope-OrgID   │
│ 4. Validate query          │
│ 5. Rate limit              │
│ 6. Proxy request           │
└──────┬───────┘             │
       │                     │
       ▼                     ▼
┌────────────────────────────────────┐
│  Mimir / Loki / Tempo              │
│  Query Frontends (K8s internal)    │
│  Stateless, per-tenant queuing     │
└────────────────────────────────────┘
```

**Go is the natural BFF language** — Mimir, Loki, and Tempo are all Go projects. The `net/http/httputil.ReverseProxy` provides efficient proxying, and the PromQL parser (`github.com/prometheus/prometheus/promql/parser`) enables server-side query validation. The BFF authenticates users via JWT, maps their workspace ID to a tenant ID, and injects `X-Scope-OrgID` on every proxied request.

### API endpoints the BFF proxies

All three backends expose Prometheus-compatible HTTP APIs. Mimir uses `/prometheus/api/v1/query` and `/prometheus/api/v1/query_range` for PromQL. Loki uses `/loki/api/v1/query_range` for LogQL range queries and `/loki/api/v1/tail` for WebSocket log streaming. Tempo uses `/api/traces/<traceID>` for trace retrieval, `/api/search` for TraceQL search, and `/api/metrics/query_range` for TraceQL metrics.

The BFF should **allowlist specific API paths** — proxy only query endpoints, never admin endpoints. It should parse and validate PromQL/LogQL before forwarding, rejecting unbounded selectors like `{__name__=~".+"}`. Mimir's built-in per-tenant limits provide defense-in-depth:

```yaml
# Mimir runtime config — per-tenant limits (hot-reloadable)
overrides:
  tenant-premium:
    max_query_parallelism: 32
    ingestion_rate: 50000
    max_global_series_per_user: 1000000
  tenant-basic:
    max_query_parallelism: 8
    ingestion_rate: 5000
    max_global_series_per_user: 50000
```

### Visual query building for tenants

For the custom UI, build a **domain-specific query builder** rather than exposing raw PromQL/LogQL. For an AI agent monitoring platform, this means dropdowns for agent name, metric type, and time range that generate PromQL server-side (e.g., `rate(agent_requests_total{agent="X"}[5m])`). For advanced users, **PromLens** (donated by Chronosphere to the `prometheus` GitHub org, Apache 2.0) provides a standalone visual PromQL builder. Grafana's own query builder uses `@lezer/promql` for AST parsing — the same Lezer parser can power a custom builder in your React app.

---

## Grafana works best as an internal-only power tool

Deploy Grafana behind a NetworkPolicy and internal-only ingress, restricted to platform engineers via OIDC authentication. Its value lies in **ad-hoc exploration, hypothesis testing, and cross-tenant investigation** — capabilities that a simplified tenant dashboard intentionally omits.

### Multi-tenant datasource configuration

Grafana injects `X-Scope-OrgID` via custom HTTP headers on datasource configuration. The header value is stored as `secureJsonData` (encrypted at rest), injected server-side by Grafana's datasource proxy — the browser never sees it:

```yaml
# Provisioned via ConfigMap sidecar or Grafana Operator CRD
datasources:
  - name: Mimir - Tenant A
    type: prometheus
    access: proxy
    url: http://mimir-query-frontend.mimir:8080/prometheus
    jsonData:
      httpHeaderName1: "X-Scope-OrgID"
    secureJsonData:
      httpHeaderValue1: "tenant-a"

  - name: Mimir - All Tenants (Federation)
    type: prometheus
    access: proxy
    url: http://mimir-query-frontend.mimir:8080/prometheus
    jsonData:
      httpHeaderName1: "X-Scope-OrgID"
    secureJsonData:
      httpHeaderValue1: "tenant-a|tenant-b|tenant-c"
```

Engineers switch tenants using a **datasource template variable** (`$datasource`) in dashboards, selecting from tenant-specific datasources via dropdown. Cross-tenant federation (`tenant-a|tenant-b`) requires `-tenant-federation.enabled=true` on Mimir read components and adds a `__tenant_id__` label for filtering.

### Kubernetes deployment: Helm chart vs Operator

The **Grafana Helm chart** (`grafana/grafana`, chart version ~10.5.x) with the kiwigrid sidecar is the most battle-tested path. The sidecar watches for ConfigMaps labeled `grafana_dashboard: "1"` and `grafana_datasource: "1"`, auto-provisioning them into Grafana. Set `provider.allowUiUpdates: false` to enforce GitOps discipline.

The **Grafana Operator** (v5.22.2, CRDs at `grafana.integreatly.org/v1beta1`) provides a more Kubernetes-native approach with `GrafanaDashboard`, `GrafanaDatasource`, and `GrafanaFolder` CRDs. It supports multi-instance targeting via `instanceSelector` and can pull dashboards from URLs, Jsonnet, or grafana.com IDs.

For dashboard generation at scale, **Grafonnet** (`grafana/grafonnet`) generates Grafana JSON from Jsonnet, auto-generated from Grafana's OpenAPI specs. The workflow: write `.jsonnet` → evaluate with `go-jsonnet` → produce JSON → store in ConfigMap → sidecar provisions into Grafana.

### Why Grafana embedding falls short for tenant-facing use

**iframe embedding** requires `allow_embedding = true` and typically anonymous auth — but you cannot dynamically pass tenant context via iframe URL to change the datasource's `X-Scope-OrgID`. Each tenant would need its own Grafana Organization with separate datasources, embedded via `?orgId=N`. Grafana warns against this for production multi-tenant scenarios due to CSRF and clickjacking risks.

**Public/shared dashboards** (GA in Grafana 11+) generate unauthenticated URLs but **do not support template variables** — you cannot scope them to a tenant dynamically. Each tenant would need individually configured dashboards with pre-set datasources. This approach does not scale.

**App plugins** can build full custom pages with React routing, but the Grafana shell (sidebar, top bar) remains visible. Multi-tenancy must be handled entirely within plugin logic. The UX inherently "feels like Grafana" — no white-labeling is possible. App plugins are excellent for extending Grafana for engineers (Grafana OnCall, Grafana Incident demonstrate this), but not for customer-facing tenant dashboards.

---

## Perses offers embeddable components with an Apache 2.0 license

**Perses is a CNCF Sandbox project** (accepted August 2024) at v0.52.0 (September 2025), created by Prometheus maintainer Augustin Husson at Amadeus. It originated from Amadeus's challenge of managing 5,000+ Grafana dashboards where upgrades frequently broke schemas. Perses provides something Grafana cannot: **Apache 2.0-licensed, embeddable React components** purpose-built for observability visualization.

### Data source support covers the full LGTM stack

| Data source | Query language | Status |
|-------------|---------------|--------|
| Prometheus / Mimir / Thanos | PromQL | First-class, production-ready |
| Grafana Tempo | TraceQL | Supported (scatter, Gantt, table views) |
| Loki | LogQL | Added in v0.52.0 (September 2025) |
| Pyroscope | Profile queries | Added in v0.52.0 |

Perses datasources support custom HTTP headers on their proxy configuration, meaning `X-Scope-OrgID` can be injected per-datasource via the `headers` map or Go SDK (`http.AddHeader("X-Scope-OrgID", "tenant-123")`). Multi-tenancy maps to Perses **projects** (analogous to Kubernetes namespaces), each with its own datasources, dashboards, RBAC roles, and role bindings.

### Embedding Perses panels in a custom React app

This is a core design goal. Perses publishes npm packages under `@perses-dev`:

- **`@perses-dev/components`** — Reusable React components: LineChart, GaugeChart, StatChart, BarChart
- **`@perses-dev/dashboards`** — Dashboard-level components: Panel, DatasourceStoreProvider, VariableProvider
- **`@perses-dev/plugin-system`** — Plugin runtime, TimeRangeProvider, dynamicImportPluginLoader
- **`@perses-dev/prometheus-plugin`** — PromQL editor and query execution
- **`@perses-dev/timeseries-chart-plugin`** — Time series panel plugin

Embedding requires wrapping panels in providers (`ChartsProvider`, `SnackbarProvider`, `PluginRegistry`, `TimeRangeProvider`, `DatasourceStoreProvider`). The boilerplate is documented at `perses.dev/perses/docs/embedding-panels/`. Real-world embeddings include **Red Hat OpenShift** (console integration) and **Chronosphere** (platform embedding).

### When to choose Perses vs fully custom

**Choose Perses components** when you want pre-built, production-tested observability panels (time series, stat, gauge, heatmap, traces, logs, flame graphs) without building them from scratch, and when the Apache 2.0 license matters (vs Grafana's AGPLv3). **Build fully custom** when you need pixel-perfect branding, unconventional visualizations specific to AI agent monitoring, or cannot accept Perses' pre-1.0 API stability. A **hybrid approach** works well: use Perses components for standard metric/log panels while building custom components for domain-specific views (agent execution timelines, token usage breakdowns, conversation traces).

### Dashboard-as-Code and Kubernetes-native deployment

Perses dashboards are declarative YAML/JSON artifacts with **static validation** (`percli lint`) that can run in CI/CD pipelines. The Go SDK enables programmatic dashboard generation with compile-time checks. A Kubernetes Operator (`perses/perses-operator`) provides CRDs (`PersesDashboard`, `PersesDatasource`, `PersesGlobalDatasource`) at API version `perses.dev/v1alpha2`, with namespace-to-project mapping for isolation. Dashboard migration from Grafana is supported via `percli migrate` (best-effort conversion).

---

## Real-world patterns confirm this architecture works at scale

The pattern of "custom frontend + BFF + shared LGTM backends + internal Grafana" is proven across organizations of vastly different scales:

**Unity Technologies** migrated from Thanos → Cortex → Mimir, scaling to **150M+ active series** while saving millions in infrastructure costs. **CERN** monitors ~1.4M computer cores using Grafana + Mimir. **Novo Nordisk** implements a hub-and-spoke Kubernetes architecture with chained OpenTelemetry collectors that "mimics multi-tenancy" via centrally managed observability. **Chronosphere** (now Palo Alto Networks), founded by the creator of Uber's M3 system, built an entirely custom dashboard UI ("Lens") on a Prometheus-compatible backend and is now adopting Perses for embeddable components.

An important finding for the AI agent monitoring use case: **no major LLM observability platform uses the LGTM stack**. Langfuse (acquired by ClickHouse, 15,700+ GitHub stars) uses Next.js 15 + React 19 + ClickHouse + PostgreSQL. Helicone uses Next.js + Cloudflare Workers + ClickHouse + Kafka. SigNoz uses React + Go + ClickHouse. The trend toward ClickHouse in LLM observability reflects the need for high-cardinality, wide-event data with large text payloads (prompts, completions) and SQL-style ad-hoc analytics. For an AI agent monitoring platform that primarily tracks operational metrics (latency, error rates, throughput) and structured traces, the LGTM stack is well-suited. But if the platform needs to store and query full prompt/response payloads, token-level cost attribution, or evaluation scores, consider supplementing with ClickHouse for those analytical workloads.

---

## Conclusion: the architecture decision tree

The strongest path combines three strategies. **First**, build the tenant-facing dashboard as a standalone React + TypeScript application using uPlot for time-series, ECharts for complex visualizations, and Perses' `@perses-dev/components` for pre-built observability panels where they fit. **Second**, implement a Go BFF that authenticates users, maps workspace IDs to tenant IDs, injects `X-Scope-OrgID`, validates queries, and proxies requests to Mimir/Loki/Tempo query-frontends on the internal Kubernetes network. **Third**, deploy Grafana internally via Helm chart with sidecar provisioning, configuring per-tenant datasources with static `X-Scope-OrgID` headers and enabling tenant federation for cross-tenant engineering views.

The key insight from Perses is that **Apache 2.0-licensed observability components now exist** that were specifically designed for embedding. Rather than building every visualization from scratch with uPlot + ECharts, evaluate Perses' npm packages for standard panels and reserve custom development for domain-specific AI agent views. The project's adoption by Red Hat (OpenShift), Chronosphere, and Amadeus (5,000+ dashboards in production) signals sufficient maturity for production embedding, even as the standalone application remains pre-1.0.

For the AI-specific observability layer, keep an eye on the ClickHouse convergence in the LLM tooling ecosystem. If your platform evolves to require prompt/response storage, evaluation tracking, or cost attribution beyond what time-series and log databases handle well, a ClickHouse-backed analytical layer alongside the LGTM operational layer may be the long-term architecture.