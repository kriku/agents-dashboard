# Test scenarios — ClickHouse demo implementation

**Scope:** ClickHouse + Express.js BFF + React frontend
**Test stack:** Vitest (unit + integration), Playwright (E2E)
**Total:** 130 scenarios across 4 layers

---

## 1. Tenant isolation (15 scenarios)

The single most important test category. A failure here means workspace A can see workspace B's data — a production-severity bug even in a demo.

### 1.1 BFF-level isolation

| ID | Scenario | Setup | Expected |
|----|----------|-------|----------|
| TI-001 | Query as workspace A returns only workspace A data | Auth as `ws-acme-prod`, call `GET /api/views/agent-overview` | Every panel's data is scoped to `ws-acme-prod`; zero rows from other workspaces |
| TI-002 | Query as workspace B returns different data | Auth as `ws-globex-main`, call `GET /api/views/agent-overview` | `active_agents` stat differs from TI-001; data belongs to `ws-globex-main` only |
| TI-003 | Workspace switching changes all panels | Call agent-overview as `ws-acme-prod`, then as `ws-acme-staging` | Every stat value differs (heavy vs light workspace) |
| TI-004 | Org boundary enforced | Auth as `org-acme` user, request access to `ws-initech-prod` | 403 Forbidden — workspace belongs to different org |
| TI-005 | Cannot override workspace via query param | Auth as `ws-acme-prod`, send `?workspace_id=ws-globex-main` | Response still scoped to `ws-acme-prod` (from JWT, not from client) |

### 1.2 SQL-level isolation

| ID | Scenario | Setup | Expected |
|----|----------|-------|----------|
| TI-006 | Every SQL query includes workspace_id param | Instrument ClickHouse client to log queries | 100% of queries contain `workspace_id = {workspace_id:String}` — no exceptions |
| TI-007 | No raw string interpolation of workspace_id | Static analysis of all query files | Zero instances of `${workspace_id}` or string concatenation in SQL |
| TI-008 | Cross-workspace aggregation impossible from BFF | Review all SQL queries | No query uses `GROUP BY workspace_id` or omits the workspace filter |

### 1.3 Seed data verification

| ID | Scenario | Setup | Expected |
|----|----------|-------|----------|
| TI-009 | Each workspace has distinct data volume | `SELECT workspace_id, count() FROM agent_executions GROUP BY workspace_id` | 5 distinct workspaces; `ws-acme-prod` has ~50K rows, `ws-acme-staging` has ~5K |
| TI-010 | No rows with null workspace_id | `SELECT count() FROM agent_executions WHERE workspace_id = ''` | Returns 0 |
| TI-011 | Org-workspace mapping correct | `SELECT org_id, workspace_id FROM workspaces` | `ws-acme-prod` and `ws-acme-staging` belong to `org-acme`; `ws-initech-prod` belongs to `org-initech` |

### 1.4 Frontend isolation

| ID | Scenario | Setup | Expected |
|----|----------|-------|----------|
| TI-012 | Workspace switcher only shows org workspaces | Auth as `org-acme` user, open workspace dropdown | Shows "Production" and "Staging" only — not Globex or Initech workspaces |
| TI-013 | Switching workspace re-fetches all views | Switch from `ws-acme-prod` to `ws-acme-staging`, observe network | New `GET /api/views/agent-overview` fires with updated auth context |
| TI-014 | No stale data after workspace switch | Switch workspace, inspect rendered stat values | Values match the new workspace — no cached data from previous workspace |
| TI-015 | Browser never sees SQL | Inspect all network responses in devtools | No response body contains SQL keywords or ClickHouse syntax |

---

## 2. BFF API (40 scenarios)

### 2.1 Authentication

| ID | Scenario | Expected |
|----|----------|----------|
| AUTH-001 | Valid JWT accepted | `GET /api/views/agent-overview` with valid Bearer token returns 200 |
| AUTH-002 | Missing Authorization header | Returns 401 with `{"error": "missing_token"}` |
| AUTH-003 | Malformed token (not JWT) | Returns 401 with `{"error": "invalid_token"}` |
| AUTH-004 | Expired JWT | Returns 401 with `{"error": "token_expired"}` |
| AUTH-005 | Wrong signing secret | Returns 401 with `{"error": "invalid_signature"}` |
| AUTH-006 | Demo token endpoint works | `GET /api/auth/demo-token` returns valid JWT with expected claims |
| AUTH-007 | Token claims contain required fields | Decoded JWT has `sub`, `org_id`, `workspace_id`, `role` |

