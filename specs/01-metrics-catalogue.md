# AI Agent Fleet metrics catalog — final v2.0

**80 metrics across 9 categories.** This catalog defines every metric an AI Agent SDK must emit for the multi-tenant monitoring system. It is the reviewed and consolidated successor to the v1.0 catalog (93 metrics), incorporating all fixes from the metrics catalog audit: 16 redundant metrics removed, 3 gap metrics added, 13 type corrections applied, 4 cardinality risks mitigated, and every metric rated by implementation priority.

Grounded in OTel GenAI Semantic Conventions v1.40.0, OpenInference span types (LLM, CHAIN, TOOL, RETRIEVER, EMBEDDING, AGENT, RERANKER, GUARDRAIL), and consolidated best practices from LangSmith, Langfuse, Arize Phoenix, and Datadog LLM Observability. All metric names follow OTel naming conventions (`namespace.entity.metric`).

### Priority tiers

Every metric in this catalog carries a priority rating:

| Tier | Meaning | Count |
|------|---------|-------|
| **P0** | Ship-blocking. Required for production launch. Core contract cannot be fulfilled without these. | 17 |
| **P1** | First sprint. High-value metrics that should be implemented immediately after launch. | 23 |
| **P2** | Maturity. Needed for advanced use cases, optimization, and operational excellence. | 27 |
| **P3** | Specialized. Valuable for specific workflows or derivable from other metrics. | 13 |

### Changelog from v1.0

| Change | Detail |
|--------|--------|
| Removed 16 metrics | #12 (redundant with #7), #15 (redundant with #14), #23 (redundant with #19), #38–42 (subsumed by eval.score), #45 (derivable from #46), #49–51 (consolidated into #47), #57–60 (subsumed by eval.score) |
| Added 3 metrics | `gen_ai.stream.disconnect.count` (streaming failure gap), `eval.token.usage` (requirement EV-006 gap), `gen_ai.model.fallback.count` (model routing gap) |
| Fixed 5 Gauge→Histogram | #35, #36, #53, #80, #81 — per-request/per-session values must be Histograms to preserve distribution |
| Fixed `process.pid` cardinality | Replaced unbounded `process.pid` label with `gen_ai.agent.id` (already in the exception list) on process metrics |
| Fixed `api.endpoint` cardinality | Replaced unbounded URL-path label with bounded `api.operation` on metering metric |
| Namespace alignment | Renamed `llm.token.usage` → `gen_ai.token.usage` to match OTel `gen_ai.*` namespace |
| Consolidated guardrail violations | Merged PII/jailbreak/content-filter detail labels into single `guardrail.violation.count` |
| Merged loop detectors | Combined `agent.loop.detected.count` and `agent.max_iterations.exceeded.count` into one metric with `detection.type` label |
| Extended `agent.invocation.count` | Added `max_iterations_exceeded` to `agent.task.status` label values, absorbing the removed `agent.task.completion.count` |
| All metrics renumbered | Sequential 1–80 |

---

## The dimensional envelope

### Common label set (attached to every metric)

| Label | Type | Cardinality | Description |
|---|---|---|---|
| `tenant.id` | string | Low–Medium (bounded by tenant count) | Workspace / tenant identifier. Multi-tenant isolation, usage metering, cost attribution. |
| `service.name` | string | Very Low (1–5) | Agent service name. Fleet identification. |
| `service.version` | string | Low (2–5 active) | Codebase version. Version-transition detection, fleet-wide baselines partitioned by version. |
| `deployment.environment` | string | Very Low (2–4) | `production` / `staging` / `canary`. Environment segmentation. |
| `gen_ai.agent.name` | string | Low (10–50) | Agent type name (not instance). Per-agent dashboards, peer-group comparison. |
| `gen_ai.provider.name` | string | Very Low (3–10) | LLM provider (`openai`, `anthropic`, `aws.bedrock`). Provider-level cost/latency. |
| `gen_ai.request.model` | string | Low (10–30) | Requested model (`gpt-4o`, `claude-sonnet-4-20250514`). Model-level baselines, cost attribution. |
| `gen_ai.response.model` | string | Low (10–30) | Actual model that served the response. Drift detection when providers swap models. |
| `gen_ai.operation.name` | string | Very Low (5–7 fixed) | `chat` / `embeddings` / `invoke_agent` / `execute_tool` / `retrieval` / `evaluate`. Operation-type filtering. |

These labels are not repeated in individual metric tables below.

