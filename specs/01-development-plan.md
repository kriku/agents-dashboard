# Claude Code development plan — ClickHouse analytics dashboard

**Target:** One-day vibe-coded implementation of the AI agent analytics dashboard
**Stack:** ClickHouse + Express.js BFF + React frontend (existing)
**Prerequisite:** Existing mocked React dashboard with 5 views, all design docs and specs complete

---

## Strategy: what we're building vs. what we're documenting

The assignment evaluates two things separately: system design (interview 1) and vibe-coded implementation (interview 2). The system design is complete — 7 architecture documents, 6 mermaid diagrams, 41 core requirements, 80-metric catalog. The vibe-coded implementation needs to demonstrate production-plausible choices with a working end-to-end stack, while mocking the parts that require real infrastructure (Kafka, Mimir, OTel pipeline, IAM).

**Key simplification:** ClickHouse replaces the entire Grafana LGTM stack + Kafka backbone for the demo. This is architecturally honest — the ADR-001 document explicitly notes ClickHouse as "recommended as a complementary analytics store," and Langfuse, Helicone, and other AI observability platforms use ClickHouse as their primary store (documented in the OTel research). The production design uses Mimir for native multi-tenancy at scale; the demo uses ClickHouse for SQL simplicity and single-container deployment.

---

## Phase 0: Project scaffolding

**Duration:** 30 min · **Vibe-codeable:** Yes

### Step 0.1 — Initialize monorepo

Prompt Claude Code:

```
Update repo to a monorepo with this structure:

agent-monitor/
├── docker-compose.yml          # ClickHouse + BFF + frontend
├── packages/
│   ├── frontend/               # React app (move existed code)
│   ├── bff/                    # Express.js API server
│   ├── clickhouse/             # Schema migrations + seed scripts
│   └── shared/                 # Shared TypeScript types
├── .env.example
├── .gitignore
├── package.json                # Workspace root
├── tsconfig.base.json
└── README.md

Use pnpm workspaces. TypeScript everywhere. Node 20+.
```

### Step 0.2 — Docker Compose

Prompt Claude Code:

```
Create docker-compose.yml with:

1. ClickHouse server (clickhouse/clickhouse-server:24.3)
   - Port 8123 (HTTP) and 9000 (native)
   - Mount ./packages/clickhouse/init/ to /docker-entrypoint-initdb.d/
   - 2GB memory limit
   - Named volume for data persistence

2. BFF (Node.js)
   - Build from packages/bff/Dockerfile
   - Port 3001
   - Env: CLICKHOUSE_URL=http://clickhouse:8123, JWT_SECRET=dev-secret
   - depends_on clickhouse with healthcheck

3. Frontend (Vite dev server or nginx for prod)
   - Build from packages/frontend/Dockerfile
   - Port 3000
   - Env: VITE_API_URL=http://localhost:3001

Add a healthcheck for ClickHouse: wget --spider http://localhost:8123/ping
```

### Step 0.3 — Acceptance criteria for Phase 0

- [x] `docker-compose up` starts all 3 services
- [x] ClickHouse responds to `SELECT 1` on port 8123
- [x] BFF serves `GET /health` returning `{"status":"ok"}`
- [x] Frontend loads in browser at `localhost:3000`

---

## Phase 1: ClickHouse schema

**Duration:** 1.5 hours · **Vibe-codeable:** Yes (SQL DDL is highly LLM-friendly)

### Step 1.1 — Core tables

**Status:** Done — `packages/clickhouse/init/001_create_tables.sql`

6 tables (plan originally called for 5; `guardrail_validations` added to back the `guardrail_pass_fail` panel). All tables use `workspace_id` as tenant isolation key.