### 2.2 View list endpoint

| ID | Scenario | Expected |
|----|----------|----------|
| VIEW-001 | List all views | `GET /api/views` returns 5 items |
| VIEW-002 | Each view has id, title, description | All 5 items contain all 3 fields as non-empty strings |
| VIEW-003 | View IDs match expected set | IDs are exactly: `agent-overview`, `tool-call-performance`, `llm-token-usage`, `error-breakdown`, `cost-tracking` |

### 2.3 Agent overview

| ID | Scenario | Expected |
|----|----------|----------|
| AO-001 | Returns view metadata | `view.id` is `agent-overview`, `view.refreshSec` is 30 |
| AO-002 | Returns all expected panels | Panel IDs include: `active_agents`, `total_invocations`, `error_rate_current`, `p95_latency_current`, `invocation_rate`, `error_rate`, `p95_latency`, `errors_by_type`, `step_distribution` |
| AO-003 | `active_agents` is a stat panel | `type` is `stat`, `data.resultType` is `vector`, result has single value |
| AO-004 | `invocation_rate` is timeseries | `type` is `timeseries`, `data.resultType` is `matrix`, result has multiple series with `agent_name` labels |
| AO-005 | `errors_by_type` is a bar panel | `type` is `bar`, result items sorted by value descending |
| AO-006 | `step_distribution` is a heatmap | `type` is `heatmap`, result contains time buckets and step count buckets |
| AO-007 | Stat values are non-negative | `active_agents`, `total_invocations` are >= 0 |
| AO-008 | Error rate is a percentage 0-100 | `error_rate_current` value is between 0 and 100 |

### 2.4 Tool call performance

| ID | Scenario | Expected |
|----|----------|----------|
| TCP-001 | Returns all expected panels | `active_tools`, `total_tool_calls`, `tool_error_rate`, `retry_rate`, `tool_latency_percentiles`, `tool_error_rates`, `tool_call_frequency`, `retry_rate_by_tool`, `slowest_tools` |
| TCP-002 | `tool_latency_percentiles` has p50/p95/p99 series | Timeseries with 3 series labeled by percentile |
| TCP-003 | `slowest_tools` is a table | `type` is `table`, result contains `tool_name`, latency values, and `call_count` |
| TCP-004 | Table rows sorted by p95 latency desc | First row has highest p95 value |

### 2.5 LLM token usage

| ID | Scenario | Expected |
|----|----------|----------|
| LLM-001 | Returns all expected panels | `total_tokens`, `token_rate`, `estimated_cost`, `avg_tokens_per_invocation`, `tokens_by_model`, `prompt_vs_completion`, `token_rate_trend`, `cost_by_model`, `top_consumers` |
| LLM-002 | `tokens_by_model` series match seeded models | Series labels include `claude-sonnet-4-20250514`, `gpt-4o` |
| LLM-003 | `prompt_vs_completion` has exactly 2 series | Series labeled `prompt` and `completion` |
| LLM-004 | `estimated_cost` is positive | Cost stat > 0 for a workspace with data |
| LLM-005 | `top_consumers` table has agent names | Each row contains `agent_name` and `total_tokens` columns |

### 2.6 Error breakdown

| ID | Scenario | Expected |
|----|----------|----------|
| ERR-001 | Returns all expected panels | `total_errors`, `error_rate_current`, `most_common_error`, `error_rate_trend`, `errors_by_type`, `errors_by_agent`, `errors_by_version`, `top_error_messages` |
| ERR-002 | `most_common_error` returns a string label | Stat value is a recognizable error type string, not a number |
| ERR-003 | `errors_by_version` reflects seeded versions | Bar items include `v2.3.1`, `v2.4.0`, `v2.5.0-beta` |
| ERR-004 | `top_error_messages` table has timestamps | Each row includes `first_seen` and `last_seen` |

