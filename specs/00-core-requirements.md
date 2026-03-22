# Core Requirements: AI Agent Analytics Dashboard

**Version:** 1.0  
**Date:** 2026-03-22  
**Status:** Phase 1 Scope  
**Derived from:** Functional Requirements v5.2 (full product vision)  
**Scope:** The subset of requirements that directly address the assignment: a high-level system design and production implementation of a customer-facing organizational-level analytics dashboard for cloud-hosted AI agents.

---

## Scope rationale

The assignment asks for five things: a high-level system design, a customer-facing dashboard, a decision on which metrics matter, authentication considered in the design, and a vibe-coded implementation. This document extracts the ~40 requirements from the full v5.2 specification that directly serve those deliverables, organized by the assignment's own structure. Requirements retain their original IDs for traceability to the full specification.

Requirements not included here (LLM evaluation pipelines, guardrails monitoring, RAG observability, prompt management, human-in-the-loop workflows, session tracking, NIST/SOC 2/ISO 27001 security hardening, build-time code generation, AI governance) represent the full product vision documented in v5.2 and are designated Phase 2+.

---

## 1. Tenant model

The assignment specifies "organizational-level analytics." This requires defining what an organization is and how data is isolated between customers.

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-001 | The system shall implement a three-level tenant hierarchy: **Organization** (billing and identity boundary), **Workspace** (trust and data isolation boundary), and **Project** (logical grouping within a workspace). | Must |
| MT-002 | All observability data (logs, metrics, traces) shall be logically isolated at the workspace level so that no workspace can access another workspace's data, including workspaces within the same organization. | Must |
| MT-003 | Organizations shall serve as the top-level entity for billing, user management, identity provider configuration, and subscription tier enforcement. | Must |
| MT-004 | Workspaces shall serve as independent trust boundaries with their own API keys, data retention settings, and resource quotas. | Must |
| MT-008 | Each workspace shall have a self-service dashboard to view, search, and filter its own logs, metrics, and traces without platform-owner involvement. | Must |
| MT-011 | Workspace context shall be derived from authenticated credentials (JWT claims or API key lookup) at the API gateway layer and propagated immutably through all downstream services. Client-supplied workspace identifiers shall never be trusted for authorization decisions. | Must |

---

## 2. Authentication and access control

The assignment explicitly states: "Make sure to consider aspects such as authentication in the system design."

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-009 | The system shall support workspace-scoped API keys for programmatic access, bound by RBAC policies and independently manageable per workspace. | Must |
| MT-014 | The system shall enforce role-based access control (RBAC) at each level of the tenant hierarchy: Organization-level roles, Workspace-level roles, and optionally Project-level roles. | Must |
| MT-015 | The system shall support at minimum: **Admin** (full management), **Operator** (configuration and operational access), and **Viewer** (read-only) roles per hierarchy level. | Must |
| MT-019 | Users shall be able to belong to multiple workspaces within the same organization with different roles per workspace. | Must |
| MT-022 | The system shall support per-organization SSO configuration via SAML 2.0 and OpenID Connect (OIDC), allowing each organization to connect its own identity provider. | Must |
| MT-030 | The system shall require multi-factor authentication (MFA) for all accounts, with phishing-resistant methods (FIDO2/WebAuthn) required for Admin roles. | Must |

---

## 3. Metrics and dashboard views

The assignment states: "You decide what metrics are important and should be shown in the dashboard." These requirements define the five core dashboard views and the underlying metric dimensions.

### 3.1 Dashboard structure

| ID | Requirement | Priority |
|----|-------------|----------|
| DS-008 | The system shall provide pre-built dashboard views optimized for common AI agent observability: **agent execution overview**, **tool-call performance**, **LLM token usage**, **error breakdown**, and **cost tracking**. | Must |
| DS-001 | The dashboard shall provide a natural-language query interface allowing workspace users to explore their observability data in plain English. | Should |
| DS-004 | The system shall enforce workspace-scoped data access on all queries — queries shall automatically include workspace isolation filters regardless of user input. | Must |

### 3.2 Agent execution overview