| # | Table | Engine | Notes |
|---|-------|--------|-------|
| 1 | `agent_executions` | MergeTree | Includes `trace_id`, `span_id`, `model`, `provider`, `environment` (carried from old schema). Uses `input_tokens`/`output_tokens` naming. |
| 2 | `tool_calls` | MergeTree | Added `tool_type` enum, `input_tokens`, `output_tokens`. |
| 3 | `llm_requests` | MergeTree | Column naming: `input_tokens`/`output_tokens` (not `prompt_tokens`/`completion_tokens`) — aligned with frontend mock data `token_type: "input"/"output"`. Added `span_id`. |
| 4 | `agent_errors` | MergeTree | As planned + `trace_id`. |
| 5 | `guardrail_validations` | MergeTree | **NEW** — backs `guardrail_pass_fail` panel (metric #46). Columns: `guardrail_name`, `guardrail_result` (pass/fail/warn), `duration_ms`, `message`. |
| 6 | `workspaces` | ReplacingMergeTree | As planned. |

### Step 1.2 — Materialized views for pre-aggregation (optional optimization)

**Status:** Done — `packages/clickhouse/init/002_materialized_views.sql`

3 materialized views (plan originally called for 2; `hourly_tool_stats` added for tool-call-performance panels). All use `AggregatingMergeTree` with `quantileState()` for mergeable percentile computation.

| # | Target table | Source table | Key aggregates |
|---|-------------|-------------|----------------|
| 1 | `hourly_agent_stats` | `agent_executions` | `countState`, `countIfState(status IN failure/timeout)`, `sumState(total_tokens, cost)`, `quantileState(0.5/0.95/0.99)(duration_ms)` |
| 2 | `hourly_model_usage` | `llm_requests` | `countState`, `sumState(input_tokens, output_tokens, total_tokens, cost)`, `quantileState(0.5/0.95/0.99)(duration_ms)` |
| 3 | `hourly_tool_stats` | `tool_calls` | **NEW** — `countState`, `countIfState(status=error)`, `sumState(retry_count)`, `quantileState(0.5/0.95/0.99)(duration_ms)` |

Note: uses `input_tokens`/`output_tokens` (not `prompt_tokens`/`completion_tokens`), consistent with raw tables and frontend.

### Step 1.3 — Acceptance criteria for Phase 1

- [x] Schema SQL files written: `001_create_tables.sql` (6 tables), `002_materialized_views.sql` (3 MVs + 3 target tables)
- [x] Seed script updated to match new schema (`seed.ts` inserts into all 6 tables)
- [x] All 6 tables + 3 MVs created successfully on `docker-compose up`
- [x] `DESCRIBE agent_executions` returns expected schema (20 columns, correct types/enums)
- [x] `INSERT INTO agent_executions ...` with a test row succeeds
- [x] `SELECT count() FROM agent_executions WHERE workspace_id = 'ws-acme-prod'` returns 1

---

## Phase 2: Realistic seed data generator

**Duration:** 2 hours · **Vibe-codeable:** Yes, but needs careful prompting for realistic patterns

### Step 2.1 — Data generator script

Prompt Claude Code:

```
Create packages/clickhouse/seed/generate.ts — a TypeScript script that generates
realistic monitoring data for the AI agent analytics dashboard.

Configuration:
- 3 organizations: "Acme Corp" (org-acme), "Globex Inc" (org-globex), "Initech" (org-initech)
- 5 workspaces total:
  - org-acme: "Production" (ws-acme-prod, heavy usage), "Staging" (ws-acme-staging, light)
  - org-globex: "Main" (ws-globex-main, medium)
  - org-initech: "Production" (ws-initech-prod, medium), "Research" (ws-initech-research, light)
- 10 agent types: ["order-processor", "support-classifier", "doc-summarizer",
  "code-reviewer", "data-analyst", "email-drafter", "search-agent",
  "onboarding-assistant", "report-generator", "compliance-checker"]
- 15 tools: ["web_search", "sql_query", "file_read", "file_write", "api_call",
  "code_execute", "email_send", "slack_notify", "jira_create", "pdf_parse",
  "vector_search", "calculator", "calendar_check", "translate", "image_analyze"]
- 4 LLM models with realistic pricing:
  - claude-sonnet-4-20250514: input $3/MTok, output $15/MTok
  - claude-haiku-3.5: input $0.80/MTok, output $4/MTok
  - gpt-4o: input $2.50/MTok, output $10/MTok
  - gpt-4o-mini: input $0.15/MTok, output $0.60/MTok
- 3 codebase versions: "v2.3.1", "v2.4.0", "v2.5.0-beta"

Time range: 30 days of data, ending at current timestamp.

Patterns to generate:
1. Daily cycle: usage peaks at 10am-2pm UTC, drops 60% overnight, 40% on weekends
2. Growth trend: 15% week-over-week increase in total invocations
3. Error patterns:
   - Baseline error rate: 2-4% per agent
   - One spike event: "api_call" tool errors jump to 35% for 4 hours on day 22
     (simulates an upstream API outage)
   - "code-reviewer" agent has 8% error rate (higher than average)
4. Latency patterns:
   - Normal: agent duration 2-15s depending on step count
   - Tool latency: 50-500ms for most, "sql_query" is 200-2000ms
   - LLM latency: 500-3000ms, proportional to token count
5. Cost distribution:
   - 70% of tokens go to claude-sonnet-4-20250514 and gpt-4o
   - "doc-summarizer" and "report-generator" are the heaviest token consumers
6. Version rollout: v2.3.1 dominant for first 20 days, v2.4.0 gradually
   replaces it, v2.5.0-beta appears on day 25 at 5% traffic

Data volume targets (for ws-acme-prod, the heavy workspace):
- ~50,000 agent_executions over 30 days
- ~200,000 tool_calls
- ~150,000 llm_requests
- ~2,500 agent_errors
Scale other workspaces proportionally: medium = 30%, light = 10%.

Output: Generate ClickHouse-compatible TSV files or use the ClickHouse
HTTP interface to insert in batches of 10,000 rows.

The generator should be deterministic (seeded random) for reproducible demos.
Use a seed value of 42.
```

### Step 2.2 — Workspace dimension data

Prompt Claude Code:

```
In the same generator script, insert the workspace dimension records:

INSERT INTO workspaces VALUES
('ws-acme-prod', 'org-acme', 'Production', 'Acme Corp', 'enterprise', now(), '{}'),
('ws-acme-staging', 'org-acme', 'Staging', 'Acme Corp', 'enterprise', now(), '{}'),
('ws-globex-main', 'org-globex', 'Main', 'Globex Inc', 'pro', now(), '{}'),
('ws-initech-prod', 'org-initech', 'Production', 'Initech', 'pro', now(), '{}'),
('ws-initech-research', 'org-initech', 'Research', 'Initech', 'free', now(), '{}');
```

### Step 2.3 — Seed runner

Prompt Claude Code:

```
Create packages/clickhouse/seed/run.sh that:
1. Waits for ClickHouse to be healthy (curl loop on :8123/ping)
2. Runs the generator: npx tsx packages/clickhouse/seed/generate.ts
3. Prints summary: row counts per table per workspace

Add a docker-compose profile "seed" that runs this after the main stack is up:
  docker compose run --rm seed
```

### Step 2.4 — Acceptance criteria for Phase 2

- [ ] `SELECT count() FROM agent_executions` returns ~75,000+
- [ ] `SELECT workspace_id, count() FROM agent_executions GROUP BY workspace_id` shows 5 workspaces with proportional volumes
- [ ] `SELECT toStartOfHour(timestamp), count() FROM agent_executions WHERE workspace_id = 'ws-acme-prod' GROUP BY 1 ORDER BY 1` shows daily cycle pattern
- [ ] `SELECT agent_name, countIf(status = 'failure') / count() as err_rate FROM agent_executions WHERE workspace_id = 'ws-acme-prod' GROUP BY agent_name ORDER BY err_rate DESC` shows code-reviewer with highest error rate
- [ ] Data covers 30 days

---

## Phase 3: BFF API server

**Duration:** 3.5 hours · **Vibe-codeable:** Mostly yes, SQL queries need validation

### Step 3.1 — Express server skeleton with mock auth

Prompt Claude Code:

```
Create the BFF server in packages/bff/src/.

Structure:
packages/bff/
├── src/
│   ├── index.ts                # Express app, middleware chain, listen
│   ├── middleware/
│   │   ├── auth.ts             # JWT validation (mock for demo)
│   │   └── audit.ts            # Request logging with workspace context
│   ├── routes/
│   │   └── views.ts            # GET /api/views/:viewId
│   ├── queries/
│   │   ├── agent-overview.ts   # SQL queries for agent overview panels
│   │   ├── tool-performance.ts # SQL queries for tool call performance panels
│   │   ├── llm-token-usage.ts  # SQL queries for LLM token usage panels
│   │   ├── error-breakdown.ts  # SQL queries for error breakdown panels
│   │   └── cost-tracking.ts    # SQL queries for cost tracking panels
│   ├── clickhouse/
│   │   └── client.ts           # ClickHouse HTTP client wrapper
│   ├── types/
│   │   └── views.ts            # ViewResponse, Panel, PanelData types
│   └── config.ts               # Environment config with defaults
├── Dockerfile
├── package.json
└── tsconfig.json

Dependencies: express, jsonwebtoken, @clickhouse/client, cors, helmet, pino

Auth middleware:
- Accept Bearer token in Authorization header
- For demo: generate tokens with jwt.sign({
    sub: 'user-demo',
    org_id: 'org-acme',
    workspace_id: 'ws-acme-prod',
    workspace_name: 'Production',
    org_name: 'Acme Corp',
    role: 'admin'
  }, process.env.JWT_SECRET)
- Middleware validates signature and attaches decoded claims to req.user
- Provide a GET /api/auth/demo-token endpoint that returns a pre-signed token
  for the default workspace (for easy frontend development)
- Support X-Workspace-ID header to switch workspaces (validated against
  the org's workspaces — user can only access workspaces in their org)

CORS: Allow localhost:3000 in development.
```

### Step 3.2 — ClickHouse client wrapper

Prompt Claude Code:

```
Create packages/bff/src/clickhouse/client.ts:

- Use @clickhouse/client with HTTP interface
- Connection URL from env CLICKHOUSE_URL (default: http://localhost:8123)
- Wrapper function: query<T>(sql: string, params: Record<string, any>): Promise<T[]>
- All queries MUST inject workspace_id as a parameter — never interpolate it
  into the SQL string. Use ClickHouse parameterized queries: {workspace_id: String}
- Add query timing via pino logger
- Add a simple connection pool (the @clickhouse/client handles this natively)
- Export a singleton client instance
```

### Step 3.3 — View route handler

Prompt Claude Code:

```
Create packages/bff/src/routes/views.ts:

GET /api/views/:viewId

1. Extract viewId from params
2. Extract workspace_id from req.user (set by auth middleware)
3. Look up the view definition from a registry (a Map<string, ViewDefinition>)
4. Execute all panel queries in parallel using Promise.allSettled()
   — each panel query receives workspace_id as parameter
5. Assemble the response:

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
  type: 'stat' | 'timeseries' | 'bar' | 'table' | 'heatmap' | 'gauge';
  unit: string;
  data: PanelData;
}

// PanelData matches Prometheus response format for frontend compatibility:
interface PanelData {
  resultType: 'vector' | 'matrix';
  result: Array<{
    metric: Record<string, string>;
    value?: [number, string];        // for vector (stat panels)
    values?: [number, string][];     // for matrix (timeseries panels)
  }>;
}

6. Return 200 with the assembled response
7. If viewId is not found, return 404
8. If any panel query fails, include the panel with an error field
   instead of data (partial failure, not total failure)

Also add:
GET /api/views — returns list of available views (id, title, description)
GET /api/workspaces — returns workspaces accessible to the authenticated user
```

### Step 3.4 — Agent overview queries

Prompt Claude Code:

```
Create packages/bff/src/queries/agent-overview.ts

This file defines the queries for the "agent-overview" view.
Each function takes workspace_id and returns a Panel object.

Panels to implement:

1. active_agents (stat) — count of distinct agents active in last 5 minutes
   SQL: SELECT count(DISTINCT agent_name)
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 5 MINUTE

2. total_invocations (stat) — total invocations in last 24 hours
   SQL: SELECT count()
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 24 HOUR

3. error_rate_current (stat) — error rate in last 1 hour as percentage
   SQL: SELECT countIf(status IN ('failure', 'timeout')) * 100.0 / count()
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 1 HOUR

4. p95_latency_current (stat) — p95 duration in last 1 hour
   SQL: SELECT quantile(0.95)(duration_ms)
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 1 HOUR

5. invocation_rate (timeseries) — invocations per 5-minute bucket by agent, last 6h
   SQL: SELECT toStartOfFiveMinutes(timestamp) as ts,
               agent_name,
               count() as value
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 6 HOUR
        GROUP BY ts, agent_name
        ORDER BY ts

   Transform: Group by agent_name into separate series.
   Each series: { metric: { agent_name: "order-processor" }, values: [[ts, count], ...] }

6. error_rate (timeseries) — error rate per 5-minute bucket, last 6h
   SQL: SELECT toStartOfFiveMinutes(timestamp) as ts,
               countIf(status IN ('failure', 'timeout')) * 100.0 / count() as value
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 6 HOUR
        GROUP BY ts
        ORDER BY ts

7. p95_latency (timeseries) — p95 latency per 5-min bucket by agent, last 6h
   SQL: SELECT toStartOfFiveMinutes(timestamp) as ts,
               agent_name,
               quantile(0.95)(duration_ms) as value
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 6 HOUR
        GROUP BY ts, agent_name
        ORDER BY ts

8. errors_by_type (bar) — error count by type, last 24h
   SQL: SELECT error_type, count() as value
        FROM agent_errors
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 24 HOUR
        GROUP BY error_type
        ORDER BY value DESC
        LIMIT 10

9. step_distribution (heatmap) — steps per execution distribution, last 24h
   SQL: SELECT toStartOfHour(timestamp) as ts,
               step_count as bucket,
               count() as value
        FROM agent_executions
        WHERE workspace_id = {workspace_id: String}
        AND timestamp > now() - INTERVAL 24 HOUR
        GROUP BY ts, bucket
        ORDER BY ts, bucket

IMPORTANT: Every SQL query must use parameterized {workspace_id: String}.
Never concatenate workspace_id into the SQL string.

The transform function should convert ClickHouse rows into the PanelData
format (Prometheus-compatible) that the frontend expects.

Include a helper: transformTimeSeries(rows, groupByColumn, valueColumn)
that groups rows into the matrix format.
```

### Step 3.5 — Tool performance queries

Prompt Claude Code:

```
Create packages/bff/src/queries/tool-performance.ts

Same pattern as agent-overview. Panels:

1. active_tools (stat) — distinct tools used in last 1 hour
2. total_tool_calls (stat) — total calls in last 24h
3. tool_error_rate (stat) — error percentage in last 1h
4. retry_rate (stat) — percentage of calls with retry_count > 0, last 1h
5. tool_latency_percentiles (timeseries) — p50/p95/p99 per 5min bucket, last 6h
   Multiple series: one per percentile. Use quantiles(0.5, 0.95, 0.99)(duration_ms).
6. tool_error_rates (timeseries) — error rate per tool per 5min, last 6h
7. tool_call_frequency (bar) — calls per tool, last 24h, sorted desc
8. retry_rate_by_tool (bar) — retry rate per tool, last 24h
9. slowest_tools (table) — top 10 tools by p95 latency, last 24h
   Columns: tool_name, p50_ms, p95_ms, p99_ms, call_count, error_rate
   resultType: "vector" with metric containing all column values
```

### Step 3.6 — LLM token usage queries

Prompt Claude Code:

```
Create packages/bff/src/queries/llm-token-usage.ts

Panels:

1. total_tokens (stat) — sum of total_tokens, last 24h
2. token_rate (stat) — tokens per second, last 1h
3. estimated_cost (stat) — sum of cost_usd, last 24h
4. avg_tokens_per_invocation (stat) — average total_tokens, last 24h
5. tokens_by_model (timeseries) — total tokens per model per 1h bucket, last 24h
6. prompt_vs_completion (timeseries) — sum prompt vs completion tokens per 1h, last 24h
   Two series: { metric: { token_type: "prompt" } } and { metric: { token_type: "completion" } }
7. token_rate_trend (timeseries) — tokens per minute per 5min bucket, last 6h
8. cost_by_model (bar) — total cost per model, last 24h
9. top_consumers (table) — top 10 agents by total token consumption, last 24h
   Columns: agent_name, total_tokens, prompt_tokens, completion_tokens, cost_usd, call_count
```

### Step 3.7 — Error breakdown queries

Prompt Claude Code:

```
Create packages/bff/src/queries/error-breakdown.ts

Panels:

1. total_errors (stat) — count of errors, last 24h
2. error_rate_current (stat) — error rate percentage, last 1h
3. most_common_error (stat) — most frequent error_type, last 24h (return as string value)
4. error_rate_trend (timeseries) — error count per 5min bucket, last 6h
5. errors_by_type (bar) — count per error_type, last 24h
6. errors_by_agent (bar) — count per agent_name, last 24h
7. errors_by_version (bar) — count per codebase_version, last 24h
8. top_error_messages (table) — top 20 error messages by frequency, last 24h
   Columns: error_message, error_type, count, first_seen, last_seen
```

### Step 3.8 — Cost tracking queries

Prompt Claude Code:

```
Create packages/bff/src/queries/cost-tracking.ts

Panels:

1. daily_cost (stat) — total cost_usd today (since midnight UTC)
2. projected_monthly (stat) — linear projection:
   (cost so far this month / days elapsed) * days in month
   SQL: SELECT (sum(cost_usd) / dateDiff('day', toStartOfMonth(now()), now() + 1))
         * dateDiff('day', toStartOfMonth(now()), toStartOfMonth(now()) + INTERVAL 1 MONTH)
        FROM llm_requests
        WHERE workspace_id = {workspace_id: String}
        AND timestamp >= toStartOfMonth(now())
3. cost_per_invocation (stat) — average cost per agent invocation, last 24h
   JOIN agent_executions and sum cost from llm_requests per execution window
4. week_over_week (stat) — percentage change vs same period last week
5. cost_trend (timeseries) — daily cost per day, last 30 days
6. cost_per_invocation_trend (timeseries) — avg cost per invocation per day, last 30d
7. cost_by_agent (bar) — cost attributed to each agent, last 7 days
8. cost_by_model (bar) — cost per model, last 7 days
```

### Step 3.9 — View registry

Prompt Claude Code:

```
Create packages/bff/src/queries/registry.ts that assembles all views:

const viewRegistry = new Map<string, ViewDefinition>([
  ['agent-overview', {
    id: 'agent-overview',
    title: 'Agent execution overview',
    description: 'Real-time agent health, error rates, and execution performance',
    refreshSec: 30,
    queryFn: getAgentOverviewPanels,
  }],
  ['tool-call-performance', { ... }],
  ['llm-token-usage', { ... }],
  ['error-breakdown', { ... }],
  ['cost-tracking', { ... }],
]);

Each queryFn takes (workspaceId: string) and returns Promise<Panel[]>.
```

### Step 3.10 — Org-level workspace list endpoint

Prompt Claude Code:

```
Add GET /api/workspaces to the BFF:

Query: SELECT w.workspace_id, w.workspace_name, w.org_id, w.org_name, w.tier
       FROM workspaces w
       WHERE w.org_id = {org_id: String}

This enables the workspace switcher in the frontend.
Also add the org-level aggregated usage endpoint:
GET /api/org/usage — aggregated metrics across all org workspaces.
```

### Step 3.11 — Acceptance criteria for Phase 3

- [ ] `GET /api/auth/demo-token` returns a valid JWT
- [ ] `GET /api/views` returns 5 views
- [ ] `GET /api/views/agent-overview` with Bearer token returns all panels with data
- [ ] `GET /api/views/agent-overview` without token returns 401
- [ ] `GET /api/views/agent-overview` with workspace_id=ws-acme-prod returns different data than ws-globex-main (tenant isolation)
- [ ] All 5 view endpoints return data within 2 seconds
- [ ] Partial failure: if one panel query fails, other panels still return data

---

## Phase 4: Wire React frontend to live BFF

**Duration:** 2 hours · **Vibe-codeable:** Partially — requires manual debugging

### Step 4.1 — Update API client

Prompt Claude Code:

```
Update packages/frontend/src/api/client.ts:

- Base URL from VITE_API_URL environment variable (default: http://localhost:3001)
- On app load, call GET /api/auth/demo-token to get a JWT
  Store in memory (not localStorage per the artifact restrictions)
- Attach Authorization: Bearer <token> to all API requests
- On 401 response, re-fetch the demo token
- Add response type validation using the shared types
```

### Step 4.2 — Update useView hook

Prompt Claude Code:

```
Update packages/frontend/src/hooks/useView.ts:

- Remove mock data fallback
- Fetch from GET /api/views/{viewId}
- Use TanStack Query with:
  - queryKey: ['view', viewId]
  - refetchInterval: response.view.refreshSec * 1000
  - staleTime: 10_000
  - retry: 2
- Handle loading, error, and success states
- Add a workspace context that comes from GET /api/workspaces
```

### Step 4.3 — Add workspace switcher

Prompt Claude Code:

```
Add a workspace selector to the AppShell header:

- On load, fetch GET /api/workspaces
- Show a dropdown with workspace names grouped by org
- When user switches workspace, send X-Workspace-ID header on subsequent requests
- Store selected workspace in React state (useContext)
- Re-fetch all views when workspace changes
```

### Step 4.4 — Data format compatibility layer

Prompt Claude Code:

```
The BFF returns data in Prometheus-compatible format (resultType: vector/matrix).
Verify that each chart component handles this format correctly.

If there are mismatches, create a transform layer in packages/frontend/src/utils/transforms.ts:

- transformStatData(panel: Panel): { value: number; unit: string }
- transformTimeSeriesData(panel: Panel): { series: { name: string; data: [number, number][] }[] }
- transformBarData(panel: Panel): { labels: string[]; values: number[] }
- transformTableData(panel: Panel): { columns: string[]; rows: any[][] }
- transformHeatmapData(panel: Panel): { x: number[]; y: number[]; values: number[][] }

These adapters bridge any gap between the BFF output and what
uPlot/ECharts/Ant Design Table expect.
```

### Step 4.5 — Acceptance criteria for Phase 4

- [ ] Dashboard loads at localhost:3000 and shows real data from ClickHouse
- [ ] All 5 views render with populated charts (no "No data" panels)
- [ ] Workspace switcher changes data across all views
- [ ] Auto-refresh works (new data appears without manual reload)
- [ ] Error states display gracefully (not white screen crashes)

---

## Phase 5: Testing

**Duration:** 2 hours · **Vibe-codeable:** Yes

### Step 5.1 — BFF integration tests

Prompt Claude Code:

```
Create packages/bff/src/__tests__/ with integration tests using vitest.

Test categories:

1. Auth middleware tests:
   - Valid token → req.user populated
   - Missing token → 401
   - Expired token → 401
   - Invalid signature → 401

2. Tenant isolation tests (CRITICAL):
   - Query as ws-acme-prod, verify no data from ws-globex-main
   - Query as ws-globex-main, verify no data from ws-acme-prod
   - For each view endpoint, verify workspace_id is always parameterized

3. View endpoint tests (per view):
   - Returns 200 with correct view metadata
   - Returns all expected panels
   - Panel types match expected (stat, timeseries, bar, table, heatmap)
   - Stat panels have single values
   - Timeseries panels have multiple data points
   - Bar panels have sorted data

4. Error handling tests:
   - Unknown viewId → 404
   - ClickHouse connection failure → 503 with error message
   - Individual panel failure → partial response (other panels still work)

Use @clickhouse/client to set up test data in a test database.
Use beforeAll/afterAll for test data setup/teardown.
```

### Step 5.2 — SQL query tests

Prompt Claude Code:

```
Create packages/bff/src/__tests__/queries/ with tests for each query module.

For each query file (agent-overview.ts, tool-performance.ts, etc.):

1. Insert known test data into ClickHouse (small dataset, deterministic)
2. Run the query function with a test workspace_id
3. Verify:
   - Result shape matches expected PanelData format
   - Values are mathematically correct (e.g., error rate = errors / total)
   - Timeseries data points are ordered by timestamp
   - Workspace isolation: query returns 0 rows for a workspace with no data
   - Edge case: empty time range returns empty result, not error

These tests run against the real ClickHouse instance in Docker.
Mark them with a "integration" tag so they can be skipped in CI without Docker.
```

### Step 5.3 — Frontend component tests

Prompt Claude Code:

```
Create or update frontend tests based on the test specification document.

Priority tests (must have):

1. PanelRenderer routing tests:
   - type: "stat" → renders StatChart
   - type: "timeseries" → renders TimeSeriesChart
   - type: "bar" → renders BarChart
   - type: "table" → renders TableChart
   - type: "heatmap" → renders HeatmapChart
   - unknown type → renders error message

2. Formatter tests (100% coverage):
   - formatRate, formatDuration, formatPercent, formatLargeNumber, formatCurrency
   - Edge cases: 0, negative, very large numbers, NaN

3. API client tests:
   - JWT injection into requests
   - 401 handling and token refresh
   - Workspace header injection

4. Page-level tests (per view):
   - Renders correct page title
   - Contains expected number of panels
   - Loading state shows skeletons
   - Error state shows error message

Use MSW (Mock Service Worker) for network mocking.
Use React Testing Library for component tests.
Test fixtures from packages/frontend/src/__fixtures__/.
```

### Step 5.4 — E2E smoke test

Prompt Claude Code:

```
Create packages/e2e/smoke.spec.ts using Playwright:

1. Start from docker-compose up (all services running)
2. Navigate to http://localhost:3000
3. Verify: page loads, sidebar visible with 5 nav items
4. For each view:
   a. Click the nav item
   b. Wait for loading to complete (no skeleton loaders visible)
   c. Verify: at least 3 panels rendered with data
   d. Verify: no error messages visible
5. Workspace switcher:
   a. Switch to a different workspace
   b. Verify: data changes (at least one stat value differs)
6. Screenshot each view for visual regression baseline

This is the single most important test — if this passes, the demo works.
```

### Step 5.5 — Acceptance criteria for Phase 5

- [ ] `pnpm test` passes with 0 failures
- [ ] BFF integration tests: 20+ tests passing
- [ ] Frontend unit tests: 40+ tests passing
- [ ] E2E smoke test: passes against docker-compose stack
- [ ] Tenant isolation verified in tests (no cross-workspace data leakage)

---

## Phase 6: Polish and documentation

**Duration:** 1 hour · **Vibe-codeable:** Partially

### Step 6.1 — README.md

Prompt Claude Code:

```
Create a comprehensive README.md at the repo root:

# AI Agent Analytics Dashboard

## Quick start
docker-compose up
# Seed data:
docker compose run --rm seed
# Open: http://localhost:3000

## Architecture
Brief description + link to design docs.
Embed the ClickHouse demo architecture diagram (simplified version).
Explain the relationship between the demo implementation and the
production system design.

## Project structure
Explain the monorepo layout.

## Design decisions
Link to the full architecture decision records.
Explain why ClickHouse for the demo vs Mimir for production.

## Testing
How to run tests. Coverage targets.

## System design documents
List and link all design docs in the /docs directory.

## What's mocked vs real
Table showing each component, its production design, and demo approach.
```

### Step 6.2 — Copy design docs into repo

```
mkdir -p docs/
Copy all .md and .mermaid files into docs/:
- architecture-decision-records.md
- core-requirements-v1.md
- monitoring-system-requirements-v5_2.md
- metrics-dashboard-read-path-architecture.md
- AI_Agent_Fleet_Metrics_Catalog_v2.md
- Agent_SDK_and_Event_Decomposition_Architecture.md
- Building_a_Custom_Observability_Dashboard_on_the_Grafana_LGTM_Stack.md
- OpenTelemetry_Tracing_in_AI_Agent_Frameworks.md
- Multi-Tenant_Metrics_Pipeline_Architecture.md
- All .mermaid diagrams
- All .html interactive diagrams
```

### Step 6.3 — CI pipeline

Prompt Claude Code:

```
Create .github/workflows/ci.yml:

name: CI
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup node 20
      - pnpm install
      - pnpm lint (ESLint + Prettier)

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup node 20
      - pnpm install
      - pnpm --filter frontend test
      - pnpm --filter bff test:unit
      - upload coverage artifacts

  test-integration:
    runs-on: ubuntu-latest
    services:
      clickhouse:
        image: clickhouse/clickhouse-server:24.3
        ports: [8123:8123]
    steps:
      - checkout
      - setup node 20
      - pnpm install
      - run schema migrations against service container
      - run seed with minimal data
      - pnpm --filter bff test:integration

  test-e2e:
    runs-on: ubuntu-latest
    needs: [test-unit, test-integration]
    steps:
      - checkout
      - docker compose up -d
      - docker compose run --rm seed
      - npx playwright install chromium
      - npx playwright test
      - upload playwright traces on failure

  build:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - docker compose build
```

---

## Execution order summary

| Phase | Hours | What | Vibe-codeable? |
|-------|-------|------|----------------|
| 0: Scaffolding | 0.5 | Monorepo, Docker Compose, health checks | 100% |
| 1: Schema | 1.5 | 5 ClickHouse tables, materialized views | 100% |
| 2: Seed data | 2.0 | Realistic 30-day data generator | 95% (patterns need review) |
| 3: BFF API | 3.5 | Auth, 5 view endpoints, ~35 SQL queries | 85% (SQL correctness needs validation) |
| 4: Frontend wiring | 2.0 | Connect React to live BFF, workspace switcher | 70% (debugging data format mismatches) |
| 5: Testing | 2.0 | BFF integration, frontend unit, E2E smoke | 90% |
| 6: Polish | 1.0 | README, docs, CI pipeline | 95% |
| **Total** | **12.5** | | |

**Fits in 1 day?** Tight but achievable. Phases 0-3 are the critical path (~7.5h). If time runs short, Phase 5 can be trimmed to just the E2E smoke test + tenant isolation tests, and Phase 6 can be minimal README only. The non-negotiable deliverable is: `docker-compose up` → seed → open browser → 5 working dashboard views with real ClickHouse data and workspace switching.

---

## Risk mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ClickHouse SQL syntax errors in complex queries | High | Medium | Test each query in clickhouse-client CLI before integrating. Keep a SQL scratch file. |
| Frontend data format mismatches | High | High | Build a thin adapter layer (Step 4.4) rather than changing backend format. Test with curl first. |
| Seed data generator is slow | Medium | Low | Use ClickHouse batch inserts (10K rows per HTTP POST). TSV format is fastest. |
| Docker networking issues | Medium | Medium | Use docker-compose service names for inter-container communication. Test healthchecks early. |
| Time overrun on Phase 3 (SQL queries) | Medium | High | Start with agent-overview (most complex), then parallelize remaining 4 views. Skip materialized views if tight. |

---

## Claude Code session strategy

Split into focused sessions to maintain context quality:

1. **Session 1** (Phases 0-1): Scaffolding + schema. Short, high confidence.
2. **Session 2** (Phase 2): Seed data generator. Self-contained, testable independently.
3. **Session 3** (Phase 3, steps 3.1-3.4): BFF skeleton + agent overview. Get one view working end-to-end.
4. **Session 4** (Phase 3, steps 3.5-3.9): Remaining 4 view query modules. Pattern is established from session 3.
5. **Session 5** (Phase 4): Frontend wiring. Needs the most debugging.
6. **Session 6** (Phases 5-6): Tests + polish. Run against the full stack.

Each session should start with `CLAUDE.md` context pointing to the relevant spec files. Keep sessions under 30 minutes of Claude Code interaction each to maintain output quality.
