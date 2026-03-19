// =============================================================================
// Custom Dashboard BFF — Mock Data for Wireframes & Mockups
// =============================================================================
//
// Models the exact JSON shape the React frontend receives from
// GET /api/views/{view_id}. All PromQL lives in the BFF — the frontend
// never sees it. These mocks let us build wireframes against real data
// shapes without a running Mimir backend.
//
// TOP 10 METRICS (all P0, ship-blocking):
//
//  #  | Metric                            | Type       | Unit       | Views
// ----|-----------------------------------|------------|------------|-------------------------------
//  1  | gen_ai.client.operation.duration   | Histogram  | s          | LLM Token Usage
//  2  | gen_ai.client.token.usage          | Histogram  | {token}    | LLM Token Usage
//  7  | agent.invocation.duration          | Histogram  | s          | Agent Overview
//  8  | agent.invocation.count             | Counter    | {invoc}    | Agent Overview, Error Breakdown
//  9  | agent.step.count                   | Histogram  | {step}     | Agent Overview
//  17 | agent.error.count                  | Counter    | {error}    | Agent Overview, Error Breakdown
//  19 | tool.call.count                    | Counter    | {call}     | Tool Call Performance
//  20 | tool.call.duration                 | Histogram  | s          | Tool Call Performance
//  46 | guardrail.validation.result        | Counter    | {result}   | Agent Overview (cross-cutting)
//  63 | gen_ai.cost.total                  | Counter    | USD        | Cost Tracking
//
// =============================================================================

// ---------------------------------------------------------------------------
// 1. TYPE DEFINITIONS — mirrors BFF JSON response schema
// ---------------------------------------------------------------------------

/** Top-level response from GET /api/views/{view_id} */
export interface ViewResponse {
  view: ViewMeta;
  panels: Panel[];
}

/** View metadata header */
export interface ViewMeta {
  id: string;
  title: string;
  description: string;
  refreshSec: number;
}

/** A single panel within a view */
export interface Panel {
  id: string;
  title: string;
  type: PanelType;
  unit: PanelUnit;
  data: PanelData;
  subtitle?: string;
  subtitleColor?: "success" | "danger" | "warning" | "muted";
  valueColor?: "success" | "danger" | "warning";
  displayValue?: string;
}

type PanelType = "timeseries" | "stat" | "gauge" | "heatmap" | "bar" | "table";
type PanelUnit = "reqps" | "seconds" | "bytes" | "percent" | "short" | "USD" | "tokens" | "tokps";

/** Prometheus-compatible result envelope */
export type PanelData =
  | { resultType: "matrix"; result: MatrixResult[] }
  | { resultType: "vector"; result: VectorResult[] }
  | { resultType: "scalar"; result: [number, string] };

/** Time series (for timeseries, heatmap panels) */
export interface MatrixResult {
  metric: Record<string, string>;
  values: [number, string][]; // [unix_epoch, value]
}

/** Instant vector (for stat, bar, table panels) */
export interface VectorResult {
  metric: Record<string, string>;
  value: [number, string]; // [unix_epoch, value]
}