### 2.7 Cost tracking

| ID | Scenario | Expected |
|----|----------|----------|
| COST-001 | Returns all expected panels | `daily_cost`, `projected_monthly`, `cost_per_invocation`, `week_over_week`, `cost_trend`, `cost_per_invocation_trend`, `cost_by_agent`, `cost_by_model` |
| COST-002 | `projected_monthly` > `daily_cost` | Monthly projection is larger than a single day |
| COST-003 | `week_over_week` is a percentage | Value represents a delta (can be positive or negative) |
| COST-004 | `cost_trend` covers 30 days | Timeseries has ~30 data points |
| COST-005 | `cost_by_model` totals match `estimated_cost` from LLM view | Sum of all model costs approximately equals the total cost stat (within 1%) |

### 2.8 Error handling

| ID | Scenario | Expected |
|----|----------|----------|
| ERH-001 | Unknown view ID returns 404 | `GET /api/views/nonexistent` returns 404 with `{"error": "view_not_found"}` |
| ERH-002 | Partial panel failure returns partial response | One panel query configured to fail; response includes other panels with data and the failing panel with an error field |
| ERH-003 | ClickHouse down returns 503 | Stop ClickHouse, call any view endpoint | Returns 503 with `{"error": "database_unavailable"}` |
| ERH-004 | Response time under 5 seconds | Call each view endpoint, measure response time | All 5 views respond within 5 seconds (NFR-002) |

---

## 3. ClickHouse queries (25 scenarios)

### 3.1 Query correctness

| ID | Scenario | Validation |
|----|----------|------------|
| SQL-001 | Error rate math is correct | Insert 100 executions: 95 success, 5 failure. Query error rate. Expected: 5.0% |
| SQL-002 | P95 latency calculation | Insert 100 rows with duration 1-100ms. Expected p95: ~95ms |
| SQL-003 | Time bucketing groups correctly | Insert rows at :01, :04, :06, :09 (5-min buckets). Expected: 2 rows in first bucket, 2 in second |
| SQL-004 | Token aggregation sums correctly | Insert 3 LLM requests: 100, 200, 300 tokens. Expected total: 600 |
| SQL-005 | Cost calculation uses correct formula | Insert request with 1000 prompt tokens at $3/MTok. Expected cost: $0.003 |
| SQL-006 | `DISTINCT agent_name` counts correctly | Insert 10 rows for 3 distinct agents. Expected active_agents: 3 |
| SQL-007 | Bar chart results sorted descending | Query errors_by_type. First item has highest count |
| SQL-008 | Table query respects LIMIT | `slowest_tools` returns at most 10 rows even with 15 distinct tools |

### 3.2 Time range filtering

| ID | Scenario | Validation |
|----|----------|------------|
| SQL-009 | 5-minute window for active agents | Insert agent row 6 minutes ago and 3 minutes ago. Only the recent row counted |
| SQL-010 | 1-hour window for current error rate | Insert error 2 hours ago and 30 minutes ago. Only recent error in rate |
| SQL-011 | 24-hour window for daily stats | Insert rows across 48 hours. Only last 24h included in totals |
| SQL-012 | 6-hour window for timeseries | Timeseries panel returns data points only within the last 6 hours |
| SQL-013 | 30-day window for cost trend | Cost trend has data points spanning up to 30 days |

### 3.3 Edge cases

| ID | Scenario | Validation |
|----|----------|------------|
| SQL-014 | Empty workspace returns zeros | Query `ws-empty` (no seeded data). Stat panels return 0, timeseries return empty arrays |
| SQL-015 | Single data point doesn't crash | Workspace with exactly 1 agent execution. All views return valid responses |
| SQL-016 | Very long agent name handled | Insert row with 200-char agent_name. Query succeeds, name appears in results |
| SQL-017 | Null error_type excluded from bar chart | Insert rows with NULL error_type. `errors_by_type` bar chart omits null entries |
| SQL-018 | Division by zero in error rate | Workspace with 0 total executions. Error rate returns 0, not NaN or error |
| SQL-019 | Future timestamps ignored | Insert row with timestamp 1 hour in the future. Not counted in current stats |
| SQL-020 | Cost projection handles month boundaries | Test on first day of month. Projection doesn't divide by zero |

