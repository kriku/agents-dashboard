# Multi-tenant metrics pipeline architecture for AI agent monitoring

**Grafana Mimir paired with Apache Kafka forms the strongest foundation for a multi-tenant metrics pipeline** serving an AI agent monitoring platform with workspace-level isolation. This combination delivers native per-tenant limits that reload in 10 seconds, proven scale to 1 billion active series, and object storage economics for 15-month retention — satisfying every stated non-functional requirement. The architecture draws from production patterns at Grafana Cloud, Datadog, and Chronosphere, adapted for a three-level tenant hierarchy with hot-reloadable resource controls, fleet-wide anomaly detection, and idempotent usage metering.

This report synthesizes current (2024–2026) architecture patterns across eight domains: TSDB selection, ingestion design, query isolation, anomaly detection, storage tiering, cardinality management, usage metering, and reference architectures from production platforms processing trillions of data points daily.

---

## Grafana Mimir is the clear TSDB choice for workspace-level tenancy

After evaluating seven time-series databases across multi-tenancy, scalability, cardinality management, and operational characteristics, **Grafana Mimir emerges as the primary recommendation** with ClickHouse as a complementary analytics store.

Mimir provides **first-class multi-tenancy via the `X-Scope-OrgID` header**, with every component — distributor, ingester, querier, store-gateway, compactor — enforcing tenant isolation. Each workspace maps to a Mimir tenant ID (encoded as `org-{id}__ws-{id}`), creating complete data isolation in both memory and object storage. The runtime configuration system reloads per-tenant overrides every **10 seconds** without restart, covering ingestion rate, burst size, active series caps, query parallelism, fetched series limits, and retention period — precisely the hot-reloadable limits the platform requires.

Mimir has been tested to **1 billion active time series** in a single cluster (3 billion with 3× replication), using 500 distributors, 600 ingesters, and 150 queriers. Its split-and-merge compactor overcomes the 64GB TSDB index ceiling that limits other Prometheus-compatible stores. Query performance runs **up to 40× faster than Cortex** through a sharded query engine with per-tenant parallelism controls.

The comparison against alternatives reveals clear tradeoffs:

| Criterion | Mimir | VictoriaMetrics | ClickHouse | Thanos | M3DB |
|-----------|-------|-----------------|------------|--------|------|
| Native multi-tenancy | ✅ Header-based, first-class | ⚠️ URL path (cluster), 2-level | ❌ App-layer only | ⚠️ Receiver header (basic) | ⚠️ Tag-based, unenforced |
| Per-tenant hot-reloadable limits | ✅ 10s reload, comprehensive | ⚠️ Enterprise only (vmgateway) | ❌ Build externally | ⚠️ Partial | ❌ None |
| Object storage tiering | ✅ S3/GCS/Azure | ❌ Local/NFS only | ✅ Native hot/warm/cold + S3 | ✅ S3/GCS + downsampling | ❌ Local SSD only |
| Horizontal scalability | ✅ 1B series proven | ✅ Excellent | ✅ Petabyte-scale | ✅ Good | ✅ Uber-scale proven |
| Operational complexity | Moderate-high (7 components) | Low-moderate (3 components) | High (must build metrics layer) | High (many components) | Very high (declining community) |