/** Listing response from GET /api/views */
export interface ViewListItem {
  id: string;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// 2. HELPERS — generate realistic time series
// ---------------------------------------------------------------------------

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;
const DAY = 86400;
const STEP_1M = 60;
const STEP_5M = 300;

/** Generate timestamps from (now - rangeSec) to now at stepSec intervals */
function timestamps(rangeSec: number, stepSec: number): number[] {
  const ts: number[] = [];
  for (let t = NOW - rangeSec; t <= NOW; t += stepSec) ts.push(t);
  return ts;
}

/** Sinusoidal pattern with noise — simulates daily traffic */
function trafficCurve(
  ts: number[],
  base: number,
  amplitude: number,
  noisePct = 0.08
): [number, string][] {
  return ts.map((t) => {
    const hourOfDay = ((t % DAY) / HOUR) % 24;
    // Peak at 14:00 UTC, trough at 04:00 UTC
    const sin = Math.sin(((hourOfDay - 4) / 24) * 2 * Math.PI);
    const value = base + amplitude * sin + base * noisePct * (Math.random() - 0.5);
    return [t, Math.max(0, value).toFixed(2)];
  });
}

/** Monotonically increasing counter with jitter */
function counterCurve(
  ts: number[],
  ratePerSec: number,
  stepSec: number,
  jitterPct = 0.1
): [number, string][] {
  let cumulative = 0;
  return ts.map((t) => {
    const increment = ratePerSec * stepSec * (1 + jitterPct * (Math.random() - 0.5));
    cumulative += increment;
    return [t, cumulative.toFixed(0)];
  });
}

/** Stable value with small variance (for latency, percentages) */
function stableSeries(
  ts: number[],
  center: number,
  variance: number
): [number, string][] {
  return ts.map((t) => {
    const value = center + variance * (Math.random() - 0.5);
    return [t, Math.max(0, value).toFixed(3)];
  });
}

/**
 * Overlay a spike on an existing series.
 * Multiplies values within [peakTime - rampUp, peakTime + rampDown] by a
 * Gaussian-ish envelope that peaks at `multiplier`.
 *
 * @param values    Base series (modified in place for convenience, returns new array)
 * @param peakTime  Unix epoch of spike apex
 * @param multiplier How many × the base value at the peak (e.g. 5 = 5× normal)
 * @param rampUp    Seconds before peak to start climbing (default 10 min)
 * @param rampDown  Seconds after peak to finish decaying (default 20 min)
 */
function withSpike(
  values: [number, string][],
  peakTime: number,
  multiplier: number,
  rampUp = 10 * 60,
  rampDown = 20 * 60,
): [number, string][] {
  return values.map(([t, v]) => {
    let factor = 1;
    if (t >= peakTime - rampUp && t <= peakTime + rampDown) {
      // Normalised distance from peak: 0 at peak, 1 at edges
      const dist = t < peakTime
        ? (peakTime - t) / rampUp
        : (t - peakTime) / rampDown;
      // Gaussian-ish bell: e^(-3·d²) → ~0.05 at edges, 1 at center
      factor = 1 + (multiplier - 1) * Math.exp(-3 * dist * dist);
    }
    return [t, (Number(v) * factor).toFixed(3)];
  });
}

// ---------------------------------------------------------------------------
// 3. VIEW LIST — GET /api/views
// ---------------------------------------------------------------------------

export const mockViewList: ViewListItem[] = [
  {
    id: "agent-overview",
    title: "Agent Execution Overview",
    description:
      "Real-time view of agent health, error rates, and execution performance",
  },
  {
    id: "tool-call-performance",
    title: "Tool Call Performance",
    description:
      "Per-tool latency, error rates, call frequency, and retry analysis",
  },
  {
    id: "llm-token-usage",
    title: "LLM Token Usage",
    description:
      "Token consumption by model, prompt vs completion split, and throughput",
  },
  {
    id: "error-breakdown",
    title: "Error Breakdown",
    description:
      "Error classification by type, agent, stage, and version with trend analysis",
  },
  {
    id: "cost-tracking",
    title: "Cost Tracking",
    description:
      "Real-time cost attribution by agent, model, and invocation with projections",
  },
];

// ---------------------------------------------------------------------------
// 4. VIEW: Agent Execution Overview
// ---------------------------------------------------------------------------
// Metrics used: #8 agent.invocation.count, #7 agent.invocation.duration,
//               #17 agent.error.count, #9 agent.step.count,
//               #46 guardrail.validation.result

const ts24h = timestamps(DAY, STEP_1M);
const ts5m = timestamps(5 * 60, STEP_1M);

export const mockAgentOverview: ViewResponse = {
  view: {
    id: "agent-overview",
    title: "Agent Execution Overview",
    description:
      "Real-time view of agent health, error rates, and execution performance",
    refreshSec: 30,
  },
  panels: [
    // ── Row 1: Key stats ──────────────────────────────────────────────────
    {
      id: "active_agents",
      title: "Active Agents",
      type: "stat",
      unit: "short",
      subtitle: "▲ 2 from yesterday",
      subtitleColor: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "12"] }],
      },
    },
    {
      id: "total_invocations_24h",
      title: "Invocations (24h)",
      type: "stat",
      unit: "short",
      subtitle: "~33.5 req/s avg",
      subtitleColor: "muted",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "48291"] }],
      },
    },
    {
      id: "error_rate_current",
      title: "Error Rate (5m)",
      type: "stat",
      unit: "percent",
      subtitle: "▲ 0.8% from baseline",
      subtitleColor: "danger",
      valueColor: "danger",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "2.3"] }],
      },
    },
    {
      id: "p95_latency_current",
      title: "p95 Latency (5m)",
      type: "stat",
      unit: "seconds",
      subtitle: "▼ 0.3s improved",
      subtitleColor: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "1.82"] }],
      },
    },

    // ── Row 2: Invocation rate + Error rate time series ───────────────────
    {
      // Metric #8: agent.invocation.count → rate()
      id: "invocation_rate",
      title: "Invocation Rate",
      subtitle: "req/s · 24h · by agent",
      type: "timeseries",
      unit: "reqps",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { agent_name: "order-processor" },
            values: trafficCurve(ts24h, 12.5, 4.0),
          },
          {
            metric: { agent_name: "support-triage" },
            values: trafficCurve(ts24h, 8.2, 3.1),
          },
          {
            metric: { agent_name: "doc-summarizer" },
            values: trafficCurve(ts24h, 5.7, 2.0),
          },
          {
            metric: { agent_name: "code-reviewer" },
            values: trafficCurve(ts24h, 3.1, 1.2),
          },
        ],
      },
    },
    {
      // Metric #17: agent.error.count → rate() / rate(#8) * 100
      id: "error_rate",
      title: "Error Rate",
      subtitle: "% · 24h · aggregate",
      type: "timeseries",
      unit: "percent",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { agent_name: "order-processor" },
            values: stableSeries(ts24h, 1.8, 1.2),
          },
          {
            metric: { agent_name: "support-triage" },
            // Spike ~2h ago: error rate jumped to ~5× for ~30 min
            values: withSpike(stableSeries(ts24h, 3.2, 2.0), NOW - 2 * HOUR, 5),
          },
          {
            metric: { agent_name: "doc-summarizer" },
            values: stableSeries(ts24h, 0.9, 0.6),
          },
          {
            metric: { agent_name: "code-reviewer" },
            values: stableSeries(ts24h, 2.5, 1.5),
          },
        ],
      },
    },

    // ── Row 3: Errors by type (bar) + p95 latency (timeseries) ───────────
    {
      // Metric #17: agent.error.count by error.type, increase over 24h
      id: "errors_by_type",
      title: "Errors by Type (24h)",
      subtitle: "count · 24h",
      type: "bar",
      unit: "short",
      data: {
        resultType: "vector",
        result: [
          { metric: { error_type: "timeout" }, value: [NOW, "412"] },
          { metric: { error_type: "rate_limit" }, value: [NOW, "287"] },
          { metric: { error_type: "tool_failure" }, value: [NOW, "156"] },
          { metric: { error_type: "validation" }, value: [NOW, "93"] },
          { metric: { error_type: "guardrail_block" }, value: [NOW, "61"] },
          { metric: { error_type: "context_overflow" }, value: [NOW, "28"] },
        ],
      },
    },
    {
      // Metric #7: agent.invocation.duration → histogram_quantile(0.95)
      id: "p95_latency",
      title: "Execution Latency (p95)",
      subtitle: "seconds · 24h · by agent",
      type: "timeseries",
      unit: "seconds",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { agent_name: "order-processor" },
            values: stableSeries(ts24h, 3.2, 1.0),
          },
          {
            metric: { agent_name: "support-triage" },
            // Correlated latency spike ~2h ago
            values: withSpike(stableSeries(ts24h, 5.8, 1.5), NOW - 2 * HOUR, 3),
          },
          {
            metric: { agent_name: "doc-summarizer" },
            values: stableSeries(ts24h, 2.1, 0.8),
          },
          {
            metric: { agent_name: "code-reviewer" },
            values: stableSeries(ts24h, 8.4, 2.5),
          },
        ],
      },
    },

    // ── Row 4: Step distribution (heatmap) + Guardrail pass/fail (bar) ────
    {
      // Metric #9: agent.step.count histogram buckets
      id: "step_distribution",
      title: "Steps per Execution",
      type: "heatmap",
      unit: "short",
      data: {
        resultType: "matrix",
        result: [
          { metric: { le: "1" }, values: trafficCurve(ts24h, 2.0, 0.5, 0.05) },
          { metric: { le: "3" }, values: trafficCurve(ts24h, 8.0, 2.0, 0.05) },
          { metric: { le: "5" }, values: trafficCurve(ts24h, 12.0, 3.0, 0.05) },
          { metric: { le: "8" }, values: trafficCurve(ts24h, 6.0, 1.5, 0.05) },
          { metric: { le: "13" }, values: trafficCurve(ts24h, 2.5, 0.8, 0.05) },
          { metric: { le: "21" }, values: trafficCurve(ts24h, 0.8, 0.3, 0.05) },
          { metric: { le: "+Inf" }, values: trafficCurve(ts24h, 0.2, 0.1, 0.05) },
        ],
      },
    },
    {
      // Metric #46: guardrail.validation.result
      id: "guardrail_pass_fail",
      title: "Guardrail Results (24h)",
      type: "bar",
      unit: "short",
      data: {
        resultType: "vector",
        result: [
          { metric: { guardrail_result: "pass" }, value: [NOW, "45873"] },
          { metric: { guardrail_result: "fail" }, value: [NOW, "1904"] },
          { metric: { guardrail_result: "warn" }, value: [NOW, "514"] },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. VIEW: Tool Call Performance
// ---------------------------------------------------------------------------
// Metrics used: #19 tool.call.count, #20 tool.call.duration

export const mockToolCallPerformance: ViewResponse = {
  view: {
    id: "tool-call-performance",
    title: "Tool Call Performance",
    description:
      "Per-tool latency, error rates, call frequency, and retry analysis",
    refreshSec: 30,
  },
  panels: [
    // ── Row 1: Stats ──────────────────────────────────────────────────────
    {
      id: "active_tools",
      title: "Active Tools",
      type: "stat",
      unit: "short",
      subtitle: "▲ 1 new since last deploy",
      subtitleColor: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "8"] }],
      },
    },
    {
      id: "total_tool_calls_24h",
      title: "Total Tool Calls (24h)",
      type: "stat",
      unit: "short",
      subtitle: "~2.6 calls/invocation avg",
      subtitleColor: "muted",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "127439"] }],
      },
    },
    {
      id: "tool_error_rate_current",
      title: "Tool Error Rate",
      type: "stat",
      unit: "percent",
      valueColor: "warning",
      subtitle: "▲ 0.5% from baseline",
      subtitleColor: "warning",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "1.8"] }],
      },
    },
    {
      id: "retry_rate",
      title: "Retry Rate",
      type: "stat",
      unit: "percent",
      subtitle: "▲ 1.1% from yesterday",
      subtitleColor: "danger",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "4.2"] }],
      },
    },

    // ── Row 2: Tool latency + Tool error rates (timeseries) ──────────────
    {
      // Metric #20: tool.call.duration → histogram_quantile
      id: "tool_latency_percentiles",
      title: "Tool Latency p50/p95/p99",
      subtitle: "seconds · 24h · aggregate",
      type: "timeseries",
      unit: "seconds",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { quantile: "p50" },
            values: stableSeries(ts24h, 0.34, 0.08),
          },
          {
            metric: { quantile: "p95" },
            values: stableSeries(ts24h, 1.12, 0.25),
          },
          {
            metric: { quantile: "p99" },
            values: stableSeries(ts24h, 2.87, 0.60),
          },
        ],
      },
    },
    {
      // Metric #19: tool.call.count{status=error} / tool.call.count by tool over time
      id: "tool_error_rates",
      title: "Tool Error Rates",
      subtitle: "% · 24h · by tool",
      type: "timeseries",
      unit: "percent",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { tool_name: "code_exec" },
            values: stableSeries(ts24h, 3.48, 1.5),
          },
          {
            metric: { tool_name: "web_search" },
            values: stableSeries(ts24h, 2.14, 0.8),
          },
          {
            metric: { tool_name: "api_call" },
            values: stableSeries(ts24h, 1.92, 0.7),
          },
          {
            metric: { tool_name: "sql_query" },
            values: stableSeries(ts24h, 0.87, 0.4),
          },
          {
            metric: { tool_name: "file_read" },
            values: stableSeries(ts24h, 0.31, 0.15),
          },
        ],
      },
    },

    // ── Row 3: Retry rate by tool (bar) + Slowest tools (table) ──────────
    {
      // Metric #19: tool.call.count{retried=true} / tool.call.count by tool
      id: "retry_rate_by_tool",
      title: "Retry Rate by Tool",
      subtitle: "% retried · 24h",
      type: "bar",
      unit: "percent",
      data: {
        resultType: "vector",
        result: [
          { metric: { tool_name: "web_search" }, value: [NOW, "6.3"] },
          { metric: { tool_name: "api_call" }, value: [NOW, "5.1"] },
          { metric: { tool_name: "code_exec" }, value: [NOW, "4.8"] },
          { metric: { tool_name: "sql_query" }, value: [NOW, "2.9"] },
          { metric: { tool_name: "file_read" }, value: [NOW, "1.2"] },
        ],
      },
    },
    {
      // Metric #20: tool.call.duration top-K by p95
      id: "slowest_tools",
      title: "Slowest Tools (p95)",
      subtitle: "table · current window",
      type: "table",
      unit: "seconds",
      data: {
        resultType: "vector",
        result: [
          {
            metric: { tool_name: "code_exec", agent_name: "code-reviewer" },
            value: [NOW, "3.41"],
          },
          {
            metric: { tool_name: "web_search", agent_name: "support-triage" },
            value: [NOW, "2.87"],
          },
          {
            metric: { tool_name: "web_search", agent_name: "order-processor" },
            value: [NOW, "2.12"],
          },
          {
            metric: { tool_name: "sql_query", agent_name: "order-processor" },
            value: [NOW, "1.56"],
          },
          {
            metric: { tool_name: "api_call", agent_name: "doc-summarizer" },
            value: [NOW, "0.98"],
          },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. VIEW: LLM Token Usage
// ---------------------------------------------------------------------------
// Metrics used: #2 gen_ai.client.token.usage, #1 gen_ai.client.operation.duration

export const mockLLMTokenUsage: ViewResponse = {
  view: {
    id: "llm-token-usage",
    title: "LLM Token Usage",
    description:
      "Token consumption by model, prompt vs completion split, and throughput",
    refreshSec: 60,
  },
  panels: [
    // ── Row 1: Stats ──────────────────────────────────────────────────────
    {
      id: "total_tokens_24h",
      title: "Total Tokens (24h)",
      type: "stat",
      unit: "tokens",
      subtitle: "9.2M prompt + 5.6M completion",
      subtitleColor: "muted",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "14800000"] }],
      },
    },
    {
      id: "token_rate",
      title: "Token Rate",
      type: "stat",
      unit: "tokps",
      subtitle: "▲ 12% from yesterday",
      subtitleColor: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "171"] }],
      },
    },
    {
      id: "estimated_cost_24h",
      title: "Est. Cost (24h)",
      type: "stat",
      unit: "USD",
      subtitle: "▲ $32 over budget",
      subtitleColor: "warning",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "284"] }],
      },
    },
    {
      id: "avg_tokens_per_invocation",
      title: "Avg Tokens/Invocation",
      type: "stat",
      unit: "short",
      subtitle: "191 prompt + 116 completion",
      subtitleColor: "muted",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "307"] }],
      },
    },

    // ── Row 2: Token rate + Prompt vs Completion split ────────────────────
    {
      // Metric #2: gen_ai.client.token.usage → rate() by model
      id: "token_rate_by_model",
      title: "Tokens by Model",
      subtitle: "tokens/s · 24h · stacked",
      type: "timeseries",
      unit: "tokps",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { model: "gpt-4o" },
            values: trafficCurve(ts24h, 95.0, 30.0),
          },
          {
            metric: { model: "claude-sonnet-4-20250514" },
            values: trafficCurve(ts24h, 72.0, 22.0),
          },
          {
            metric: { model: "gpt-4o-mini" },
            values: trafficCurve(ts24h, 45.0, 15.0),
          },
        ],
      },
    },
    {
      // Metric #2: gen_ai.client.token.usage by token_type
      id: "prompt_vs_completion",
      title: "Input vs Output Tokens",
      subtitle: "tokens/s · 24h",
      type: "timeseries",
      unit: "tokps",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { token_type: "input" },
            values: trafficCurve(ts24h, 165.0, 50.0),
          },
          {
            metric: { token_type: "output" },
            values: trafficCurve(ts24h, 48.0, 15.0),
          },
        ],
      },
    },

    // ── Row 3: Cost by model + Top consumers ─────────────────────────────
    {
      // Derived: token usage × price per token, by model
      id: "cost_by_model",
      title: "Cost by Model (24h)",
      subtitle: "USD · 24h",
      type: "bar",
      unit: "USD",
      data: {
        resultType: "vector",
        result: [
          { metric: { model: "gpt-4o" }, value: [NOW, "142.87"] },
          { metric: { model: "claude-sonnet-4-20250514" }, value: [NOW, "98.34"] },
          { metric: { model: "gpt-4o-mini" }, value: [NOW, "12.61"] },
        ],
      },
    },

    {
      // Metric #2: gen_ai.client.token.usage by agent_name top-K
      id: "top_token_consumers",
      title: "Top Token Consumers (24h)",
      subtitle: "table · by agent · 24h",
      type: "table",
      unit: "tokens",
      data: {
        resultType: "vector",
        result: [
          {
            metric: { agent_name: "support-triage", model: "gpt-4o" },
            value: [NOW, "5847201"],
          },
          {
            metric: { agent_name: "order-processor", model: "gpt-4o" },
            value: [NOW, "4210384"],
          },
          {
            metric: { agent_name: "code-reviewer", model: "claude-sonnet-4-20250514" },
            value: [NOW, "3891042"],
          },
          {
            metric: { agent_name: "doc-summarizer", model: "gpt-4o-mini" },
            value: [NOW, "2784519"],
          },
          {
            metric: { agent_name: "support-triage", model: "claude-sonnet-4-20250514" },
            value: [NOW, "1738947"],
          },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 7. VIEW: Error Breakdown
// ---------------------------------------------------------------------------
// Metrics used: #17 agent.error.count, #8 agent.invocation.count

export const mockErrorBreakdown: ViewResponse = {
  view: {
    id: "error-breakdown",
    title: "Error Breakdown",
    description:
      "Error classification by type, agent, stage, and version with trend analysis",
    refreshSec: 30,
  },
  panels: [
    // ── Row 1: Stats (4 columns) ────────────────────────────────────────
    {
      id: "total_errors_24h",
      title: "Total Errors (24h)",
      type: "stat",
      unit: "short",
      subtitle: "▲ 23% from yesterday",
      subtitleColor: "danger",
      valueColor: "danger",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "1108"] }],
      },
    },
    {
      id: "error_rate_overall",
      title: "Error Rate (5m)",
      type: "stat",
      unit: "percent",
      subtitle: "SLO target: < 3%",
      subtitleColor: "muted",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "2.34"] }],
      },
    },
    {
      id: "error_budget_remaining",
      title: "Error Budget Remaining",
      type: "stat",
      unit: "percent",
      valueColor: "warning",
      subtitle: "Burn rate: 2.1x (fast)",
      subtitleColor: "danger",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "41"] }],
      },
    },
    {
      id: "most_common_error",
      title: "Most Common Error",
      type: "stat",
      unit: "short",
      displayValue: "LLM timeout",
      subtitle: "342 occurrences (31%)",
      subtitleColor: "muted",
      data: {
        resultType: "vector",
        result: [{ metric: { error_type: "timeout" }, value: [NOW, "342"] }],
      },
    },

    // ── Row 2: Error rate trend + Errors by type ──────────────────────────
    {
      // Metric #17/#8: agent.error.count / agent.invocation.count over time
      id: "error_rate_trend",
      title: "Error Rate Trend",
      subtitle: "% · 24h · 5m windows",
      type: "timeseries",
      unit: "percent",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { aggregate: "all_agents" },
            // Spike ~2h ago matching the support-triage incident
            values: withSpike(stableSeries(ts24h, 2.3, 1.0), NOW - 2 * HOUR, 4),
          },
        ],
      },
    },
    {
      // Metric #17: agent.error.count by error_type, 24h totals
      id: "errors_by_type",
      title: "Errors by Type",
      subtitle: "count · 24h",
      type: "bar",
      unit: "short",
      data: {
        resultType: "vector",
        result: [
          { metric: { error_type: "timeout" }, value: [NOW, "342"] },
          { metric: { error_type: "rate_limit" }, value: [NOW, "287"] },
          { metric: { error_type: "tool_failure" }, value: [NOW, "156"] },
          { metric: { error_type: "validation" }, value: [NOW, "93"] },
          { metric: { error_type: "guardrail_block" }, value: [NOW, "61"] },
        ],
      },
    },

    // ── Row 3: Errors by agent (bar) + Top error messages (table) ────────
    {
      // Metric #17: agent.error.count by agent_name, increase 24h
      id: "errors_by_agent",
      title: "Errors by Agent",
      subtitle: "count · 24h",
      type: "bar",
      unit: "short",
      data: {
        resultType: "vector",
        result: [
          { metric: { agent_name: "support-triage" }, value: [NOW, "341"] },
          { metric: { agent_name: "order-processor" }, value: [NOW, "298"] },
          { metric: { agent_name: "code-reviewer" }, value: [NOW, "247"] },
          { metric: { agent_name: "doc-summarizer" }, value: [NOW, "151"] },
        ],
      },
    },
    {
      // Derived from traces — top error messages by frequency
      id: "top_error_messages",
      title: "Top Error Messages",
      subtitle: "table · 24h",
      type: "table",
      unit: "short",
      data: {
        resultType: "vector",
        result: [
          {
            metric: {
              error_type: "timeout",
              error_message: "LLM request exceeded 30s deadline",
              agent_name: "support-triage",
            },
            value: [NOW, "187"],
          },
          {
            metric: {
              error_type: "rate_limit",
              error_message: "OpenAI 429: rate limit exceeded for gpt-4o",
              agent_name: "order-processor",
            },
            value: [NOW, "143"],
          },
          {
            metric: {
              error_type: "tool_failure",
              error_message: "sql_query: connection pool exhausted",
              agent_name: "order-processor",
            },
            value: [NOW, "89"],
          },
          {
            metric: {
              error_type: "validation",
              error_message: "output schema validation failed: missing required field 'order_id'",
              agent_name: "order-processor",
            },
            value: [NOW, "67"],
          },
          {
            metric: {
              error_type: "guardrail_block",
              error_message: "PII detected in output: email address",
              agent_name: "support-triage",
            },
            value: [NOW, "52"],
          },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 8. VIEW: Cost Tracking
// ---------------------------------------------------------------------------
// Metrics used: #63 gen_ai.cost.total, #2 gen_ai.client.token.usage (derived cost)

export const mockCostTracking: ViewResponse = {
  view: {
    id: "cost-tracking",
    title: "Cost Tracking",
    description:
      "Real-time cost attribution by agent, model, and invocation with projections",
    refreshSec: 300,
  },
  panels: [
    // ── Row 1: Stats ──────────────────────────────────────────────────────
    {
      id: "estimated_daily_cost",
      title: "Est. Daily Cost",
      type: "stat",
      unit: "USD",
      subtitle: "Budget: $250/day",
      subtitleColor: "warning",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "284"] }],
      },
    },
    {
      id: "projected_monthly_cost",
      title: "Projected Monthly",
      type: "stat",
      unit: "USD",
      subtitle: "$1,020 over budget",
      subtitleColor: "danger",
      valueColor: "danger",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "8520"] }],
      },
    },
    {
      id: "cost_per_invocation_avg",
      title: "Cost per Invocation",
      type: "stat",
      unit: "USD",
      subtitle: "▼ 8% optimized",
      subtitleColor: "success",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "0.00526"] }],
      },
    },
    {
      id: "cost_change_wow",
      title: "Week-over-Week",
      type: "stat",
      unit: "percent",
      subtitle: "Driven by support-bot",
      subtitleColor: "warning",
      data: {
        resultType: "vector",
        result: [{ metric: {}, value: [NOW, "+14"] }],
      },
    },

    // ── Row 2: Cost trend + Cost per invocation ───────────────────────────
    {
      // Metric #63: gen_ai.cost.total → daily cost trend
      id: "cost_trend",
      title: "Daily Cost Trend",
      subtitle: "USD · 7d",
      type: "timeseries",
      unit: "USD",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { aggregate: "total" },
            values: counterCurve(ts24h, 0.00294, STEP_1M, 0.15),
          },
        ],
      },
    },
    {
      // Metric #63/#8: gen_ai.cost.total / agent.invocation.count
      id: "cost_per_invocation",
      title: "Cost per Invocation",
      subtitle: "USD · 7d · by agent",
      type: "timeseries",
      unit: "USD",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { agent_name: "code-reviewer" },
            values: stableSeries(ts24h, 0.0124, 0.003),
          },
          {
            metric: { agent_name: "support-triage" },
            values: stableSeries(ts24h, 0.0071, 0.002),
          },
          {
            metric: { agent_name: "order-processor" },
            values: stableSeries(ts24h, 0.0048, 0.001),
          },
          {
            metric: { agent_name: "doc-summarizer" },
            values: stableSeries(ts24h, 0.0028, 0.0008),
          },
        ],
      },
    },

    // ── Row 3: Cost by agent (bar) + Cost by model (bar) ──────────────────
    {
      // Metric #63: gen_ai.cost.total by agent_name, increase 24h
      id: "cost_by_agent",
      title: "Cost by Agent",
      subtitle: "USD · today",
      type: "bar",
      unit: "USD",
      data: {
        resultType: "vector",
        result: [
          { metric: { agent_name: "support-triage" }, value: [NOW, "87.42"] },
          { metric: { agent_name: "code-reviewer" }, value: [NOW, "72.19"] },
          { metric: { agent_name: "order-processor" }, value: [NOW, "61.34"] },
          { metric: { agent_name: "doc-summarizer" }, value: [NOW, "32.87"] },
        ],
      },
    },
    {
      // Metric #63: gen_ai.cost.total by model
      id: "cost_by_model",
      title: "Cost by Model",
      subtitle: "USD · today",
      type: "bar",
      unit: "USD",
      data: {
        resultType: "vector",
        result: [
          { metric: { model: "gpt-4o" }, value: [NOW, "142.87"] },
          { metric: { model: "claude-sonnet-4-20250514" }, value: [NOW, "98.34"] },
          { metric: { model: "gpt-4o-mini" }, value: [NOW, "12.61"] },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 9. MOCK API — drop-in replacement for BFF fetch calls
// ---------------------------------------------------------------------------

const viewMap: Record<string, ViewResponse> = {
  "agent-overview": mockAgentOverview,
  "tool-call-performance": mockToolCallPerformance,
  "llm-token-usage": mockLLMTokenUsage,
  "error-breakdown": mockErrorBreakdown,
  "cost-tracking": mockCostTracking,
};

/** Mock: GET /api/views */
export async function fetchViews(): Promise<ViewListItem[]> {
  return mockViewList;
}

/** Mock: GET /api/views/{viewId} */
export async function fetchView(viewId: string): Promise<ViewResponse> {
  const view = viewMap[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  return structuredClone(view);
}

/** Mock: GET /api/views/{viewId}/panels/{panelId} */
export async function fetchPanel(
  viewId: string,
  panelId: string
): Promise<Panel> {
  const view = viewMap[viewId];
  if (!view) throw new Error(`View not found: ${viewId}`);
  const panel = view.panels.find((p) => p.id === panelId);
  if (!panel) throw new Error(`Panel not found: ${viewId}/${panelId}`);
  return structuredClone(panel);
}