Metrics displayed: active agent count (gauge), invocation rate by agent (time series), error rate (time series), execution latency p95 by agent (time series), errors by type (bar), steps-per-execution distribution (heatmap). Default refresh: 30 seconds.

### 3.3 Tool-call performance

Metrics displayed: per-tool latency at p50/p95/p99 (time series), tool error rates (time series), tool call frequency (bar), retry rate by tool (bar), slowest tools table. Default refresh: 30 seconds.

### 3.4 LLM token usage

Metrics displayed: total tokens consumed (stat), tokens by model over time (time series), prompt vs. completion token split (time series), token rate (time series), estimated cost by model (bar), top token consumers table. Default refresh: 60 seconds.

### 3.5 Error breakdown

Metrics displayed: total error count (stat), error rate trend (time series), errors by type (bar), errors by agent (bar), errors by codebase version (bar), top error messages table. Default refresh: 30 seconds.

### 3.6 Cost tracking

Metrics displayed: estimated daily cost (stat), cost trend over time (time series), cost by agent (bar), cost by model (bar), cost per invocation trend (time series), projected monthly cost (stat). Default refresh: 300 seconds.

---

## 4. Data ingestion and schema

The system design requires a data pipeline from agent SDKs to queryable storage.

| ID | Requirement | Priority |
|----|-------------|----------|
| SR-001 | The system shall provide a centralized schema registry that stores and versions all event, log, and metric schemas emitted by the common agent codebase. | Must |
| SR-002 | Every schema change shall be versioned with an immutable history, supporting rollback to any prior version. | Must |
| DP-001 | The system shall automatically detect and scrub secrets (API keys, tokens, passwords) from all ingested data before persistence. | Must |
| DP-005 | Scrubbing shall occur at the ingestion layer, ensuring no unscrubbed data reaches storage or indexing. | Must |
| DP-006 | The system shall scrub LLM prompt and completion content from agent traces when configured by the workspace, preserving only metadata (model name, token count, latency). | Must |

---

## 5. Resource governance and tenant isolation

Production-plausible design requires per-tenant resource controls and noisy-neighbor protection.

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-001 | The system shall enforce configurable per-workspace ingestion rate limits (events/second, bytes/second) with burst allowance. When limits are exceeded, the system shall apply backpressure (HTTP 429) without dropping data from other workspaces. | Must |
| RG-005 | The system shall enforce per-workspace query concurrency limits, capping simultaneous queries to prevent monopolization of query resources. | Must |
| RG-013 | Resource limits shall follow a three-layer inheritance model: platform-wide defaults → subscription-tier defaults → per-workspace overrides. | Must |
| RG-014 | Resource limit changes shall be hot-reloadable without system restarts, propagating within 60 seconds. | Should |

---

## 6. Alerting

Basic alerting is essential for a monitoring dashboard to be useful.

| ID | Requirement | Priority |
|----|-------------|----------|
| AL-001 | The system shall support per-workspace alert rules that trigger when agents fail, crash, or become unreachable. | Must |
| AL-002 | The system shall provide cost and budget alerting per workspace, notifying when ingestion volume, storage, or LLM token usage approaches configurable thresholds. | Must |
| AL-005 | Each alert shall include contextual metadata: organization ID, workspace ID, agent ID, timestamp, triggering condition, and a deep link to the relevant trace or log. | Must |
| AL-006 | Alert thresholds shall be configurable per workspace, allowing workspace admins to set their own sensitivity levels. | Must |

---

## 7. Usage metering and organizational analytics

The assignment asks for "organizational-level analytics." This requires metering and aggregation across workspaces.

| ID | Requirement | Priority |
|----|-------------|----------|
| UM-001 | The system shall meter per workspace: traces ingested, log volume, metric series count, storage consumed, API calls, LLM tokens consumed, and active agent count. | Must |
| UM-003 | Usage shall be aggregated into daily and monthly summaries per workspace, available via API and dashboard, with no more than 1-hour lag. | Must |
| UM-004 | Organization Admins shall have a usage dashboard showing aggregated consumption across all workspaces within the organization, with drill-down to individual workspace usage. | Must |
| UM-007 | The system shall provide estimated real-time usage projections, showing projected monthly cost based on current consumption trends. | Should |