### Labels excluded from the metric envelope (trace-only)

These attributes MUST NOT appear as metric labels on high-volume instruments. They are available via exemplar links for drill-down from metric anomalies to traces.

| Attribute | Scope | Cardinality risk |
|---|---|---|
| `gen_ai.agent.id` | Trace/span + exemplar | **Unbounded.** Grows with every agent instance. 100 tenants × 50 agents = 5,000× series multiplier. |
| `trace_id`, `span_id` | Exemplar only | Unbounded. Carried as exemplar metadata on histogram observations. |
| `session.id`, `conversation.id` | Trace/span only | Unbounded. Per-session; would explode series on any counter or histogram. |
| `process.pid` | Trace/span only | Unbounded. Equivalent to `gen_ai.agent.id` in containerized environments. Use `gen_ai.agent.id` as the canonical instance identifier. |

**Exception — instance-identity gauges.** Four gauge metrics MAY carry `gen_ai.agent.id` because they are meaningless without instance granularity. These MUST be governed by a dedicated `max_global_series_per_metric` limit in Mimir (recommended: 50,000):

- `agent.active.count` (#15)
- `process.memory.usage` (#76)
- `process.cpu.utilization` (#77)
- `agent.concurrent.invocations` (#80)

### Cardinality notes on additional labels

**`server.address`** (metrics #1, #3–6, #73–75): Very low cardinality (3–15) when connecting to SaaS LLM provider endpoints. If agents connect to per-tenant or dynamically provisioned model endpoints, normalize via distributor relabeling rules before ingestion.

**`rag.index.name`** (metrics #23, #26, #27, #29, #35): If tenants create per-workspace vector indexes, this label grows as `tenant_count × indexes_per_tenant`. At scale (1,000+ tenants), normalize to `rag.index.type` (`knowledge_base` / `documents` / `code`) with bounded cardinality and keep full index names as span attributes only.

**`agent.source.name` × `agent.target.name`** (metric #14): Creates N² combinations across agent types. With 20 agent types, that's up to 400 values per tenant. Set a per-metric `max_global_series_per_metric` guard. Review if agent type count exceeds ~30.

---

## 1. Core LLM interaction metrics

Six metrics covering model invocation latency, token consumption, streaming performance, and streaming failure detection. The first two are the highest-priority instruments — `gen_ai.client.operation.duration` is the only metric the OTel spec marks as Required. Maps to the OpenInference `LLM` span type.

| # | Metric name | Type | Unit | Pri | Description | Bucket boundaries | Additional labels |
|---|---|---|---|---|---|---|---|
| 1 | `gen_ai.client.operation.duration` | Histogram | `s` | **P0** | End-to-end duration of any GenAI client operation. **Required by OTel spec.** | `[0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92]` | `error.type`, `server.address`, `server.port` |
| 2 | `gen_ai.client.token.usage` | Histogram | `{token}` | **P0** | Input or output tokens per operation. Reports billable tokens when available. | `[1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864]` | `gen_ai.token.type` (input/output), `error.type` |
| 3 | `gen_ai.server.request.duration` | Histogram | `s` | **P3** | Server-side request duration. Emit only for self-hosted models. | Same as #1 | `error.type`, `server.address` |
| 4 | `gen_ai.server.time_to_first_token` | Histogram | `s` | **P2** | Time to first token for streaming responses. Queue + prefill latency. | `[0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0]` | `server.address` |
| 5 | `gen_ai.server.time_per_output_token` | Histogram | `s` | **P3** | Inter-token latency. `(total_duration − TTFT) / (output_tokens − 1)`. | `[0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 2.5]` | `server.address` |
| 6 | `gen_ai.stream.disconnect.count` | Counter | `{disconnect}` | **P2** | **NEW.** Streaming failures — dropped connections mid-stream, incomplete responses. Invisible in duration histograms alone (short duration ≠ fast response). | — | `gen_ai.provider.name`, `gen_ai.request.model`, `disconnect.reason` (client_abort/server_error/timeout) |

**Key OTel span attributes that feed these metrics:** `gen_ai.response.finish_reasons`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`.

---

## 2. Agent execution and workflow metrics

Eleven metrics capturing multi-step reasoning, branching, loop detection, retries, and completion. Maps to the OpenInference `AGENT` and `CHAIN` span types and OTel's `invoke_agent` operation. Step count and LLM call count per invocation are the strongest signals for version-transition anomaly detection (AD-017) and loop detection (AD-005).

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 7 | `agent.invocation.duration` | Histogram | `s` | **P0** | Full wall-clock duration from user input to final output, including all child calls. | `agent.task.type`, `agent.task.status` (success/failure/timeout/partial/max_iterations_exceeded) |
| 8 | `agent.invocation.count` | Counter | `{invocation}` | **P0** | Total agent invocations. Primary volume metric for per-workspace baselines (AD-008). Status label now includes `max_iterations_exceeded`, absorbing the removed `agent.task.completion.count`. | `agent.task.status` (success/failure/timeout/partial/max_iterations_exceeded) |
| 9 | `agent.step.count` | Histogram | `{step}` | **P0** | Reasoning/execution steps per invocation. One step = one agent loop iteration (think → act → observe). | `agent.task.type` |
| 10 | `agent.llm_call.count` | Histogram | `{call}` | **P1** | LLM calls within a single invocation. Cost ≈ `llm_calls × avg_tokens × price`. | — |
| 11 | `agent.planning.iteration.count` | Histogram | `{iteration}` | **P3** | Planning/re-planning phases before execution. Only for plan-then-execute architectures. | — |
| 12 | `agent.planning.duration` | Histogram | `s` | **P3** | Time in planning/reasoning (excludes tool execution). | — |
| 13 | `agent.retry.count` | Counter | `{retry}` | **P1** | Retries within agent workflows. Retry storms indicate cascading failures. | `agent.retry.reason` (tool_failure/validation_error/timeout/rate_limit/guardrail_reask) |
| 14 | `agent.loop.detected.count` | Counter | `{detection}` | **P1** | Stuck/looping agent detections. Consolidated: includes both loop-signature detection and max-iterations-exceeded events. Directly implements AD-005. | `detection.type` (loop_signature/max_iterations) |
| 15 | `agent.active.count` | Gauge | `{agent}` | **P1** | Currently executing agent instances. Required for UM-001 "active agent count". **May carry `gen_ai.agent.id`** (instance-identity exception). | — |
| 16 | `agent.handoff.count` | Counter | `{handoff}` | **P3** | Handoffs in multi-agent orchestration. **⚠ N² cardinality** — see notes above. | `agent.source.name`, `agent.target.name` |
| 17 | `agent.error.count` | Counter | `{error}` | **P0** | Agent errors by failure stage. Primary error-rate signal for alerting and AD-006. | `error.type`, `agent.error.stage` (planning/tool_call/generation/guardrail) |

---

## 3. Tool call metrics

Five metrics for tool invocation volume, latency, errors, token overhead, and per-invocation distribution. Maps to the OpenInference `TOOL` span type and OTel's `execute_tool` operation.

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 18 | `tool.call.count` | Counter | `{call}` | **P0** | Total tool invocations. Referenced in the write-path diagram. | `gen_ai.tool.name`, `gen_ai.tool.type` (function/extension/datastore), `tool.call.status` (success/error/vetoed) |
| 19 | `tool.call.duration` | Histogram | `s` | **P0** | Duration of individual tool executions. Tool latency is the most common source of agent slowness. | `gen_ai.tool.name`, `gen_ai.tool.type`, `error.type` |
| 20 | `tool.call.error.count` | Counter | `{error}` | **P1** | Tool errors by tool name and error class. Failures trigger agent retries. | `gen_ai.tool.name`, `error.type` (timeout/rate_limit/validation/auth/server_error) |
| 21 | `tool.call.token.usage` | Histogram | `{token}` | **P2** | Tokens consumed by function-calling serialization in the prompt. | `gen_ai.tool.name`, `gen_ai.token.type` |
| 22 | `tool.call.per_invocation` | Histogram | `{call}` | **P2** | Tool calls per agent invocation. Cost modeling and step-efficiency analysis. | — |

---

## 4. RAG pipeline metrics

Thirteen operational metrics covering the full RAG pipeline: embedding generation, vector search, reranking, context assembly, and retrieval errors. Maps to OpenInference `RETRIEVER`, `EMBEDDING`, and `RERANKER` span types. RAG quality evaluation scores (faithfulness, relevance, precision, recall) are handled via the generic `eval.score` metric (#42) using standard `eval.name` values — see Category 6.

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 23 | `rag.retrieval.duration` | Histogram | `s` | **P1** | End-to-end retrieval latency (embedding + vector search + optional rerank). Primary RAG health signal. | `rag.retrieval.strategy` (dense/sparse/hybrid), `rag.index.name` |
| 24 | `rag.embedding.duration` | Histogram | `s` | **P2** | Query embedding generation time. | `gen_ai.request.model`, `gen_ai.provider.name` |
| 25 | `rag.embedding.token.usage` | Histogram | `{token}` | **P2** | Tokens consumed by embedding generation. | `gen_ai.request.model` |
| 26 | `rag.vector_search.duration` | Histogram | `s` | **P1** | Vector similarity search latency. Most variable RAG component. | `rag.index.name`, `db.system` (pinecone/weaviate/pgvector/qdrant/chroma) |
| 27 | `rag.vector_search.score` | Histogram | `{score}` | **P2** | Distribution of similarity scores. Retrieval quality drift detection. | `rag.index.name` |
| 28 | `rag.reranker.duration` | Histogram | `s` | **P2** | Cross-encoder reranking latency. | `rag.reranker.model`, `gen_ai.provider.name` |
| 29 | `rag.retrieval.document.count` | Histogram | `{document}` | **P2** | Chunks/documents returned per retrieval query (effective top-K). | `rag.retrieval.strategy`, `rag.index.name` |
| 30 | `rag.reranker.input_document.count` | Histogram | `{document}` | **P3** | Documents fed into the reranker (pre-filter). | `rag.reranker.model` |
| 31 | `rag.reranker.output_document.count` | Histogram | `{document}` | **P3** | Documents retained after reranking (post-filter). | `rag.reranker.model` |
| 32 | `rag.context.token.count` | Histogram | `{token}` | **P1** | Total tokens in assembled RAG context passed to the LLM. Detects context bloat. | `gen_ai.request.model` |
| 33 | `rag.context.window.utilization` | **Histogram** | `ratio` | **P2** | Fraction of model context window consumed by RAG context. **Fixed from Gauge** — Histogram preserves per-request distribution, enabling percentile queries (e.g., "p95 context utilization is 0.87"). | `gen_ai.request.model` |
| 34 | `rag.chunk.utilization` | **Histogram** | `ratio` | **P3** | Fraction of retrieved chunks actually cited/used in the response. Over-retrieval indicator. **Fixed from Gauge.** Hard to compute (requires output→chunk citation tracking). | — |
| 35 | `rag.retrieval.error.count` | Counter | `{error}` | **P1** | Retrieval failures (index unavailable, timeout, embedding failure). Must alert. | `rag.index.name`, `error.type` |

---

## 5. Guardrail execution metrics

Six metrics for guardrail latency budgeting, pass/fail rates, violation categorization, interventions, and guardrail errors. Maps to the OpenInference `GUARDRAIL` span type. The `guardrail.validation.result` counter is the single most important metric — it powers pass/fail rate dashboards and safety anomaly alerting.

Violation sub-counters (PII detection, jailbreak detection, content filter) from v1.0 have been consolidated into the single `guardrail.violation.count` metric with conditional detail labels, eliminating double-counting.

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 36 | `guardrail.execution.duration` | Histogram | `s` | **P1** | Total guardrail processing latency. Target: <100ms. | `guardrail.name`, `guardrail.type` (input/output), `guardrail.stage` (pre_llm/post_llm) |
| 37 | `guardrail.validator.duration` | Histogram | `s` | **P2** | Individual validator latency within a guardrail chain. | `guardrail.validator.name`, `guardrail.validator.type` (rule_based/llm_judge/ml_classifier/regex) |
| 38 | `guardrail.validation.result` | Counter | `{validation}` | **P0** | Validations by outcome. Denominator for pass/fail rate. Total invocations = `sum(rate(...))` — no separate invocation counter needed. | `guardrail.name`, `guardrail.result` (pass/fail/warn), `guardrail.type` |
| 39 | `guardrail.violation.count` | Counter | `{violation}` | **P1** | Unified violation counter. Detail labels are conditional — populated only when relevant to the violation type. | `guardrail.name`, `guardrail.violation.type` (toxicity/pii/jailbreak/off_topic/hallucination/bias/profanity/copyright), `guardrail.pii.entity_type`¹, `guardrail.detection.method`², `guardrail.filter.category`³ |
| 40 | `guardrail.intervention.count` | Counter | `{intervention}` | **P1** | Content blocked, modified, or flagged. Impact on user experience. | `guardrail.name`, `guardrail.action` (block/modify/flag/reask/escalate) |
| 41 | `guardrail.error.count` | Counter | `{error}` | **P1** | Guardrail execution failures. A failing guardrail is a safety risk. | `guardrail.name`, `error.type` |

¹ `guardrail.pii.entity_type` (email/phone/ssn/name/address/credit_card): populated only when `guardrail.violation.type=pii`.
² `guardrail.detection.method`: populated only when `guardrail.violation.type=jailbreak`.
³ `guardrail.filter.category` (hate/violence/sexual/self_harm/dangerous): populated only when `guardrail.violation.type=content_filter`.

Sparse labels do not create additional series in Mimir — an empty label value is stored as `""` and does not multiply cardinality.

---

## 6. Evaluation and quality metrics

Five metrics covering evaluation score distribution, execution health, and eval-specific token consumption. Maps to the OpenInference `EVALUATOR` span type. The generic `eval.score` histogram is the single carrier for all quality signals — RAG evaluation scores and agent evaluation scores are expressed as standard `eval.name` values rather than dedicated metrics.

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 42 | `eval.score` | **Histogram** | `{score}` | **P1** | Generic evaluation score emitted by any evaluator. **Fixed from Gauge** — Histogram preserves per-evaluation distribution, enabling queries like "what % of evaluations scored above 0.8" and percentile trending for version-regression detection. | `eval.name`, `eval.method` (llm_judge/human/heuristic/code), `eval.score.label` (pass/fail/good/bad) |
| 43 | `eval.execution.duration` | Histogram | `s` | **P2** | Latency of an individual evaluation run. | `eval.name`, `eval.method` |
| 44 | `eval.execution.count` | Counter | `{evaluation}` | **P2** | Evaluations executed. Throughput tracking for eval pipeline capacity. | `eval.name`, `eval.method`, `eval.result` (pass/fail) |
| 45 | `eval.execution.error.count` | Counter | `{error}` | **P2** | Evaluation failures (LLM judge timeout, parsing error). | `eval.name`, `error.type` |
| 46 | `eval.token.usage` | Counter | `{token}` | **P1** | **NEW.** Tokens consumed by LLM-as-judge evaluations. Required by EV-006: evaluator token consumption must be metered separately from agent token consumption. | `eval.name`, `eval.method`, `gen_ai.request.model` |

### Standard `eval.name` values

The following `eval.name` values are standardized. Teams may add custom evaluation names beyond this set.

**RAG quality evaluations** (RAGAS-aligned): `faithfulness` (hallucination detection), `answer_relevancy` (response pertinence), `context_precision` (ranking quality of retrieved chunks), `context_recall` (coverage completeness), `context_relevancy` (noise sensitivity).

**Agent behavioral evaluations**: `task_completion` (goal accomplishment), `tool_correctness` (correct tool with correct arguments), `path_convergence` (Arize-defined; `optimal_path / actual_path`), `groundedness` (output alignment with sources and tool outputs).

**General quality evaluations**: `relevance`, `correctness`, `toxicity`, `helpfulness`, `coherence`.

---

## 7. Cost attribution and usage metering metrics

Fifteen metrics split across two write paths: operational cost tracking (standard metrics pipeline, best-effort delivery) and billing-grade usage metering (dedicated Kafka topic with `acks=all`, idempotent producers, `min.insync.replicas=2`, replication factor 3).

### Operational cost tracking (standard write path)

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 47 | `gen_ai.token.usage` | Counter | `{token}` | **P0** | Monotonic token counter. Complements the OTel histogram #2. Counters support `rate()` and `increase()` cleanly for metering. **Renamed from `llm.token.usage`** to align with OTel `gen_ai.*` namespace. | `gen_ai.token.type` (input/output), `gen_ai.request.model`, `gen_ai.provider.name` |
| 48 | `gen_ai.token.usage.cached` | Counter | `{token}` | **P2** | Tokens served from or written to provider-side prompt caching. | `gen_ai.token.cache_type` (cache_read/cache_creation), `gen_ai.request.model` |
| 49 | `gen_ai.cost.total` | Counter | `USD` | **P0** | Cumulative cost. `(input_tokens × model_input_price) + (output_tokens × model_output_price)` per call. | `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.operation.name` |
| 50 | `agent.invocation.cost` | Histogram | `USD` | **P1** | Total cost per agent invocation (aggregates all child LLM calls, tool calls, embeddings, reranking). | `gen_ai.agent.name` |
| 51 | `rag.embedding.cost` | Counter | `USD` | **P2** | Embedding generation API call cost. | `gen_ai.request.model` |
| 52 | `rag.reranker.cost` | Counter | `USD` | **P3** | Reranker API call cost. | `rag.reranker.model` |
| 53 | `gen_ai.model.fallback.count` | Counter | `{fallback}` | **P2** | **NEW.** Model fallback events — when primary model fails and agent routes to a secondary model. Critical for cost analysis (fallback models often more expensive) and reliability dashboards. | `gen_ai.request.model` (original), `gen_ai.fallback.model` (actual), `fallback.reason` (rate_limit/error/timeout) |

### Billing-grade usage metering (dedicated write path)

These metrics are emitted to a separate Kafka topic with stronger durability guarantees (`acks=all`, idempotent producers, replication factor ≥3). They intentionally mirror operational twins (#15, #47) — this is architectural separation of concerns per AWS SaaS Architecture Fundamentals: losing a billing event is a revenue leak, while losing an operational metric is a monitoring gap. Implementers MUST NOT deduplicate these with their operational counterparts.

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 54 | `metering.traces.ingested` | Counter | `{trace}` | **P0** | Traces ingested per tenant. UM-001 required dimension. | `tenant.id` |
| 55 | `metering.spans.per_trace` | Histogram | `{span}` | **P1** | Spans per trace. Complexity-based pricing input. UM-001. | `tenant.id` |
| 56 | `metering.log.volume` | Counter | `By` | **P0** | Log bytes ingested per tenant. UM-001. | `tenant.id` |
| 57 | `metering.metric.series` | Gauge | `{series}` | **P0** | Active metric series per tenant. UM-001. Critical for Mimir cardinality budget enforcement. | `tenant.id` |
| 58 | `metering.storage.consumed` | Gauge | `By` | **P1** | Storage consumed per tenant by tier. UM-001. | `tenant.id` |
| 59 | `metering.api_call.count` | Counter | `{call}` | **P1** | Platform API calls per tenant. UM-001. **`api.operation`** uses a bounded set of operation names (e.g., `ingest_traces`, `query_metrics`, `list_agents`), not raw URL paths. | `tenant.id`, `api.operation` |
| 60 | `metering.llm_tokens.consumed` | Counter | `{token}` | **P0** | LLM tokens consumed per tenant. UM-001. Billing-path mirror of #47. | `tenant.id`, `gen_ai.token.type` |
| 61 | `metering.agent.active.count` | Gauge | `{agent}` | **P1** | Active agents per tenant. UM-001. Billing-path mirror of #15. | `tenant.id` |

---

## 8. Session and conversation metrics

Seven metrics for session volume, duration, token/cost per session, context pressure, and user satisfaction. Mapped via `gen_ai.conversation.id` (OTel) and `session.id` (OpenInference). Session metrics power user experience dashboards and conversation-level anomaly detection.

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 62 | `session.count` | Counter | `{session}` | **P1** | Sessions initiated. Primary traffic volume metric. | `gen_ai.agent.name`, `session.outcome` (completed/abandoned/escalated) |
| 63 | `session.duration` | Histogram | `s` | **P2** | Wall-clock duration from first message to last response. | `gen_ai.agent.name`, `session.outcome` |
| 64 | `session.turn.count` | Histogram | `{turn}` | **P2** | User↔agent turns per session. Session complexity metric. | `gen_ai.agent.name`, `session.outcome` |
| 65 | `session.token.total` | Histogram | `{token}` | **P2** | Total tokens consumed across a session. Per-session cost analysis. | `gen_ai.agent.name` |
| 66 | `session.cost.total` | Histogram | `USD` | **P2** | Total cost across a session. | `gen_ai.agent.name` |
| 67 | `session.context_window.peak_utilization` | **Histogram** | `ratio` | **P3** | Peak context window utilization reached during a session. **Fixed from Gauge** — Histogram enables "what % of sessions exceeded 90% context" queries. | `gen_ai.request.model` |
| 68 | `session.eval.user_satisfaction` | **Histogram** | `{score}` | **P2** | User satisfaction score (explicit thumbs-up/down or inferred). **Fixed from Gauge.** Requires explicit feedback mechanism. | `gen_ai.agent.name`, `feedback.type` (explicit/inferred) |

---

## 9. Infrastructure and runtime metrics

Twelve metrics for LLM provider health, rate limiting, connection pools, agent process resources, and async queue management. Critical for alerting (rate limit exhaustion, queue saturation) and correlating agent performance with infrastructure bottlenecks.

### Rate limiting and provider health

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 69 | `gen_ai.api.error.count` | Counter | `{error}` | **P0** | LLM provider API errors. Must alert on spikes. | `gen_ai.provider.name`, `gen_ai.request.model`, `error.type` (rate_limit/timeout/server_error/auth/bad_request) |
| 70 | `gen_ai.rate_limit.hit.count` | Counter | `{hit}` | **P0** | HTTP 429 responses from providers. #1 cause of agent degradation. | `gen_ai.provider.name`, `gen_ai.request.model` |
| 71 | `gen_ai.rate_limit.retry.duration` | Histogram | `s` | **P2** | Backoff wait time due to rate limiting. | `gen_ai.provider.name` |
| 72 | `gen_ai.rate_limit.remaining` | Gauge | `{request}` | **P1** | Remaining requests in current rate-limit window (from provider response headers). Proactive alerting before exhaustion. | `gen_ai.provider.name`, `rate_limit.type` (rpm/tpm) |

### Connection pool and networking

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 73 | `http.client.connection_pool.size` | Gauge | `{connection}` | **P3** | Total connections in pool for LLM API calls. | `server.address`, `gen_ai.provider.name` |
| 74 | `http.client.connection_pool.active` | Gauge | `{connection}` | **P3** | Currently active connections. | `server.address` |
| 75 | `http.client.connection_pool.wait_duration` | Histogram | `s` | **P3** | Time waiting for an available connection. | `server.address` |

### Agent process resources

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 76 | `process.memory.usage` | Gauge | `By` | **P2** | Resident memory of the agent process (OTel process semantic conventions). **Fixed:** Uses `gen_ai.agent.id` as instance identifier (exception list), replacing unbounded `process.pid`. | `gen_ai.agent.id` |
| 77 | `process.cpu.utilization` | Gauge | `ratio` | **P2** | CPU utilization of the agent process. **Fixed:** Same as #76. | `gen_ai.agent.id` |

### Async queue and concurrency

| # | Metric name | Type | Unit | Pri | Description | Labels |
|---|---|---|---|---|---|---|
| 78 | `agent.queue.depth` | Gauge | `{task}` | **P1** | Pending tasks in async agent task queue. Primary alerting signal for capacity. | `queue.name` |
| 79 | `agent.queue.wait_duration` | Histogram | `s` | **P2** | Time a task waits before execution. Capacity bottleneck indicator. | `queue.name` |
| 80 | `agent.concurrent.invocations` | Gauge | `{invocation}` | **P2** | Currently executing invocations. Capacity planning and auto-scaling. **May carry `gen_ai.agent.id`** (exception list). | `gen_ai.agent.name` |

---

## How these metrics map to the stated use cases

**Anomaly detection** (AD-001 through AD-020): Metrics #1, #2, #7–10, #17, #47 are the primary signals. `service.version` partitions baselines by codebase version. Histograms provide p50/p90/p99 for baseline construction. `rate()` on #8 and #47 gives per-workspace volume baselines. Step counts (#9, #10) and error rates (#17) detect behavioral regression after deployments.

**Evaluation pipelines** (EV-001 through EV-006): `eval.score` (#42) carries all quality signals as a time-series histogram with standard `eval.name` values for RAG quality (faithfulness, context_precision, etc.) and agent behavior (task_completion, tool_correctness, etc.). `eval.token.usage` (#46) satisfies EV-006 (separate evaluator token metering). Execution metrics #43–45 monitor the eval pipeline's own health.

**Guardrails monitoring** (GR-001 through GR-009): Six metrics provide complete coverage: latency budgeting (#36–37), pass/fail rates (#38), unified violation categorization with conditional detail labels (#39), intervention tracking (#40), and error alerting (#41).

**RAG pipeline monitoring** (RAG-001 through RAG-012): Thirteen metrics cover embedding (#24–25), retrieval (#23, #26–27, #29), reranking (#28, #30–31), context assembly (#32–34), and errors (#35). RAG quality evaluation flows through `eval.score` (#42) with RAGAS-aligned `eval.name` values.

**Usage metering and cost attribution** (UM-001 through UM-009): Eight metering metrics (#54–61) map one-to-one with the stated billing dimensions. All carry `tenant.id` for per-workspace roll-ups. Emitted on the dedicated billing Kafka topic. Operational cost metrics (#47–53) enable real-time cost dashboards.

**Alerting**: Rate limit metrics (#70, #72), error counters (#17, #20, #35, #41, #69), guardrail violation spikes (#39), loop detection (#14), and queue saturation (#78) are the primary alerting signals.

**Self-service dashboards**: Every histogram supports `histogram_quantile()` in Mimir. The dimensional envelope enables drill-down by tenant, agent, model, provider, and version. Session metrics (#62–68) power UX dashboards. Tool metrics (#18–22) enable tool-performance leaderboards.

---

## Implementation guidance for the SDK instrumentation layer

The SDK should emit metrics at well-defined instrumentation points corresponding to OpenInference span types. Each span type maps to a set of metrics:

**On `LLM` span completion:** Emit #1 (duration), #2 (token usage), #47 (token counter), #49 (cost). If streaming, emit #4 (TTFT) on first chunk arrival. If stream disconnects, emit #6.

**On `AGENT` span completion:** Emit #7 (invocation duration), #8 (invocation count), #9 (step count), #10 (LLM call count), #50 (invocation cost). If loop detected during execution, emit #14.

**On `TOOL` span completion:** Emit #18 (call count), #19 (call duration), #20 (error count if failed).

**On `RETRIEVER` span completion:** Emit #23 (retrieval duration), #26 (vector search duration), #27 (score distribution), #29 (document count), #35 (error count if failed).

**On `EMBEDDING` span completion:** Emit #24 (embedding duration), #25 (token usage), #51 (embedding cost).

**On `RERANKER` span completion:** Emit #28 (reranker duration), #30–31 (input/output document counts), #52 (reranker cost).

**On `GUARDRAIL` span completion:** Emit #36 (execution duration), #37 (per-validator duration), #38 (validation result), and the relevant violation/intervention counters (#39–40).

**On `EVALUATOR` span completion:** Emit #42 (eval score), #43 (eval duration), #44 (eval count), #46 (eval token usage).

**On session boundary events:** Emit #62–68 on session close or timeout. The SDK should maintain in-memory session accumulators for turn count, token total, and cost.

**On model fallback:** Emit #53 when the SDK routes to a secondary model after primary model failure.

**Periodically (gauge scrape):** Emit #15 (active agents), #72 (rate limit remaining), #73–74 (connection pool), #76–77 (process resources), #78 (queue depth), #80 (concurrent invocations).

**Metering write path:** Metrics #54–61 are emitted to the billing Kafka topic. The SDK should maintain a separate producer with `acks=all` and `enable.idempotence=true` for these metrics.

All metrics should use **exemplars** linking to trace IDs, which Grafana Mimir supports natively. The SDK should attach `trace_id` and `span_id` as exemplar labels on every histogram observation. This enables jumping from a metric anomaly directly to the causal trace, then from the trace to the specific `gen_ai.agent.id` instance.

---

## Priority summary

| Phase | Tier | Count | Metrics |
|-------|------|-------|---------|
| **Launch** | P0 | 17 | #1, #2, #7, #8, #9, #17, #18, #19, #38, #47, #49, #54, #56, #57, #60, #69, #70 |
| **Sprint 1** | P1 | 23 | #10, #13, #14, #15, #20, #23, #26, #32, #35, #36, #39, #40, #41, #42, #46, #50, #55, #58, #59, #61, #62, #72, #78 |
| **Maturity** | P2 | 27 | #4, #6, #21, #22, #24, #25, #27, #28, #29, #33, #37, #43, #44, #45, #48, #51, #53, #63, #64, #65, #66, #68, #71, #76, #77, #79, #80 |
| **Specialized** | P3 | 13 | #3, #5, #11, #12, #16, #30, #31, #34, #52, #67, #73, #74, #75 |

**Recommended implementation order:** P0 (17 metrics) provides LLM latency/tokens, agent invocations/steps/errors, tool calls, guardrail pass/fail, cost tracking, metering foundations, and provider error alerting — everything needed for production launch. P1 (23 metrics) adds cost-per-invocation, retry/loop detection, RAG pipeline health, guardrail violations, evaluation scores, eval token metering, session volume, and queue alerting. P2 (27 metrics) refines with streaming details, caching, RAG sub-stages, eval pipeline health, session analytics, model fallback tracking, and process resources. P3 (13 metrics) covers planning metrics, reranker details, and connection pools — implement on demand for specific optimization campaigns.