### 3.4 Parameterized query safety

| ID | Scenario | Validation |
|----|----------|------------|
| SQL-021 | SQL injection in workspace_id blocked | Set workspace claim to `'; DROP TABLE agent_executions; --`. Query returns empty result, table intact |
| SQL-022 | Parameterized queries used consistently | Grep all `.ts` files in `queries/` — every `{workspace_id` uses `:String}` parameter syntax |
| SQL-023 | No `FORMAT` clause exposes raw data | No query returns ClickHouse-native formats. BFF transforms all results to JSON |
| SQL-024 | Query timeout configured | Long-running query (if possible to trigger) respects configured timeout, returns error |
| SQL-025 | Connection pool handles concurrent requests | Fire 20 parallel view requests. All return successfully, no connection exhaustion |

---

## 4. Frontend (35 scenarios)

### 4.1 Panel rendering

| ID | Scenario | Expected |
|----|----------|----------|
| FE-001 | Stat panel renders numeric value | Given stat data `{value: [ts, "42"]}`, renders "42" |
| FE-002 | Stat panel formats rate unit | Given `unit: "reqps"` and value "12.5", renders "12.5 req/s" |
| FE-003 | Stat panel formats duration | Given `unit: "seconds"` and value "0.045", renders "45ms" |
| FE-004 | Stat panel formats percentage | Given `unit: "percent"` and value "2.3", renders "2.3%" |
| FE-005 | Stat panel formats currency | Given `unit: "usd"` and value "284", renders "$284" |
| FE-006 | Stat panel formats large numbers | Given value "14800000", renders "14.8M" |
| FE-007 | Timeseries panel groups by label | Given 3 series with `agent_name` labels, chart renders 3 distinct lines |
| FE-008 | Bar panel sorts items | Given unsorted bar data, chart renders bars in descending order |
| FE-009 | Table panel renders columns and rows | Given table data with 5 columns and 10 rows, all cells populated |
| FE-010 | Heatmap panel renders bucket grid | Given heatmap data, chart renders colored grid |
| FE-011 | PanelRenderer routes stat type | Given `panel.type = "stat"`, renders StatChart component |
| FE-012 | PanelRenderer routes timeseries type | Given `panel.type = "timeseries"`, renders TimeSeriesChart |
| FE-013 | PanelRenderer routes unknown type | Given `panel.type = "pie"`, renders error message, no crash |

### 4.2 Loading and error states

| ID | Scenario | Expected |
|----|----------|----------|
| FE-014 | Loading state shows skeletons | During fetch, panels display animated skeleton placeholders |
| FE-015 | Error state shows message | BFF returns 500; page displays error message, not blank screen |
| FE-016 | Partial failure shows working panels | BFF returns 8 panels OK + 1 with error; 8 panels render, 1 shows error message |
| FE-017 | Network timeout shows retry option | Fetch times out after 10s; page shows error with "retry" affordance |
| FE-018 | Empty data shows "no data" | Panel with empty result array; renders "No data" placeholder, not broken chart |

### 4.3 Navigation

| ID | Scenario | Expected |
|----|----------|----------|
| FE-019 | Sidebar shows 5 nav items | On load, sidebar contains all 5 view links |
| FE-020 | Active state on current view | Navigate to cost-tracking; that nav item has active styling |
| FE-021 | Clicking nav item changes view | Click "Error breakdown"; page renders error breakdown panels |
| FE-022 | URL reflects current view | After navigating to tool-call-performance, URL contains `/views/tool-call-performance` |
| FE-023 | Deep link loads correct view | Open `/views/llm-token-usage` directly; LLM token usage page renders |
| FE-024 | Root path redirects to agent overview | Open `/`; redirects to agent overview |
| FE-025 | Unknown path shows 404 | Open `/views/nonexistent`; shows "View not found" within the app shell |

### 4.4 Auto-refresh