---

## 8. Data retention

| ID | Requirement | Priority |
|----|-------------|----------|
| DR-001 | The system shall enforce configurable data retention policies per workspace and per data type (logs, metrics, traces), with platform-defined defaults and workspace-configurable overrides within permitted bounds. | Must |
| DR-002 | The system shall implement tiered storage (hot, warm, cold) with automatic data migration based on age and workspace configuration. | Must |

---

## 9. Non-functional requirements

| ID | Requirement | Category | Target |
|----|-------------|----------|--------|
| NFR-001 | Ingestion pipeline latency from receipt to queryability. | Performance | ≤ 30 seconds (p95) |
| NFR-002 | Dashboard query response time. | Performance | ≤ 5 seconds for standard queries |
| NFR-003 | System uptime for ingestion and alerting pipelines. | Availability | 99.5% monthly |
| NFR-004 | Dashboard availability. | Availability | 99.0% monthly |
| NFR-006 | The system shall scale horizontally to support onboarding new tenants without degrading existing tenants. | Scalability | — |
| NFR-009 | All data at rest and in transit shall be encrypted. | Security | AES-256 at rest, TLS 1.2+ in transit |
| NFR-022 | Per-workspace ingestion rate limiting shall enforce limits without data loss for other workspaces. One workspace exceeding limits shall not degrade performance for any other workspace. | Isolation | Zero cross-workspace impact |

---

## Requirement count summary

| Section | Count | Assignment mapping |
|---------|-------|--------------------|
| Tenant model | 6 | "organizational-level" |
| Authentication | 6 | "consider authentication" |
| Dashboard and metrics | 3 | "analytics dashboard" + "you decide metrics" |
| Data pipeline | 5 | System design |
| Resource governance | 4 | Production-plausible |
| Alerting | 4 | Dashboard usefulness |
| Usage metering | 4 | "organizational-level analytics" |
| Data retention | 2 | Production-plausible |
| NFRs | 7 | Production-plausible |
| **Total** | **41** | |

---

## Phase 2+ roadmap (from v5.2, not in scope for this deliverable)

The full v5.2 specification contains 260 additional requirements across these areas. They represent the product vision for a mature platform, not the initial deliverable:

- **AI-powered anomaly detection** (5-layer detection architecture, 24 requirements) — fleet-wide baselines, per-workspace volume models, peer-group comparison, version-transition detection, LLM-assisted explanations.
- **LLM evaluation pipelines** (14 requirements) — online evaluation with LLM-as-judge, CI/CD quality gates, production-to-test-case flywheel.
- **Guardrails and RAG monitoring** (18 requirements) — guardrail event correlation, RAG pipeline metrics (retrieval precision, chunk relevance, answer faithfulness).
- **Prompt management and versioning** (10 requirements) — prompt registry, A/B testing, version-linked performance tracking.
- **Agent workflow visualization** (5 requirements) — timeline view, decision-path graphs, side-by-side execution comparison.
- **Human-in-the-loop workflows** (5 requirements) — annotation queues, labeling interface, production-to-test-case promotion.
- **Session and conversation tracking** (4 requirements) — multi-turn session aggregation, session-level anomaly detection.
- **Enterprise security hardening** (60+ requirements) — NIST SP 800-53, SOC 2 CC6/CC7, ISO 27001, SCIM, JIT provisioning, break-glass PAM, privileged access management, access lifecycle governance, separation of duties.
- **LLM security and tenant isolation** (15 requirements) — prompt injection defense, LLM service identity, vector/embedding isolation, AI supply chain security.
- **AI governance** (8 requirements) — AI kill switch, model inventory, bias monitoring, EU AI Act Article 14 compliance.
- **Advanced schema governance** (12 requirements) — decomposition manifests, build-time code generation, CI-generated OTel Collector processors.
- **Tenant lifecycle management** (14 requirements) — onboarding automation, offboarding with data destruction, tenant merge/split.

Each Phase 2+ area has been researched, scoped, and specified. The technical architecture (Grafana LGTM stack, Kafka backbone, OTel Collector pipeline) was designed to support these extensions without rearchitecture.