**VictoriaMetrics** offers operational simplicity (3 components vs. Mimir's 7) and exceptional resource efficiency (**10× less RAM** than alternatives), but its critical multi-tenant features — per-tenant rate limiting, cardinality caps, and per-tenant statistics — require an Enterprise license. Its lack of object storage support makes 15-month retention expensive on local/NFS storage. **ClickHouse** excels at storage tiering with native hot/warm/cold TTL rules and handles high cardinality naturally through columnar storage, making it ideal as a **complementary analytics store** for usage metering and complex billing queries rather than the primary metrics backend. **Cortex**, **M3DB**, and standalone **Thanos** should be avoided for new deployments — Cortex is effectively superseded by Mimir, M3DB's community has declined significantly, and Thanos lacks Mimir's per-tenant limit sophistication.

---

## Kafka-backed ingestion with Mimir distributors handles tenant isolation and backpressure

The ingestion pipeline follows Mimir 3.0's **ingest storage architecture**, where Kafka serves as the durable buffer between distributors and ingesters. This decouples the write path from ingester availability — writes complete once Kafka acknowledges, reducing replication factor from 3 to 2 and cutting TCO by approximately **25%** at Grafana Cloud scale.

The end-to-end flow proceeds as follows:

**AI Agent SDKs → OTLP/HTTP → API Gateway → Distributor → Kafka → Ingester → Object Storage**

The **API Gateway** terminates TLS, resolves API keys to workspace IDs, and sets `X-Scope-OrgID` headers. The **Distributor** (stateless, horizontally scalable) performs five critical functions: per-workspace rate limiting with HTTP 429 responses, PII scrubbing via regex-based label value redaction, schema validation against a registry, tenant context propagation through Kafka record headers, and HA deduplication. Rate limiting uses a **local limiter strategy** where each distributor enforces `limit / N` (N = healthy distributor count), automatically adjusting as instances scale via memberlist service discovery.

For the message bus, **Apache Kafka (or Redpanda as a drop-in alternative)** is the definitive choice over Pulsar and NATS. The decisive factor is TSDB integration: Mimir 3.0's entire next-generation architecture is built on Kafka, making it a proven, production-validated pattern. Kafka provides the most mature exactly-once semantics (idempotent producers + transactional APIs), critical for usage metering accuracy. While Apache Pulsar offers superior native multi-tenancy with its built-in tenant→namespace→topic hierarchy, its operational complexity (brokers + BookKeeper + ZooKeeper) and weaker TSDB integration outweigh this advantage. NATS JetStream's excellent simplicity is undermined by a near-absent TSDB connector ecosystem.

**Redpanda** deserves consideration for teams prioritizing operational simplicity — it's a single C++ binary with no JVM or ZooKeeper, built-in schema registry, and Kafka protocol compatibility that works directly with Mimir's ingest storage. Grafana Cloud itself uses **WarpStream** (Kafka-compatible, object-storage-native) to eliminate cross-AZ data transfer costs.

The latency budget for achieving **≤30s p95 ingestion** breaks down comfortably: SDK batching (~2–5s) + distributor validation (~10–50ms) + Kafka produce (~5–10ms) + ingester consumption (~100–500ms) + TSDB write (~10ms) = **~3–6s typical**, well within the target. A separate Kafka topic with `acks=all`, `enable.idempotence=true`, and replication factor ≥3 handles guaranteed delivery for billing events, isolated from the operational metrics path.

---

## Per-workspace query isolation through scheduler queues and shuffle sharding

The query layer follows Mimir's four-component read path: **Query Frontend → Query Scheduler → Querier → (Ingesters + Store Gateways)**. Each component enforces tenant boundaries, with workspace ID extracted from the `X-Scope-OrgID` header on every request.

The **Query Scheduler** maintains per-tenant in-memory queues with configurable depth (default 100 per tenant). Round-robin scheduling across tenant queues prevents any single workspace from monopolizing query resources. When a workspace's queue fills, the scheduler returns **HTTP 429** — explicit load shedding rather than silent degradation. Key per-tenant limits, all hot-reloadable:

- `max_query_parallelism`: caps concurrent sub-queries per workspace (e.g., 200 for premium, 50 for free tier)
- `max_fetched_series_per_query`: prevents cardinality explosions in queries (e.g., 100,000)
- `max_fetched_chunks_per_query` and `max_fetched_chunk_bytes_per_query`: memory guards
- `max_total_query_length`: restricts query time range (e.g., 12,000 hours)
- `max_queriers_per_tenant`: **shuffle sharding** — limits which querier instances serve each tenant, reducing blast radius

Shuffle sharding is particularly important for noisy-neighbor isolation. If workspace A triggers expensive queries, only its assigned subset of queriers is affected. Other workspaces' queries route to different querier instances entirely. Combined with per-tenant result caching (cache keys include tenant ID for complete isolation, backed by Memcached or Redis), this architecture achieves the **≤5s dashboard query** target.

For platforms that additionally use **ClickHouse** as an analytics complement, per-tenant query isolation uses settings profiles and row-level security:

```sql
CREATE SETTINGS PROFILE workspace_standard SETTINGS
    max_execution_time = 60,
    max_memory_usage = 10000000000,
    max_concurrent_queries_for_user = 10;

CREATE ROW POLICY tenant_policy ON metrics
    FOR SELECT USING tenant_id = toUInt32(getSetting('SQL_tenant_id'));
```

ClickHouse quotas provide hourly/daily query budgets per workspace, and the `max_concurrent_queries_for_user` setting directly enforces per-workspace concurrency caps.

---

## Apache Flink powers anomaly detection without touching the ingestion path

The anomaly detection pipeline runs as a **completely isolated consumer** of the metrics Kafka topic, using a separate consumer group. This separation is the critical architectural decision: if the anomaly pipeline slows, crashes, or falls behind, the ingestion path is entirely unaffected. Kafka consumer groups maintain independent offsets — the anomaly consumer simply catches up from its last committed position.

**Apache Flink** is the recommended stream processing framework. Its keyed state model maps directly to the requirement of per-workspace baselines partitioned by codebase version. When you `keyBy(workspaceId, codebaseVersion)`, Flink guarantees all state for that composite key is local to the processing node — no network hops, no cross-contamination. State is backed by RocksDB for production workloads handling thousands of workspaces, with incremental checkpointing to S3 every 1–5 minutes for fault tolerance.

The detection architecture uses **three parallel Flink jobs**:

**Job 1 — Per-workspace baseline detection**, keyed by `(workspaceId, codebaseVersion)`. Each workspace maintains a layered baseline in Flink keyed state: an EWMA (exponentially weighted moving average) for short-term deviation detection, rolling window statistics for contextual analysis, and incremental seasonal decomposition (168 hourly slots for weekly patterns) for pattern-aware detection. Anomalies fire when the current value exceeds `k × σ` from the baseline — similar to Datadog's three-algorithm approach (Basic, Agile, Robust). When a workspace upgrades its codebase version, the composite key changes, initializing a fresh baseline state while the old key TTLs out.

**Job 2 — Fleet-wide version regression detection**, keyed by `codebaseVersion`. This job aggregates metrics across all workspaces running the same version, detecting patterns like "error rate for v2.3.1 is 3σ above its baseline across 40% of workspaces" — a version-level regression that no individual workspace baseline would catch.

**Job 3 — Peer-group comparison**, keyed by `peerGroupId`. Workspaces are grouped by `(codebaseVersion, configProfile, sizeTier)`. The peer-group mapping broadcasts to all Flink instances via the Broadcast State pattern. Within each group, Modified Z-Score (MAD-based, robust to outliers) identifies workspaces deviating from their peers. Output: "Workspace X has 5× the error rate of 47 peers on the same codebase and configuration."

Kafka Streams was considered but rejected for two reasons: cross-partition operations (required for peer-group comparison) are difficult, and maximum parallelism is capped by partition count. Spark Structured Streaming's micro-batch latency and state management limitations (OOM risks with large state) make it less suitable. Custom Go/Rust services work for simple EWMA/z-score but become a maintenance burden as requirements grow to include seasonal decomposition and peer-group analysis. Managed Flink services (AWS Managed Flink, Confluent Cloud) reduce the operational overhead significantly.

---

## Object storage economics make 15-month retention practical at scale

Mimir's storage model is effectively two-tiered: **hot data lives in ingesters** (in-memory + WAL on SSD, covering the most recent ~2 hours), while **all historical data resides in object storage** (S3/GCS/Azure Blob) as immutable 2-hour TSDB blocks that get compacted into larger ranges (2h → 12h → 24h). The store-gateway serves historical queries by lazily loading index headers and downloading only required chunks, with multiple caching layers (Memcached for index, chunks, and metadata) bridging the latency gap.

Per-workspace retention is natively supported via runtime configuration overrides — `compactor_blocks_retention_period: 65w` for 15-month default, adjustable per workspace without restart. The compactor automatically deletes blocks older than each workspace's configured retention period. At S3 Standard pricing (~$0.023/GB/month), with Mimir's compression (approximately **7× reduction**), storing 1TB of raw metrics costs roughly **$3.29/month** in object storage — making multi-year retention economically viable.

For platforms needing explicit hot/warm/cold tiering beyond Mimir's two-tier model, **ClickHouse** provides the most flexible approach with TTL-based data movement across storage volumes — hot NVMe for the last 7 days, warm HDD for 90 days, cold S3 beyond that. This makes ClickHouse particularly attractive for the usage metering store where complex billing queries span long time ranges.

**Thanos** uniquely offers **downsampling** (5-minute and 1-hour resolutions) for older data, achieving up to **99% sample count reduction** for year-old data. However, Mimir deliberately omits downsampling in favor of recording rules, arguing that downsampling's series multiplication (min, max, sum, count, counter per original series) partially offsets storage savings. For this platform, Mimir's approach — full-resolution recent data in object storage with aggressive compaction — is preferable to Thanos's downsampling complexity.

---

## Cardinality management requires defense-in-depth across the pipeline

High-cardinality metrics are the primary operational risk in multi-tenant metrics platforms. A single workspace emitting unbounded label combinations can exhaust ingester memory, degrade query performance for all tenants, and explode storage costs. Mimir addresses this with **per-tenant cardinality caps enforced at multiple pipeline stages**.

At the **distributor**, `max_global_series_per_user` (e.g., 1,000,000) and `max_global_series_per_metric` (e.g., 50,000) reject new series that would exceed workspace limits, returning HTTP 429 with specific error codes. The **ingester** tracks active series per tenant via `cortex_ingester_active_series{user="workspace-id"}` metrics. Custom active series trackers can monitor cardinality by label patterns — for example, tracking series matching `{team="frontend"}` separately from `{team="backend"}` within a workspace. The **overrides-exporter** component exposes all tenant limits as Prometheus metrics, enabling alerts when workspaces approach **80%** of their cardinality budget.

Beyond hard limits, **streaming aggregation at ingestion** reduces cardinality before storage. VictoriaMetrics' vmagent pattern is instructive: relabeling rules drop high-cardinality labels (like `request_id` or `trace_id`), normalize dynamic labels (stripping random suffixes from pod names), and pre-aggregate series across dimensions. Chronosphere's Control Plane demonstrates this as a customer-facing product feature — their streaming aggregation reduced a single HTTP latency metric from **30 million unique series to 150,000** by removing pod-level cardinality.

For cardinality estimation without precise counting overhead, **HyperLogLog** provides ~2% error with only 1.5KB memory per estimate. Last9's dual-mode approach is elegant: use HLL (8 bytes, ~95% cheaper) for routine cardinality tracking, switching to precise counting only when approaching limits. Tier-based cardinality budgets — 100K series for free tier, 1M for professional, 10M for enterprise — align cardinality management with the platform's pricing model.

---

## Usage metering taps the ingestion pipeline with idempotent Kafka processing

The metering pipeline must remain **completely separate** from the operational metrics path to prevent billing failures from affecting monitoring. The recommended architecture uses a **Kafka tap-off pattern**: the distributor emits lightweight billing events (`{workspace_id, sample_count, series_count, timestamp}`) to a dedicated Kafka topic with stronger durability guarantees (`acks=all`, `min.insync.replicas=2`, replication factor 3, idempotent producers).

A metering aggregator service (Flink or a custom Go service) consumes from this topic with exactly-once transactional processing, producing hourly rollups per workspace. These aggregated records land in PostgreSQL with an idempotency key (`hash(workspace_id + event_type + hour)`) enforced via upsert:

```sql
INSERT INTO metering_events (idempotency_key, workspace_id, metric, quantity, period_start)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (idempotency_key) DO NOTHING;
```

This three-layer idempotency — Kafka producer dedup, transactional consumer processing, and database upsert — ensures **billing accuracy** even under retries, crashes, and reprocessing. The **≤1 hour lag** requirement is comfortably met: events flow from distributor to Kafka in milliseconds, and hourly aggregation windows close within minutes of the hour boundary.

A cross-check mechanism scrapes Mimir's native per-tenant metrics (`cortex_distributor_received_samples_total{user="workspace-id"}`) every 5–15 minutes as an independent ground truth. A daily reconciliation job compares metering DB totals against Mimir-derived totals and billing system records, alerting on discrepancies exceeding 1%. For billing integration, **Stripe's Meter Events API** (bolstered by their $1B Metronome acquisition in December 2025) provides idempotent event submission at up to 10,000 events/second with 30-day idempotency key retention.

---

## Production platforms validate this architecture at trillion-point scale

The architecture recommended above draws directly from patterns proven at the largest observability platforms:

**Grafana Cloud** runs Mimir at **1 billion active series** per cluster, using the Kafka-based ingest storage architecture with WarpStream for cross-AZ cost elimination. Their split-and-merge compactor, shuffle sharding, and hot-reloadable runtime configuration are exactly the features this platform needs. The migration from Cortex to Mimir was motivated by combining open-source Cortex with commercial GEM features under a single codebase — validating Mimir's feature completeness.

**Datadog** processes **trillions of data points daily** through their 6th-generation custom Rust engine (Monocle), which uses a shard-per-core shared-nothing architecture with zero inter-node communication — Kafka handles all data distribution, replication, and crash recovery. Their critical architectural insight is **separating index from time-series storage**: tag metadata lives in an inverted index database, while RTDB stores only `(Org, Metric, TagHash) → [(Timestamp, Value)]` tuples. This separation enables independent optimization of each workload. Monocle achieved **60× ingestion throughput improvement** over the previous generation.

**Chronosphere** operates **13+ billion active time series** on modified M3DB, deploying a **separate stack per customer** for maximum isolation. Their Control Plane — streaming aggregation rules that reduce cardinality before storage — validates the importance of cardinality management as a first-class product feature rather than an afterthought.

**New Relic's NRDB** achieves **45–60ms median query response** across 50+ billion events by fanning queries to thousands of parallel workers. Their schemaless approach (no predefined indexes) and unified storage for all telemetry types (metrics, events, logs, traces) demonstrate that massive parallelism at query time can substitute for pre-computed indexes.

The consistent lesson across all platforms: **Kafka as the data backbone, per-tenant limits as a non-negotiable primitive, object storage for long-term economics, and separated read/write paths** for independent scaling. Platforms at the largest scale (Datadog, New Relic) eventually build custom storage engines, but Mimir's proven 1B-series scale provides substantial runway before that investment becomes necessary.

---

## Recommended architecture summary

The complete metrics pipeline architecture for the multi-tenant AI agent monitoring platform:

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Primary TSDB** | Grafana Mimir | Best-in-class multi-tenancy, hot-reloadable limits, 1B series proven, object storage backend |
| **Message bus** | Apache Kafka (or Redpanda/WarpStream) | Native Mimir 3.0 integration, mature exactly-once semantics, ecosystem breadth |
| **Ingestion layer** | Mimir Distributors + OTel Collector | Per-workspace rate limiting, PII scrubbing, schema validation, HTTP 429 backpressure |
| **Query layer** | Mimir Query Frontend + Scheduler | Per-tenant queues, shuffle sharding, hot-reloadable concurrency/complexity limits |
| **Anomaly detection** | Apache Flink (managed) | Keyed state for per-workspace baselines, composite key for version partitioning, Broadcast State for peer groups |
| **Long-term storage** | S3/GCS with Mimir Store-Gateway | Cost-effective 15-month retention at ~$0.023/GB/month, per-tenant retention policies |
| **Cardinality management** | Mimir per-tenant limits + streaming aggregation | Active series caps, relabeling rules, HLL estimation, tier-based budgets |
| **Usage metering** | Kafka tap-off → PostgreSQL → Stripe | Idempotent event processing, ≤1hr lag, triple-layer dedup, daily reconciliation |
| **Analytics complement** | ClickHouse (optional) | Complex billing queries, SQL analytics, native hot/warm/cold tiering |

## Conclusion

Three architectural decisions matter most for this platform. First, **mapping each workspace to a Mimir tenant ID** unlocks the entire ecosystem of per-tenant limits, caching, shuffle sharding, and retention policies — without building custom isolation logic. Second, **Kafka as the central data backbone** (following both Grafana Cloud and Datadog's pattern) decouples writes from reads, provides crash recovery, enables fan-out to anomaly detection without ingestion impact, and supplies the durability guarantees that usage metering requires. Third, **treating cardinality management as a product feature** — with tier-based budgets, streaming aggregation, self-service cardinality explorers, and proactive alerts — prevents the single most common failure mode in multi-tenant metrics platforms.

The Mimir-centric architecture can scale from initial deployment through hundreds of millions of active series before requiring custom storage engineering. The three-level tenant hierarchy (Org → Workspace → Project) maps to Mimir's flat tenant ID via encoding (`org-X__ws-Y`) with project-level separation via metric labels, while Kafka topic partitioning by workspace ID ensures message ordering and balanced load distribution. Every per-workspace limit — rate limits, cardinality caps, query concurrency, retention periods — reloads within 10 seconds via runtime configuration, satisfying the hot-reloadable requirement without service restarts or deployment cycles.