| ID | Scenario | Expected |
|----|----------|----------|
| FE-026 | Agent overview polls every 30 seconds | After initial load, second network request fires at ~30s |
| FE-027 | Cost tracking polls every 300 seconds | After initial load, no second request within 60s (longer interval) |
| FE-028 | Polls stop when tab is hidden | Switch to different browser tab; no fetch requests fire |
| FE-029 | Polls resume when tab is visible | Return to tab after 60s; fetch fires within 5 seconds |

### 4.5 Workspace switcher

| ID | Scenario | Expected |
|----|----------|----------|
| FE-030 | Switcher populated from API | Dropdown lists workspaces from `GET /api/workspaces` |
| FE-031 | Switching workspace updates all data | Select a different workspace; all panels re-fetch and display new values |
| FE-032 | Selected workspace persists across navigation | Switch to ws-acme-staging, navigate to cost tracking; data is still for staging |
| FE-033 | Header displays workspace name | Shows "Production" or "Staging" in the app header |

### 4.6 Data formatting edge cases

| ID | Scenario | Expected |
|----|----------|----------|
| FE-034 | Zero value renders as "0", not blank | Stat panel with value "0" shows "0", not empty |
| FE-035 | Very small cost renders with precision | Value "0.00042" renders as "$0.0004" not "$0" |

---

## 5. E2E smoke tests (15 scenarios)

Run via Playwright against the full `docker-compose` stack with seeded data.

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| E2E-001 | Stack boots successfully | `docker-compose up`, wait for healthchecks | All 3 services healthy within 60 seconds |
| E2E-002 | Seed data loads | Run seed generator | ClickHouse tables contain expected row counts |
| E2E-003 | Dashboard loads | Navigate to `localhost:3000` | Page renders, sidebar visible, no console errors |
| E2E-004 | Agent overview renders with data | Click "Agent overview" | 4 stat cards with numeric values, charts have non-zero canvas dimensions |
| E2E-005 | Tool call performance renders | Click "Tool call performance" | Stat cards populated, table has rows |
| E2E-006 | LLM token usage renders | Click "LLM token usage" | Token count stat > 0, cost stat > 0 |
| E2E-007 | Error breakdown renders | Click "Error breakdown" | Error count stat > 0, bar chart has bars |
| E2E-008 | Cost tracking renders | Click "Cost tracking" | Daily cost stat > 0, projected monthly stat > daily cost |
| E2E-009 | No panel shows "No data" | Visit all 5 views | Zero panels display "No data" or empty placeholders |
| E2E-010 | Workspace switch changes data | Switch from `ws-acme-prod` to `ws-acme-staging` | At least one stat value changes |
| E2E-011 | Navigation cycle completes | Click through all 5 nav items sequentially | Each page loads without errors; no stale content |
| E2E-012 | Auto-refresh updates values | Wait on agent overview for 35 seconds | Network tab shows a second fetch; no loading flash |
| E2E-013 | No console errors across all views | Capture browser console during full navigation | Zero errors or warnings (except expected dev-mode React warnings) |
| E2E-014 | Charts resize on viewport change | Resize viewport from 1440px to 1024px | Charts scale to fit; no overflow or clipping |
| E2E-015 | Screenshot baseline for all views | Capture screenshot of each view | Saved as visual regression baselines for future comparison |

---

## Test priority for one-day build

If time is tight, run tests in this order. Stop when time runs out.

| Priority | Category | Count | Rationale |
|----------|----------|-------|-----------|
| P0 | E2E smoke (E2E-001 through E2E-009) | 9 | If these pass, the demo works |
| P0 | Tenant isolation (TI-001 through TI-008) | 8 | Security-critical, interview talking point |
| P1 | SQL edge cases (SQL-014, SQL-018, SQL-021) | 3 | Empty workspace, division by zero, injection |
| P1 | BFF auth (AUTH-001 through AUTH-005) | 5 | Shows auth is considered |
| P2 | BFF view endpoints (AO through COST) | 24 | Validates data correctness |
| P2 | Frontend rendering (FE-001 through FE-013) | 13 | Chart component behavior |
| P3 | Frontend navigation and polish (FE-019 through FE-035) | 17 | UX polish |
| P3 | Remaining SQL and E2E | 19 | Comprehensive coverage |

**Minimum viable test suite for the demo: 25 tests (P0 + P1).**
Full suite if time permits: 130 tests.
