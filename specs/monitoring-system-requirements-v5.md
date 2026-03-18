# Functional Requirements: Multi-Tenant AI Agent Monitoring System

**Version:** 5.0  
**Date:** 2026-03-17  
**Status:** Draft  
**Changelog:**  
v5.0 — Security hardening update informed by gap analysis against NIST SP 800-53 Rev 5 (AC, IA, AU families), NIST 800-207 (Zero Trust Architecture), SOC 2 Trust Services Criteria (CC6/CC7), ISO 27001:2022 Annex A, OWASP Top 10 for LLM Applications 2025, OWASP API Security Top 10 2023, MITRE ATLAS, CSA AI Controls Matrix (July 2025), and cloud provider multi-tenancy guidance. Restructured and expanded §2.1: added MFA (MT-030–MT-031), separation of duties (MT-020), AI-specific RBAC permissions (MT-021), tenant context propagation and BOLA prevention (MT-011–MT-013), session and credential management (§2.1.4), privileged access management (§2.1.5), and access lifecycle governance (§2.1.6). Extended §2.5 adversarial protections from NL query interface to all LLM-powered features (DS-015–DS-017). Added per-workspace LLM endpoint rate limits to §2.16. Added three new sections: §2.20 (Security Audit & Monitoring), §2.21 (LLM Security & Tenant Isolation), §2.22 (AI Governance & Oversight). Added security NFRs (NFR-031 through NFR-038). Updated glossary with new terms. Added Appendix E (Security Architecture Rationale).  
v4.0 — Major update to the tenant model informed by multi-tenant architecture benchmarking against Datadog, New Relic, Grafana Cloud, Elastic Cloud, Splunk, LangSmith, Langfuse, and Arize, and aligned with AWS Well-Architected SaaS Lens, Azure Architecture Center, and GCP multi-tenancy guidance. Restructured §2.1 into subsections covering tenant hierarchy and enterprise identity integration (SSO/SCIM). Added tenant lifecycle management (§2.15), per-tenant resource governance (§2.16), usage metering & cost attribution (§2.17), tenant configuration management (§2.18), tenant health & operational visibility (§2.19), and noisy-neighbor isolation. Expanded data retention (§2.14) with data portability and residency requirements. Added new NFRs for resource governance, metering, SSO, and tenant isolation enforcement. Updated glossary with new terms.  
v3.0 — Major update informed by market benchmarking against 12+ AI/LLM monitoring tools and Gartner's February 2026 AEOP Market Guide. Added evaluation integration (§2.7), guardrails monitoring (§2.8), RAG pipeline monitoring (§2.9), prompt management & versioning (§2.10), agent workflow visualization (§2.11), human-in-the-loop workflows (§2.12), session & conversation tracking (§2.13), and data retention & storage tiering (§2.14). Added adversarial input protection to the AI-assisted dashboard (§2.5). Added OpenInference span type support to the schema registry (§2.6). Relaxed NFR targets for uptime, alert delivery, and dashboard availability to operationally sustainable levels. Added NFRs for new capabilities. Updated glossary with new terms.  
v2.1 — Clarified that agents may run different versions of the common codebase; anomaly detection baselines are now version-aware; added version-transition anomaly detection requirements.

---

## 1. Introduction

This document defines the functional and non-functional requirements for a centralized monitoring system designed to provide observability (logs, metrics, traces) for **AI agents operating across multiple tenants**.

All monitored AI agents share a **common codebase**, though tenants may run **different versions** of it at any given time. Within a version, log structures, metric names, error categories, and trace schemas are homogeneous. Across versions, these structures may evolve — new log fields, changed error types, modified trace spans. Tenants also differ in agent volume (scale), usage patterns (timing and frequency), external dependencies (third-party APIs, model providers), and agent configuration (model choice, timeouts, retry policies). This architectural property — shared codebase with version diversity — shapes the anomaly detection strategy: fleet-wide baselines are partitioned by active codebase version, while per-tenant scale normalization remains version-independent.

The system supports **hierarchical tenant organization with enterprise identity integration**, **formal tenant lifecycle management**, **per-tenant resource governance and noisy-neighbor isolation**, **usage metering and cost attribution**, per-tenant data isolation, self-service access, AI-powered anomaly detection with a tiered baseline architecture, continuous LLM evaluation pipelines, guardrails monitoring, RAG pipeline observability, prompt management and versioning, LLM-assisted dashboard building, governed schema management, configurable data retention with tiered storage, **comprehensive security audit logging and monitoring**, **LLM-specific tenant isolation and supply chain controls**, and **AI governance with human oversight**.

---

## 2. Functional Requirements

### 2.1 Multi-Tenancy & Access Control

This section defines the tenant hierarchy, data isolation model, role-based access control, enterprise identity integration, session and credential management, privileged access management, and access lifecycle governance. The tenant model uses a three-level hierarchy (Organization → Workspace → Project) informed by LangSmith's workspace model, Datadog's multi-org architecture, and Grafana Cloud's stack-based isolation. Security controls are aligned with NIST SP 800-53 Rev 5 (AC, IA families), SOC 2 CC6/CC7, and ISO 27001:2022 Annex A.

#### 2.1.1 Tenant Hierarchy & Data Isolation

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-001 | The system shall implement a three-level tenant hierarchy: **Organization** (billing and identity boundary), **Workspace** (trust and data isolation boundary), and **Project** (logical grouping of agents, traces, and dashboards within a workspace). | Must |
| MT-002 | All observability data (logs, metrics, traces) shall be logically isolated at the **workspace** level so that no workspace can access another workspace's data, including workspaces within the same organization. | Must |
| MT-003 | Organizations shall serve as the top-level entity for billing, user management, identity provider configuration, and subscription tier enforcement. A single organization may contain multiple workspaces. | Must |
| MT-004 | Workspaces shall serve as independent trust boundaries with their own API keys, secrets, data retention settings, and resource quotas. Each workspace shall be independently configurable without affecting sibling workspaces. | Must |
| MT-005 | Projects shall provide logical grouping within a workspace for organizing agents, traces, dashboards, and alert rules by application, team, or environment (e.g., production, staging). Projects share the workspace's data isolation boundary. | Should |
| MT-006 | Platform owners shall have a dedicated cross-tenant analytics view to query aggregated or comparative data across all organizations and workspaces. | Must |
| MT-007 | Cross-tenant analytics shall never expose raw tenant data to other tenants; only platform-owner roles may access it. | Must |
| MT-008 | Each workspace shall have a self-service dashboard to view, search, and filter its own logs, metrics, and traces without platform-owner involvement. | Must |
| MT-009 | The system shall support workspace-scoped API keys for programmatic access, bound by the same RBAC policies. API keys shall be independently manageable per workspace. | Should |
| MT-010 | Organization Admins shall be able to create, archive, and manage workspaces within their organization, and set organization-wide policies that apply as defaults to all contained workspaces. | Must |
| MT-011 | Workspace context shall be derived from authenticated credentials (JWT claims or API key lookup) at the ingestion and API gateway layer and propagated immutably through all downstream services. Client-supplied workspace identifiers shall never be trusted for authorization decisions. | Must |
| MT-012 | Every API endpoint that accepts resource identifiers (dashboard_id, trace_id, alert_id, evaluation_id) shall verify workspace ownership at the data access layer using composite key lookups (workspace_id + resource_id). Row-Level Security shall be enforced at the database level as a defense-in-depth measure. | Must |
| MT-013 | All resource identifiers exposed in APIs shall use cryptographically random values (UUIDs or equivalent). Sequential or predictable identifiers shall not be used for any tenant-accessible resource. | Must |

#### 2.1.2 Role-Based Access Control

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-014 | The system shall enforce role-based access control (RBAC) at each level of the tenant hierarchy: Organization-level roles, Workspace-level roles, and optionally Project-level roles. | Must |
| MT-015 | The system shall support at minimum the following roles per hierarchy level: **Admin** (full management), **Operator** (configuration and operational access), and **Viewer** (read-only). | Must |
| MT-016 | Organization Admins shall be able to create, modify, and revoke roles and user assignments within their organization scope, including delegating Workspace Admin roles. | Must |
| MT-017 | Workspace Admins shall be able to manage user assignments and roles within their workspace scope, without requiring Organization Admin involvement. | Must |
| MT-018 | The system shall support custom roles with granular permissions (e.g., "can create alert rules but not modify retention settings") in addition to the default role templates. | Should |
| MT-019 | Users shall be able to belong to multiple workspaces within the same organization with different roles per workspace (e.g., Admin in Workspace A, Viewer in Workspace B). | Must |
| MT-020 | The system shall enforce separation of duties: users shall not be able to elevate their own role or approve their own role change requests; RBAC policy changes for Admin-level accounts shall require a different Admin to approve; Platform Owners shall not be able to modify or delete audit logs. | Must |
| MT-021 | The system shall support AI-specific permissions within the role model, controlling access to: AI feature configuration (evaluation pipelines, guardrail settings, prompt management), AI feature invocation (NL queries, anomaly explanations, dashboard generation), and AI audit review (viewing AI interaction logs and LLM outputs). These permissions shall layer onto the existing Admin/Operator/Viewer hierarchy via custom roles (MT-018). | Should |

#### 2.1.3 Enterprise Identity Integration & Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-022 | The system shall support per-organization SSO configuration via SAML 2.0 and OpenID Connect (OIDC), allowing each organization to connect its own identity provider independently. | Must |
| MT-023 | The system shall support SCIM 2.0 for automated user provisioning and deprovisioning, including user creation, role assignment, workspace membership, and immediate access revocation when users are removed from the identity provider. | Must |
| MT-024 | The system shall support mapping identity provider groups and attributes to platform roles at both the organization and workspace level, so that role assignments are managed in the tenant's identity provider and propagated automatically. | Should |
| MT-025 | The system shall support Just-In-Time (JIT) provisioning as a lightweight alternative to SCIM, creating user accounts on first SSO login with roles derived from SAML assertions or OIDC claims. | Should |
| MT-026 | Different organizations shall be able to use different identity providers (e.g., one organization uses Okta, another uses Microsoft Entra ID, a third uses local password authentication). | Must |
| MT-027 | SSO-enforced organizations shall be able to require that all users authenticate via the configured identity provider, disabling local password authentication for that organization. | Should |
| MT-028 | The system shall support identity provider-initiated and service provider-initiated SSO flows. | Should |
| MT-029 | SSO and SCIM features shall be available on Enterprise subscription tiers, with local password authentication and manual user management available on all tiers. | Must |
| MT-030 | The system shall require multi-factor authentication (MFA) for all accounts. Phishing-resistant MFA methods (FIDO2/WebAuthn) shall be required for Admin roles at every hierarchy level and for Platform Owner accounts. Organizations shall be able to configure MFA policies (allowed methods, enforcement level) for their users. | Must |
| MT-031 | The system shall support platform-enforced MFA independently of identity provider MFA, so that organizations not using SSO still have MFA protection. For SSO-enforced organizations, MFA may be delegated to the identity provider when the IdP's MFA policy meets or exceeds the platform's requirements. | Must |

#### 2.1.4 Session & Credential Management

This section defines controls for session lifecycle and API credential security, aligned with NIST SP 800-53 IA-11 (Re-authentication), SOC 2 CC6.1, and ISO 27001 A.8.5.

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-032 | The system shall enforce configurable session management policies per organization: idle session timeout (default: 30 minutes for Admin, 60 minutes for Operator/Viewer), absolute session duration limit (default: 12 hours), and maximum concurrent sessions per user (default: 5). | Must |
| MT-033 | Sessions shall be immediately invalidated upon password change, role change, SCIM deprovisioning, or user-initiated logout. User-initiated logout shall terminate all active sessions and revoke all associated tokens for that user. | Must |
| MT-034 | The system shall require step-up re-authentication before sensitive operations: RBAC modifications, API key creation or deletion, cross-tenant analytics access, offboarding initiation, retention policy changes, and evaluation pipeline configuration changes. | Should |
| MT-035 | The system shall support OAuth 2.0 bearer tokens (short-lived, ≤1 hour) for API authentication as the recommended mechanism for interactive and automated integrations, with API keys available as a secondary option for data ingestion pipelines. | Should |
| MT-036 | API keys shall be hashed (SHA-256 minimum) before storage, shall have a mandatory maximum lifetime (configurable, default: 90 days), and shall support automated rotation with dual-key grace periods allowing the old key to remain valid for a configurable overlap window (default: 24 hours). | Must |
| MT-037 | The system shall support immediate API key revocation, with revoked keys rejected within 60 seconds across all enforcement points. All API key lifecycle operations (creation, rotation, revocation, expiration) shall be logged in the audit trail. | Must |
| MT-038 | The system shall detect and alert on stale API keys approaching expiration, unused API keys exceeding a configurable inactivity threshold (default: 30 days), and API keys with anomalous usage patterns (unusual source IPs, sudden volume spikes). | Should |

#### 2.1.5 Privileged Access Management

This section defines controls for platform-owner and administrative access, aligned with ISO 27001 A.8.2 (Privileged Access Rights) and NIST SP 800-53 AC-6 (Least Privilege).

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-039 | The system shall maintain an inventory of all privileged accounts (Platform Owner, Organization Admin) with documented justification for each privileged assignment, reviewed quarterly. | Must |
| MT-040 | Platform Owner cross-tenant access shall be provisioned via just-in-time (JIT) elevation with automatic expiration (default: 4 hours). Persistent cross-tenant access shall not be permitted for day-to-day operations. | Must |
| MT-041 | All Platform Owner sessions shall be logged with enhanced detail: every data access, query execution, configuration change, and cross-tenant operation recorded with full request/response metadata. | Must |
| MT-042 | The system shall provide a break-glass emergency access procedure for situations requiring immediate cross-tenant access outside normal JIT workflows. Break-glass access shall require dual authorization (two Platform Owners), shall be time-bounded (maximum 8 hours), and shall trigger mandatory post-incident review with documented justification. | Should |
| MT-043 | Platform Owner actions that modify security-critical configurations (RBAC policies, encryption settings, audit log configuration, tenant lifecycle state) shall require approval from a second Platform Owner before taking effect. | Should |

#### 2.1.6 Access Lifecycle Governance

This section defines controls for periodic access review and compliance evidence, aligned with SOC 2 CC6.2/CC6.3 and NIST SP 800-53 AC-2.

| ID | Requirement | Priority |
|----|-------------|----------|
| MT-044 | The system shall support quarterly access reviews of all user accounts, roles, and API keys within each workspace, with documented sign-off by the Workspace Admin. The system shall generate access review reports listing all current access grants, last activity timestamps, and role assignments. | Must |
| MT-045 | The system shall support monthly access reviews of all Platform Owner accounts and Organization Admin accounts, with documented sign-off and remediation tracking for any identified excessive or unnecessary access. | Must |
| MT-046 | The system shall automatically detect and flag dormant accounts (no login within a configurable period, default: 90 days) and orphaned accounts (no associated identity provider record for SCIM-managed organizations), surfacing them in access review reports and optionally disabling them automatically. | Should |
| MT-047 | SCIM provisioning events shall be logged with sufficient detail to serve as SOC 2 evidence: identity provider authorization event timestamp, SCIM push timestamp, account creation/modification timestamp, and role assignment details. For non-SCIM organizations, the system shall support a manual provisioning workflow with request-and-approval audit trail. | Should |
| MT-048 | The system shall maintain a data classification scheme applied to all platform data types: tenant observability data (Confidential), cross-tenant aggregated analytics (Internal), AI model configurations and prompt templates (Confidential), credentials and encryption keys (Restricted), audit logs (Integrity-Protected). Classification shall drive encryption, access, masking, and retention requirements. | Should |

### 2.2 Data Privacy & Scrubbing

| ID | Requirement | Priority |
|----|-------------|----------|
| DP-001 | The system shall automatically detect and scrub secrets (API keys, tokens, passwords) from all ingested data before persistence. | Must |
| DP-002 | The system shall automatically detect and redact PII (emails, phone numbers, IP addresses, names) from all ingested data before persistence. | Must |
| DP-003 | Scrubbing rules shall be configurable per workspace, allowing workspace admins to define custom patterns for additional sensitive fields. | Should |
| DP-004 | The system shall log all scrubbing actions to an audit trail, recording what was redacted, when, and by which rule — without storing the original value. | Should |
| DP-005 | Scrubbing shall occur at the ingestion layer, ensuring no unscrubbed data reaches storage or indexing. | Must |
| DP-006 | The system shall scrub LLM prompt and completion content from agent traces when configured by the workspace, preserving only metadata (model name, token count, latency). | Must |
| DP-007 | PII detected within agent tool-call arguments and responses shall be redacted before storage, using context-aware patterns specific to AI agent workflows (e.g., user queries, retrieved documents). | Should |

### 2.3 Alerting

| ID | Requirement | Priority |
|----|-------------|----------|
| AL-001 | The system shall support per-workspace alert rules that trigger when a workspace's agents fail, crash, or become unreachable. | Must |
| AL-002 | The system shall provide cost and budget alerting per workspace, notifying when ingestion volume, storage consumption, or LLM token usage approaches or exceeds a configurable threshold. | Must |
| AL-003 | Workspace users shall be able to configure their own alert destinations (email, webhook, Slack, PagerDuty) through the self-service dashboard. | Should |
| AL-004 | Platform owners shall receive system-wide alerts for cross-tenant anomalies (e.g., sudden ingestion spikes, global agent failures, common dependency outages). | Should |
| AL-005 | Each alert shall include contextual metadata: organization ID, workspace ID, agent ID, agent run ID, timestamp, triggering condition, and a deep link to the relevant trace or log. | Must |
| AL-006 | Alert thresholds shall be configurable per workspace independently of the underlying detection model, allowing workspace admins to set their own sensitivity levels per alert type. | Must |
| AL-007 | The system shall support alert grouping by time window and causal dependency to reduce alert noise (e.g., if a shared external API is down, a single grouped alert is sent rather than one per affected agent). | Should |

### 2.4 AI-Powered Anomaly Detection

This section defines a **five-layer detection architecture** optimized for AI agents sharing a common codebase across multiple active versions. Because agents within a given version are structurally homogeneous, the system leverages fleet-wide models partitioned by codebase version for structural anomalies, lightweight per-tenant models for scale normalization, and version-transition detection for upgrade-related regressions.

#### 2.4.1 Fleet-Wide Structural Baseline (Layer 1)

| ID | Requirement | Priority |
|----|-------------|----------|
| AD-001 | The system shall maintain fleet-wide baseline models **partitioned by active codebase version**, so that each version has its own definition of normal log sequences, error distributions, and trace structures. | Must |
| AD-002 | The fleet-wide model for a given version shall detect novel error types, unexpected log fields, new failure modes, and structural deviations from the expected behavior of that version. | Must |
| AD-003 | The fleet-wide model shall use `workspace_id` and `agent_version` as category fields to enable multi-entity, multi-version detection within a shared detector infrastructure. | Must |
| AD-004 | When a new codebase version is deployed, the system shall bootstrap its baseline from the prior version's model and progressively adapt as sufficient data is collected from the new version. A configurable learning period shall suppress structural alerts for newly deployed versions. | Must |
| AD-005 | The system shall detect stuck or looping agents using a universal loop signature — defined as repeated identical tool-call sequences, cycling LLM outputs, or agent step counts exceeding a configurable threshold — with version-specific thresholds where execution characteristics differ between versions. | Must |
| AD-006 | The system shall detect agent execution anomalies including: abnormally long execution times, excessive tool-call retries, unexpected tool-call ordering, and token consumption spikes relative to the fleet norm **for the same codebase version**. | Must |
| AD-007 | The system shall retire baselines for codebase versions that no longer have any active workspaces, and archive their models for historical reference. | Should |

#### 2.4.2 Per-Workspace Rate & Volume Baseline (Layer 2)

| ID | Requirement | Priority |
|----|-------------|----------|
| AD-008 | The system shall maintain lightweight per-workspace time-series models on key volume indicators: error count, agent invocation rate, trace throughput, and LLM token consumption. | Must |
| AD-009 | Per-workspace volume baselines shall account for each workspace's unique scale and diurnal/weekly patterns (e.g., batch vs. continuous usage). | Must |
| AD-010 | Volume anomalies shall be evaluated relative to the workspace's own historical norm, not absolute thresholds (e.g., "500 errors/10min" is anomalous for a small workspace but normal for a large one). | Must |
| AD-011 | Per-workspace models shall be lightweight (time-series statistical methods such as adaptive mean/stddev or median/MAD), not full ML models, to minimize compute overhead. | Should |
| AD-012 | When a workspace upgrades codebase version, the per-workspace volume baseline shall apply a configurable transition window during which volume shifts attributable to the version change are dampened rather than alerted on. | Should |

#### 2.4.3 Peer-Group Comparison (Layer 3)

| ID | Requirement | Priority |
|----|-------------|----------|
| AD-013 | The system shall automatically classify workspaces into peer groups based on scale tier (e.g., small, medium, large by agent count or invocation volume) **and codebase version**. | Should |
| AD-014 | The system shall alert when a workspace's error rates, retry ratios, or agent failure rates deviate significantly from its peer group (same scale tier, same version), indicating a workspace-specific issue. | Should |
| AD-015 | Peer-group comparisons shall be used by platform owners for capacity planning and proactive tenant health monitoring. | Could |

#### 2.4.4 Version-Transition Anomaly Detection (Layer 4)

| ID | Requirement | Priority |
|----|-------------|----------|
| AD-016 | The system shall track which codebase version each workspace's agents are running and maintain a version registry mapping workspace → active version(s), including workspaces running mixed versions during rollout. | Must |
| AD-017 | The system shall detect version-upgrade regressions: when a workspace's error rate, latency, or failure rate spikes specifically after a codebase version change, the alert shall identify the version transition as a probable cause. | Must |
| AD-018 | The system shall detect stale-version workspaces: when a workspace remains on a codebase version that all or most other workspaces have migrated away from, platform owners shall receive an advisory alert. | Should |
| AD-019 | The system shall support cross-version comparison for the same workspace — allowing workspace users and platform owners to compare key metrics (error rate, latency p95, token usage) before and after a version upgrade. | Should |
| AD-020 | During a workspace's version rollout (mixed versions in flight), the system shall attribute anomalies to the correct version by correlating `agent_version` metadata in traces and logs. | Must |

#### 2.4.5 LLM-Assisted Explanation (Layer 5 — On-Demand)

| ID | Requirement | Priority |
|----|-------------|----------|
| AD-021 | When an anomaly is detected by Layers 1–4, the system shall optionally generate a natural-language explanation of the anomaly using an LLM, including probable root cause, codebase version context, and suggested investigation steps. | Should |
| AD-022 | LLM-generated explanations shall be scoped to the requesting workspace's data only; no cross-workspace data shall be included in LLM context. | Must |
| AD-023 | LLM explanation generation shall be rate-limited and subject to per-workspace token budgets to prevent cost overruns. | Must |
| AD-024 | The system shall support an offline rule-synthesis mode where an LLM generates lightweight detection rules from historical anomaly patterns, which are then deployed as code for zero-LLM-cost runtime execution. | Could |

### 2.5 AI-Assisted Dashboard & Self-Service

| ID | Requirement | Priority |
|----|-------------|----------|
| DS-001 | The self-service dashboard shall provide a natural-language query interface allowing workspace users to explore their observability data using plain English (e.g., "show me agent failures in the last 24 hours grouped by tool name"). | Should |
| DS-002 | Natural-language queries shall be translated to the underlying query language (PromQL, LogQL, or equivalent) with the generated query visible to the user for review before execution. | Must |
| DS-003 | All generated queries shall be validated against a syntax checker before execution to prevent malformed queries from reaching backends. | Must |
| DS-004 | The system shall enforce workspace-scoped data access on all AI-generated queries — generated queries shall automatically include workspace isolation filters regardless of user input. | Must |
| DS-005 | The system shall provide LLM-powered dashboard generation, allowing workspace users to describe a desired dashboard in natural language and receive a multi-panel layout as a starting point. | Could |
| DS-006 | AI-generated dashboards shall be editable and saveable by the workspace, serving as a starting point rather than a final output. | Should |
| DS-007 | The system shall provide AI-powered "explain this panel" functionality, generating natural-language summaries of what a metric, log pattern, or trace visualization shows. | Should |
| DS-008 | The system shall provide pre-built dashboard templates optimized for common AI agent observability views: agent execution overview, tool-call performance, LLM token usage, error breakdown, and cost tracking. | Must |
| DS-009 | All AI-assisted features shall include a feedback mechanism (e.g., thumbs up/down) per response to support continuous improvement. | Should |
| DS-010 | The system shall log all AI interactions (queries generated, tools called, data accessed) in an audit trail per workspace. | Must |
| DS-011 | Per-workspace LLM token budgets shall apply to all AI-assisted dashboard features, with graceful degradation to manual query mode when budgets are exhausted. | Must |
| DS-012 | **All LLM-powered features** — including the natural-language query interface, anomaly explanations (§2.4.5), dashboard generation (DS-005), "explain this panel" (DS-007), LLM-as-judge evaluation (§2.7), and rule synthesis (AD-024) — shall implement multi-layered adversarial input protection: input validation and sanitization, output filtering to prevent data exfiltration, privilege minimization (LLM-generated operations execute with minimum required permissions), and sandboxed execution for generated queries or actions. | Must |
| DS-013 | The system shall detect and block prompt injection attempts targeting **any LLM-powered feature**, logging all blocked attempts to the security audit trail. Detection shall cover both direct injection (malicious user input) and indirect injection (malicious payloads embedded in observability data, log entries, or trace content that could manipulate the LLM when processed). | Must |
| DS-014 | AI-generated query output shall be validated against an allowlist of permitted query operations before execution, preventing the LLM from generating destructive, administrative, or cross-workspace queries regardless of user input. | Must |
| DS-015 | All LLM-generated outputs (anomaly explanations, dashboard suggestions, evaluation results, NL query results, "explain this panel" responses) shall be scanned for cross-workspace data leakage before delivery to the user. Outputs containing data from a workspace other than the requesting workspace shall be blocked and logged as a security event. | Must |
| DS-016 | Observability data (logs, traces, metrics) shall be sanitized before inclusion in LLM context to mitigate indirect prompt injection — stripping or escaping content that could be interpreted as LLM instructions while preserving diagnostic value. | Should |
| DS-017 | Workspace Admins shall be able to independently enable or disable each category of AI-powered feature (NL queries, anomaly explanations, AI dashboard generation, LLM-as-judge evaluation) for their workspace. Disabling an AI feature shall have no impact on non-AI monitoring functionality. | Should |

### 2.6 Schema Registry & Governance

| ID | Requirement | Priority |
|----|-------------|----------|
| SR-001 | The system shall provide a centralized schema registry that stores and versions all event, log, and metric schemas emitted by the common agent codebase. | Must |
| SR-002 | Every schema change shall be versioned with an immutable history, supporting rollback to any prior version. | Must |
| SR-003 | The schema registry shall expose a CI-compatible API endpoint that validates proposed schema changes against compatibility rules (backward, forward, or full compatibility). | Must |
| SR-004 | CI compatibility checks shall block deployment if a breaking change is detected, unless explicitly overridden by a platform owner. | Must |
| SR-005 | The system shall enforce cardinality limits on metric label values to prevent high-cardinality explosions (e.g., max unique values per label configurable per workspace). | Must |
| SR-006 | When a cardinality limit is approached or breached, the system shall alert the affected workspace and optionally drop or aggregate offending series. | Should |
| SR-007 | The schema registry shall support schema documentation and metadata tags for discoverability. | Could |
| SR-008 | Schema changes in the common agent codebase shall trigger automatic revalidation of fleet-wide anomaly detection baselines for the affected version, and bootstrap a new baseline for the new version from the prior version's model. | Must |
| SR-009 | The schema registry shall include OpenTelemetry GenAI semantic convention schemas (model name, token usage, tool calls, agent spans) as first-class registered types. | Should |
| SR-010 | The schema registry shall maintain a mapping of workspace → active codebase version(s), updated automatically via deployment events or agent heartbeat metadata, to support version-partitioned anomaly detection and stale-version alerting. | Must |
| SR-011 | The schema registry shall support OpenInference span types (LLM, CHAIN, TOOL, RETRIEVER, EMBEDDING, AGENT, RERANKER, GUARDRAIL) as registered types alongside OpenTelemetry GenAI conventions, enabling compatibility with Arize Phoenix, Langfuse, and OpenLLMetry-instrumented frameworks. | Should |

### 2.7 LLM Evaluation Integration

This section defines requirements for continuous evaluation of AI agent output quality in production, aligning with the Gartner AEOP (AI Evaluation and Observability Platform) category definition which mandates evaluation as a core monitoring capability.

#### 2.7.1 Online Evaluation Pipeline

| ID | Requirement | Priority |
|----|-------------|----------|
| EV-001 | The system shall support asynchronous online evaluation of production traces, scoring agent outputs against configurable quality dimensions (correctness, relevance, safety, groundedness) without adding latency to the agent execution path. | Must |
| EV-002 | The system shall provide an LLM-as-judge evaluator framework, allowing workspaces to define custom evaluation prompts that score agent outputs using a configurable judge model. | Must |
| EV-003 | The system shall support code-based evaluators (deterministic functions) that score agent outputs using programmatic rules (e.g., regex checks, schema validation, format compliance) without LLM inference cost. | Must |
| EV-004 | Evaluation scores shall be attached to traces as first-class metadata, queryable and filterable in the self-service dashboard alongside latency, cost, and error metrics. | Must |
| EV-005 | The system shall support sampling-based evaluation, allowing workspaces to configure the percentage of production traces evaluated (e.g., 100% for code-based evaluators, 5–20% for LLM-as-judge) to manage cost. | Must |
| EV-006 | LLM-as-judge evaluator token consumption shall be metered separately from agent token consumption, subject to the workspace's evaluation token budget, and reportable for cost attribution. | Must |
| EV-007 | The system shall support evaluation of individual agent steps (tool calls, LLM invocations) in addition to end-to-end agent output evaluation. | Should |

#### 2.7.2 CI/CD Quality Gates

| ID | Requirement | Priority |
|----|-------------|----------|
| EV-008 | The system shall expose a CI-compatible API endpoint that runs a defined evaluation suite against a test dataset and returns pass/fail results with scores, enabling integration into CI/CD pipelines as a deployment gate. | Must |
| EV-009 | Quality gate thresholds shall be configurable per workspace and per evaluation dimension (e.g., "correctness ≥ 0.85, safety = 1.0"), with configurable behavior on failure (block deployment, warn, or log only). | Must |
| EV-010 | The CI evaluation API shall return comparison results against a configurable baseline (prior version's scores, rolling production average, or a fixed target), so that teams can detect quality regressions before deployment. | Should |
| EV-011 | Evaluation results from CI runs shall be stored and versioned in the system, linked to the codebase version and deployment event, enabling historical quality tracking across releases. | Should |

#### 2.7.3 Production-to-Test-Case Flywheel

| ID | Requirement | Priority |
|----|-------------|----------|
| EV-012 | The system shall allow workspaces to promote production traces (including failures, low-scoring outputs, and anomalous executions) into curated evaluation datasets for offline testing. | Should |
| EV-013 | Promoted traces shall retain all relevant context (input, output, tool calls, evaluation scores, annotations) and be usable as test cases in CI/CD quality gate evaluations. | Should |
| EV-014 | The system shall support automatic promotion rules (e.g., "add all traces scoring below 0.5 on correctness to the regression test dataset") configurable per workspace. | Could |

### 2.8 Guardrails Monitoring

This section defines requirements for monitoring the health and effectiveness of guardrails applied within the agent execution pipeline. These requirements complement the data privacy scrubbing in §2.2 by providing observability over runtime safety mechanisms.

| ID | Requirement | Priority |
|----|-------------|----------|
| GR-001 | The system shall ingest and track guardrail execution events — including guardrail name, type (input/output), trigger result (pass/fail/error), and associated trace — as first-class telemetry alongside logs, metrics, and traces. | Must |
| GR-002 | The system shall provide per-workspace dashboards showing guardrail firing rates, failure rates, bypass rates, and false positive/negative rates over configurable time windows. | Must |
| GR-003 | The system shall alert when guardrail failure rates exceed configurable thresholds (e.g., a prompt injection guardrail suddenly stops triggering, suggesting it may have been bypassed or misconfigured). | Must |
| GR-004 | The system shall support fleet-wide guardrail effectiveness comparison, allowing platform owners to identify workspaces whose guardrail configurations are under-performing relative to the fleet norm for the same codebase version. | Should |
| GR-005 | Guardrail events shall be correlated with agent traces, enabling drill-down from a guardrail firing to the full agent execution context (input, tool calls, LLM output that triggered the guardrail). | Must |
| GR-006 | The system shall track prompt injection detection rates across the fleet, providing platform owners with a security posture dashboard showing injection attempt volume, detection rates, and bypass attempts over time. | Should |
| GR-007 | Guardrail monitoring shall support common guardrail categories: prompt injection detection, PII leakage prevention, toxicity/content safety filtering, topic restriction enforcement, and output format validation. | Should |

### 2.9 RAG Pipeline Monitoring

| ID | Requirement | Priority |
|----|-------------|----------|
| RAG-001 | The system shall support instrumentation and monitoring of RAG pipeline components (retriever, reranker, generator) as distinct trace spans, enabling component-level latency and error tracking. | Must |
| RAG-002 | The system shall compute and track retrieval quality metrics — including context relevance, context recall, and context precision — either via code-based evaluators or LLM-as-judge scorers from the evaluation framework (§2.7). | Must |
| RAG-003 | The system shall compute and track generation quality metrics — including faithfulness (grounded in retrieved context) and answer relevancy — via evaluators from the evaluation framework (§2.7). | Must |
| RAG-004 | The system shall support embedding drift detection, alerting when the distribution of embedding vectors produced by the retrieval pipeline shifts significantly from a learned baseline. | Should |
| RAG-005 | The system shall provide a pre-built RAG performance dashboard template showing retrieval latency, retrieval quality scores, generation quality scores, chunk utilization rates, and end-to-end RAG pipeline latency. | Should |
| RAG-006 | RAG quality metrics shall be available in the anomaly detection pipeline (§2.4), enabling fleet-wide and per-workspace alerting on retrieval quality regressions. | Should |

### 2.10 Prompt Management & Versioning

| ID | Requirement | Priority |
|----|-------------|----------|
| PM-001 | The system shall maintain a version-controlled registry of prompt templates used by agents, storing each version with an immutable history, author, timestamp, and optional description. | Must |
| PM-002 | Agent traces shall include prompt template identifiers and version references as first-class metadata, enabling correlation between prompt versions and quality/cost metrics. | Must |
| PM-003 | The system shall provide dashboards showing quality and cost metrics (evaluation scores, token usage, latency, error rates) segmented by prompt template version, enabling before/after comparison when prompts change. | Should |
| PM-004 | The system shall support protected deployment labels for prompt versions (e.g., "production", "staging", "canary"), ensuring that only explicitly promoted versions are served to production agents. | Should |
| PM-005 | The system shall support prompt rollback, allowing workspace users to revert a prompt template to a prior version and correlate the rollback event with subsequent quality metric changes. | Should |
| PM-006 | The prompt registry shall integrate with the CI/CD quality gate API (§2.7.2), enabling evaluation suite runs against candidate prompt versions before promotion. | Could |

### 2.11 Agent Workflow Visualization

| ID | Requirement | Priority |
|----|-------------|----------|
| AV-001 | The system shall provide a timeline view of agent executions, displaying each step (LLM call, tool call, guardrail check, retrieval) as a sequential span with duration, enabling visual identification of bottlenecks and long-running steps. | Must |
| AV-002 | The system shall provide a graph view of agent decision paths, displaying the directed flow of steps as nodes and transitions, enabling visual understanding of branching logic, retries, and alternative paths taken during execution. | Should |
| AV-003 | The system shall provide a conversation view for agents that process multi-turn interactions, displaying the sequence of user inputs, agent responses, and intermediate reasoning steps in a threaded, readable format. | Should |
| AV-004 | Each visualization view shall support drill-down into individual steps, showing full input/output content (subject to scrubbing policies), evaluation scores, latency, token usage, and associated guardrail events. | Must |
| AV-005 | The system shall support visual comparison of two agent executions side-by-side (e.g., comparing a failed run to a successful run of the same task) to assist in root-cause debugging. | Could |

### 2.12 Human-in-the-Loop Workflows

| ID | Requirement | Priority |
|----|-------------|----------|
| HL-001 | The system shall provide annotation queues that surface agent traces for human review, configurable by filters such as low evaluation scores, anomaly flags, guardrail triggers, or random sampling. | Should |
| HL-002 | The system shall provide a labeling interface allowing reviewers to annotate agent traces with structured feedback: correctness labels, quality ratings, free-text comments, and issue categorization tags. | Should |
| HL-003 | Human annotations shall be stored as first-class metadata on traces, queryable and filterable in dashboards, and usable as ground-truth labels for evaluator calibration. | Should |
| HL-004 | The system shall support configurable review workflows with role-based assignment (e.g., assigning specific annotation tasks to Operator-role users within a workspace). | Could |
| HL-005 | Annotation data shall integrate with the production-to-test-case flywheel (§2.7.3), allowing annotated traces to be promoted into evaluation datasets with their human-assigned labels as expected outputs. | Could |

### 2.13 Session & Conversation Tracking

| ID | Requirement | Priority |
|----|-------------|----------|
| SC-001 | The system shall support session-level grouping of agent traces, aggregating all traces belonging to a multi-turn conversation or task session into a single queryable session entity. | Should |
| SC-002 | Sessions shall be identified by a workspace-provided session ID propagated through agent traces, and the system shall automatically compute session-level aggregate metrics (total turns, total latency, total token cost, session-level evaluation scores). | Should |
| SC-003 | The self-service dashboard shall support session-level search, filtering, and drill-down — allowing workspace users to find sessions by duration, cost, turn count, outcome, or evaluation score and then inspect individual traces within a session. | Should |
| SC-004 | Session-level anomaly detection shall be supported, alerting on abnormally long sessions, sessions with excessive turn counts, or sessions where evaluation scores degrade across turns. | Could |

### 2.14 Data Retention, Storage Tiering & Data Portability

This section defines requirements for data retention policies, storage lifecycle management, and tenant data portability — addressing compliance obligations (GDPR Articles 17 and 20) and operational data management.

#### 2.14.1 Retention & Storage Tiering

| ID | Requirement | Priority |
|----|-------------|----------|
| DR-001 | The system shall enforce configurable data retention policies per workspace and per data type (logs, metrics, traces, evaluation results, annotations), with platform-owner-defined defaults and workspace-configurable overrides within permitted bounds. | Must |
| DR-002 | The system shall implement tiered storage (hot, warm, cold) with automatic data migration based on age, access frequency, and workspace configuration. Hot storage shall support full-speed queries; warm storage shall support queries with degraded latency; cold storage shall support archive retrieval on request. | Must |
| DR-003 | Default retention periods shall be: metrics — 15 months hot + warm; traces and logs — 90 days hot, 12 months warm; evaluation results and annotations — 24 months warm. These defaults shall be overridable per workspace. | Should |
| DR-004 | Workspace users shall be able to view their current storage consumption and retention settings through the self-service dashboard, and Workspace Admins shall be able to adjust retention policies within platform-owner-defined bounds. | Should |
| DR-005 | The system shall support on-demand rehydration of cold-tier data back to a queryable state, with a defined SLA for rehydration latency. | Could |
| DR-006 | Data deletion upon retention expiry shall be irreversible, cryptographically confirmed, and logged in the audit trail. | Must |

#### 2.14.2 Data Portability & Residency

| ID | Requirement | Priority |
|----|-------------|----------|
| DR-007 | The system shall provide self-service data export APIs allowing workspace admins to export their observability data (logs, metrics, traces, evaluation results, annotations, dashboards, alert rules) in structured, machine-readable formats (JSON, CSV, or equivalent). | Must |
| DR-008 | The system shall support bulk export of workspace data for migration or compliance purposes, with export jobs trackable through the self-service dashboard. | Should |
| DR-009 | Upon workspace or organization offboarding, the system shall execute a configurable data export and retention workflow: export all data to the tenant's designated storage, enforce any contractual retention period, then perform verified cryptographic deletion of all tenant data across all storage tiers. | Must |
| DR-010 | The system shall support data residency controls allowing organizations to specify the geographic region(s) where their data is stored and processed, to comply with jurisdictional data sovereignty requirements. | Should |
| DR-011 | The system shall maintain an auditable record of all data export and deletion operations, including confirmation of complete deletion across all storage tiers, indexes, backups, and caches. | Must |

### 2.15 Tenant Lifecycle Management

#### 2.15.1 Tenant States & Transitions

| ID | Requirement | Priority |
|----|-------------|----------|
| TL-001 | The system shall implement a formal tenant state machine for organizations with at minimum the following states: **Provisioning**, **Trial** (if applicable), **Active**, **Suspended**, **Offboarding**, and **Deleted**. | Must |
| TL-002 | Each state transition shall be logged in the audit trail with timestamp, initiator (user, system, or automated rule), reason, and previous state. | Must |
| TL-003 | The **Suspended** state shall disable all write operations (ingestion, configuration changes) and optionally disable read access (dashboard queries), while preserving all data. Suspension may be triggered by billing failure, security incident, or administrative action. | Must |
| TL-004 | The **Offboarding** state shall trigger the data export and retention workflow (§2.14.2) and disable all ingestion. The organization shall remain in Offboarding until all data lifecycle obligations are fulfilled, then transition to Deleted. | Must |
| TL-005 | The system shall enforce a configurable grace period between Suspension and Offboarding (default: 30 days), during which the organization can be reactivated by resolving the triggering condition (e.g., updating payment). | Should |
| TL-006 | Workspaces within an organization shall inherit the organization's lifecycle state by default (e.g., suspending an organization suspends all its workspaces), with platform-owner override capability to manage individual workspaces independently. | Must |

#### 2.15.2 Automated Onboarding

| ID | Requirement | Priority |
|----|-------------|----------|
| TL-007 | The system shall provide an automated onboarding workflow that provisions a new organization with: a default workspace, initial RBAC configuration, default resource quotas, pre-built dashboard templates, and sample alert rules — as a single, repeatable process. | Must |
| TL-008 | The onboarding workflow shall support programmatic triggering via API, enabling integration with external billing systems, CRM platforms, or self-service signup flows. | Must |
| TL-009 | The system shall support subscription tier assignment during onboarding (e.g., Free, Pro, Enterprise), with tier-appropriate resource quotas, feature flags, and retention policies applied automatically. | Must |
| TL-010 | The onboarding workflow shall include an onboarding completion tracker that monitors whether the tenant has completed key setup milestones (first agent connected, first traces received, first dashboard configured, first alert rule created) and surfaces incomplete steps to both the tenant and platform operators. | Should |

#### 2.15.3 Offboarding & Data Destruction

| ID | Requirement | Priority |
|----|-------------|----------|
| TL-011 | The offboarding workflow shall execute in a defined sequence: disable ingestion → notify organization admins → export data per tenant request (§2.14.2) → enforce contractual retention period → execute verified deletion across all storage tiers → revoke all API keys and SSO configurations → transition to Deleted. | Must |
| TL-012 | The system shall support tenant-initiated offboarding via the self-service dashboard, with a confirmation step and a configurable cooling-off period (default: 7 days) before data destruction begins. | Should |
| TL-013 | Platform owners shall be able to initiate forced offboarding for policy violations, with appropriate notification to the organization. | Must |
| TL-014 | The system shall provide a compliance certificate or auditable confirmation upon completion of data destruction, verifiable by the tenant or their auditors. | Could |

#### 2.15.4 Tenant Merge & Split

| ID | Requirement | Priority |
|----|-------------|----------|
| TL-015 | The system shall support workspace migration between organizations (e.g., moving a workspace from Organization A to Organization B during an acquisition), preserving all data, configurations, and history. | Could |
| TL-016 | The system shall support organization merging, consolidating users, workspaces, and billing from two organizations into one. | Could |

### 2.16 Per-Tenant Resource Governance

This section defines requirements for per-tenant resource quotas and rate limiting, ensuring fair resource allocation and noisy-neighbor protection. The governance model follows a three-layer inheritance pattern: platform defaults → subscription-tier overrides → per-workspace overrides, informed by Grafana Mimir's per-tenant limits architecture.

#### 2.16.1 Ingestion Rate Limits

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-001 | The system shall enforce configurable per-workspace ingestion rate limits (events per second, bytes per second) with a configurable burst allowance. When limits are exceeded, the system shall apply backpressure (HTTP 429 with Retry-After header) without dropping data from other workspaces. | Must |
| RG-002 | Ingestion rate limits shall be configurable per subscription tier, with platform-owner ability to override per-workspace. Default limits shall be defined per tier and applied automatically during onboarding. | Must |
| RG-003 | The system shall provide real-time visibility into ingestion rate usage (current rate vs. limit) via the self-service dashboard and platform-owner operational views. | Should |
| RG-004 | When a workspace approaches its ingestion rate limit (configurable threshold, e.g., 80%), the system shall alert the workspace admin and platform operators. | Should |

#### 2.16.2 Query Concurrency & Complexity Limits

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-005 | The system shall enforce per-workspace query concurrency limits, capping the number of simultaneous queries a single workspace can execute to prevent monopolization of query resources. | Must |
| RG-006 | The system shall enforce query complexity limits per workspace, including: maximum query time range, maximum series/results returned, and maximum query execution time. Queries exceeding these limits shall be rejected with a descriptive error. | Should |
| RG-007 | Query limits shall be configurable per subscription tier with platform-owner override per workspace. | Should |

#### 2.16.3 Storage Quotas

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-008 | The system shall enforce configurable storage quotas per workspace, tracking total storage consumed across all data types and tiers. | Should |
| RG-009 | When a workspace approaches or exceeds its storage quota, the system shall alert the workspace admin and optionally enforce a policy: block new ingestion, apply accelerated retention (reduce hot-tier retention to free space), or notify and allow overage with billing implications. | Should |
| RG-010 | Storage quota usage shall be visible in the self-service dashboard with breakdown by data type (logs, metrics, traces, evaluation results). | Should |

#### 2.16.4 LLM Endpoint Rate Limits

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-011 | The system shall enforce separate, stricter per-workspace rate limits for LLM-powered endpoints (NL queries, anomaly explanations, dashboard generation, LLM-as-judge evaluation) independent of general API rate limits. LLM inference is GPU-intensive; one workspace's batch operations shall not starve other workspaces' real-time AI features. | Must |
| RG-012 | LLM endpoint rate limits shall be configurable per subscription tier with platform-owner override, and shall be subject to the workspace's LLM token budget (DS-011). | Should |

#### 2.16.5 Resource Governance Infrastructure

| ID | Requirement | Priority |
|----|-------------|----------|
| RG-013 | Resource limits shall follow a three-layer inheritance model: platform-wide defaults → subscription-tier defaults → per-workspace overrides. More specific layers take precedence over less specific layers. | Must |
| RG-014 | Resource limit changes shall be hot-reloadable without system restarts, allowing platform operators to adjust limits in response to operational conditions without disrupting service. | Should |
| RG-015 | The system shall expose resource limit configuration as metrics, enabling platform operators to monitor each workspace's configured limits, current usage, and proximity to thresholds. | Should |
| RG-016 | The system shall maintain a resource governance audit trail recording all limit changes (who changed what limit, from what value, to what value, when). | Should |

### 2.17 Usage Metering & Cost Attribution

| ID | Requirement | Priority |
|----|-------------|----------|
| UM-001 | The system shall meter the following usage dimensions per workspace: traces ingested (count), events/spans per trace (count), log volume ingested (bytes), metric series (active count), storage consumed by tier (bytes), API calls (count), LLM tokens consumed by AI-assisted features (count), and active agent count. | Must |
| UM-002 | Usage metering events shall be idempotent to prevent double-counting, using unique event identifiers and deduplication at the aggregation layer. | Must |
| UM-003 | The system shall aggregate metered usage into daily and monthly summaries per workspace, available via API and the self-service dashboard, with no more than 1-hour lag from real-time. | Must |
| UM-004 | Organization Admins shall have access to a usage dashboard showing aggregated consumption across all workspaces within the organization, with drill-down to individual workspace usage. | Must |
| UM-005 | Platform owners shall have access to usage analytics across all organizations and workspaces, supporting billing reconciliation, capacity planning, and identification of over- or under-consuming tenants. | Must |
| UM-006 | The system shall support usage attribution by configurable tag keys (e.g., agent name, environment, team), allowing organizations to break down consumption by dimensions meaningful to their cost allocation. | Should |
| UM-007 | The system shall provide estimated real-time usage projections, enabling workspaces to see projected monthly cost based on current consumption trends. | Should |
| UM-008 | The system shall expose a metering API for integration with external billing systems, providing structured usage records suitable for invoice generation. | Should |
| UM-009 | Usage data shall be retained for at least 24 months for billing audit purposes, independent of observability data retention policies. | Must |

### 2.18 Tenant Configuration Management

| ID | Requirement | Priority |
|----|-------------|----------|
| TC-001 | The system shall maintain a per-workspace configuration store supporting key-value settings for workspace-specific behavior (e.g., alert preferences, dashboard defaults, evaluation sampling rates, scrubbing rules). | Must |
| TC-002 | Configuration shall follow a three-layer inheritance model: platform defaults → subscription-tier defaults → workspace-specific overrides. Workspace-specific settings take precedence, and unset values inherit from the next higher layer. | Must |
| TC-003 | The system shall support per-organization feature entitlements (feature flags) that gate access to capabilities based on subscription tier (e.g., SSO/SCIM on Enterprise only, custom roles on Pro+, annotation workflows on Pro+). Feature entitlements shall be evaluable at every feature boundary in the system. | Must |
| TC-004 | Platform owners shall be able to enable or disable features for individual organizations independent of their subscription tier, supporting one-off entitlements for beta access, partner agreements, or escalation situations. | Should |
| TC-005 | Workspace Admins shall be able to manage their workspace's integration configurations (webhook URLs, notification channels, external API credentials) through the self-service dashboard without platform-owner involvement. | Should |
| TC-006 | Integration credentials (API keys, webhook secrets) shall be stored encrypted, scoped to the workspace, and not accessible to other workspaces or organizations. | Must |
| TC-007 | All configuration changes shall be recorded in the configuration audit trail with timestamp, author, previous value, and new value. | Must |
| TC-008 | Configuration changes shall be propagated without system restart, enabling runtime reconfiguration of workspace behavior. | Should |

### 2.19 Tenant Health & Operational Visibility

| ID | Requirement | Priority |
|----|-------------|----------|
| TH-001 | The system shall provide a platform-owner tenant health dashboard showing per-organization and per-workspace operational indicators: ingestion rates, query latency, error rates, storage consumption, active agent count, and SLO compliance status. | Must |
| TH-002 | The system shall compute a composite tenant health score per workspace, combining operational indicators (error rates, latency, ingestion stability) with engagement indicators (dashboard usage, alert configuration, API activity), surfacing workspaces that may need attention. | Should |
| TH-003 | The platform-owner dashboard shall support filtering and sorting tenants by subscription tier, health score, usage level, codebase version, and onboarding status. | Should |
| TH-004 | The system shall track onboarding completion per organization, monitoring key milestones (first agent connected, first traces received, first dashboard viewed, first alert configured, SSO configured) and alerting platform operators when organizations stall during onboarding. | Should |
| TH-005 | The system shall detect and alert platform owners on tenant usage anomalies from the platform-owner perspective: unexpected inactivity (tenant stops sending data), consumption spikes that may affect platform capacity, and tenants approaching resource limits. | Should |
| TH-006 | The system shall provide a platform-wide capacity planning view showing aggregate resource utilization, growth trends by tier, and projected capacity needs based on current tenant growth rates. | Could |

### 2.20 Security Audit & Monitoring

This section defines requirements for security event logging, access audit trails, and security-specific monitoring. These requirements consolidate and extend the audit trail references in other sections (TL-002, TC-007, RG-016, DR-011, DS-010, DP-004, SA-006–SA-008) into a unified, auditable specification aligned with NIST SP 800-53 AU-2/AU-3, SOC 2 CC7.1/CC7.2, and ISO 27001 A.8.15/A.8.16.

#### 2.20.1 Audit Event Logging

| ID | Requirement | Priority |
|----|-------------|----------|
| SA-001 | The system shall log all security-relevant events, at minimum: authentication events (login success, login failure, MFA challenge, SSO assertion, session creation, session termination), authorization events (access granted, access denied, privilege elevation), RBAC changes (role assignment, role modification, role revocation, custom role creation), API key lifecycle (creation, rotation, revocation, expiration, usage), data access events (cross-tenant analytics queries, data export requests, bulk operations), configuration changes (retention policy, resource limits, feature entitlements, integration credentials), and tenant lifecycle transitions (provisioning, suspension, offboarding, deletion). | Must |
| SA-002 | Each audit log entry shall include: timestamp (UTC, millisecond precision), event type, actor identity (user ID, service identity, or system), actor source IP and user agent, organization ID, workspace ID (where applicable), target resource, action performed, outcome (success/failure), and a correlation ID linking related events. | Must |
| SA-003 | Audit logs shall be tamper-evident: stored in append-only storage with cryptographic integrity verification (hash chains or equivalent), ensuring that modifications or deletions are detectable. Platform Owners shall not have the ability to modify or delete audit log entries. | Must |
| SA-004 | Audit logs shall be workspace-scoped for tenant-generated events (accessible to Workspace Admins for their own workspace) and platform-scoped for system events (accessible only to Platform Owners). Workspace-scoped audit logs shall not contain events from other workspaces. | Must |
| SA-005 | Audit logs shall be retained for a minimum of 12 months for all event types, with security-critical events (authentication failures, privilege escalations, cross-tenant access, data deletions) retained for a minimum of 24 months. | Must |

#### 2.20.2 AI Feature Audit Logging

| ID | Requirement | Priority |
|----|-------------|----------|
| SA-006 | All AI-assisted feature invocations shall be logged with: workspace ID, user ID, feature type (NL query, anomaly explanation, dashboard generation, LLM-as-judge evaluation, "explain this panel", rule synthesis), LLM model version used, input summary (sanitized), output summary (sanitized), token consumption, and latency. | Must |
| SA-007 | AI audit logs shall be retained for a minimum of 12 months independently of observability data retention, and shall be available for export as part of the workspace's data portability rights (§2.14.2). | Must |
| SA-008 | Prompt injection attempts (both blocked and suspected) shall be logged with the full input (before sanitization), the detection method that triggered, the action taken (block, flag, allow), and the requesting user's identity and workspace context. | Must |

#### 2.20.3 Security Monitoring & Alerting

| ID | Requirement | Priority |
|----|-------------|----------|
| SA-009 | The system shall provide real-time security alerting for: repeated failed authentication attempts exceeding a configurable threshold per user and per source IP, unauthorized cross-workspace access attempts, privilege escalation events, anomalous Platform Owner activity (unusual hours, unusual data access volumes, access to workspaces not in the operator's normal scope), bulk data export initiation, and API key usage from previously unseen source IPs. | Must |
| SA-010 | The system shall provide a platform-owner security posture dashboard showing: authentication failure rates and trends, active prompt injection attempt volumes (across the fleet and per workspace), API key hygiene metrics (expired keys, unused keys, keys without rotation), privileged access usage (JIT elevation frequency, duration, scope), and access review compliance rates (overdue reviews, unresolved findings). | Should |

### 2.21 LLM Security & Tenant Isolation

This section defines requirements for securing the LLM processing layer against cross-tenant data leakage, prompt injection, and supply chain risks. These controls address attack vectors identified by OWASP Top 10 for LLM Applications 2025 (LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM06 Excessive Agency, LLM08 Vector and Embedding Weaknesses), MITRE ATLAS (AML.T0051, AML.T0024, AML.T0020), and the ANSSI/BSI joint guidance on Zero Trust for LLM-based systems.

#### 2.21.1 LLM Service Identity & Data Flow

| ID | Requirement | Priority |
|----|-------------|----------|
| LS-001 | All LLM service components (NL query engine, anomaly explainer, evaluation judge, dashboard generator, rule synthesizer) shall authenticate to data stores using dedicated, workspace-scoped service identities acquired per request. No LLM service component shall hold persistent cross-workspace data access. | Must |
| LS-002 | Workspace isolation filters for all LLM-generated queries and data retrievals shall be applied at the data access layer (database/query engine), independent of LLM output. The LLM shall never control tenant scoping — scoping shall be enforced by the platform regardless of what the LLM generates. | Must |
| LS-003 | All data processing paths — including AI inference, evaluation scoring, RAG retrieval, anomaly detection model training, and LLM-assisted explanations — shall enforce workspace-level data isolation at the processing layer, not solely at the storage layer. Data from one workspace shall never be included in another workspace's LLM context, retrieval results, or model training data. | Must |
| LS-004 | All data shall carry immutable workspace_id and data classification attributes through every processing stage — storage, indexing, retrieval, AI inference, and output generation. Attributes shall be derived from verified credentials at the point of ingestion and shall not be modifiable by downstream processing stages. | Must |

#### 2.21.2 Vector & Embedding Isolation

| ID | Requirement | Priority |
|----|-------------|----------|
| LS-005 | Vector databases and embedding stores used by RAG pipelines (§2.9) shall enforce workspace-level isolation at the database layer — via workspace-partitioned collections, mandatory workspace-filtered queries, or physically separate indexes per workspace. Similarity searches shall never return embeddings from other workspaces. | Must |
| LS-006 | Enterprise workspaces with heightened isolation requirements shall be able to opt into physically siloed vector storage (dedicated indexes) rather than shared infrastructure with logical filtering. | Could |

#### 2.21.3 AI Artifact Isolation

| ID | Requirement | Priority |
|----|-------------|----------|
| LS-007 | All tenant-created AI configurations — prompt templates (§2.10), custom evaluation definitions (§2.7), guardrail rules (§2.8), annotation data (§2.12), and evaluation datasets (§2.7.3) — shall be workspace-scoped and subject to the same isolation guarantees as observability data (MT-002). No workspace's AI artifacts shall be accessible to another workspace. | Must |
| LS-008 | Cache entries for LLM responses, evaluation results, and RAG retrieval results shall be workspace-namespaced. Cache hits shall only be served to the originating workspace. Cache invalidation shall be workspace-scoped without affecting other workspaces. | Should |
| LS-009 | Message queues and event streams used in AI processing pipelines (evaluation scoring, anomaly explanation generation) shall enforce workspace-level routing, ensuring that one workspace's AI processing does not access or interfere with another's. | Should |

#### 2.21.4 AI Supply Chain Security

| ID | Requirement | Priority |
|----|-------------|----------|
| LS-010 | External LLM providers used for evaluation (§2.7), anomaly explanation (§2.4.5), NL queries (§2.5), and dashboard generation shall be subject to documented security assessment, including verification of data isolation practices, data retention policies, and processing location. | Must |
| LS-011 | Contractual agreements with external LLM providers shall include explicit prohibitions on using tenant data for model training, explicit data retention limits, and data processing agreements specifying geographic boundaries consistent with workspace data residency requirements (DR-010). | Must |
| LS-012 | AI model artifacts, libraries, and dependencies used within the platform shall have verified provenance, integrity checks (cryptographic signatures), and documented software bills of materials (SBOMs). Third-party model updates shall be tested in a staging environment before deployment to production. | Should |
| LS-013 | The system shall maintain an inventory of all AI/LLM components in the processing pipeline — including model identifiers, versions, providers, and the features they serve — available to Platform Owners and auditors. | Should |

### 2.22 AI Governance & Oversight

This section defines requirements for human oversight of AI features, AI-specific risk management, and governance controls aligned with the EU AI Act (Regulation 2024/1689, Articles 14 and 17), ISO/IEC 42001:2023, NIST AI Risk Management Framework, and the CSA AI Controls Matrix.

| ID | Requirement | Priority |
|----|-------------|----------|
| AG-001 | Designated users (Workspace Admins and users with AI Oversight permissions per MT-021) shall be able to review, flag, and override AI-generated outputs (anomaly explanations, evaluation scores, NL query results, dashboard suggestions). Flagged outputs shall be logged and surfaceable in access review reports. | Should |
| AG-002 | Platform Owners shall have the ability to halt any AI-powered feature system-wide (global kill switch) or per-workspace in response to safety incidents, with the halt taking effect within 60 seconds and non-AI monitoring functionality remaining fully operational. | Must |
| AG-003 | The system shall maintain documented AI data governance policies specifying how each AI feature accesses, processes, and retains tenant data. Policies shall include purpose limitation (data used only for the specific AI feature's function), retention limits (LLM context not persisted beyond the request lifecycle unless explicitly configured), and cross-workspace contamination prevention controls. | Should |
| AG-004 | Any use of tenant observability data for fleet-wide model training (e.g., anomaly detection baselines per §2.4) shall enforce strict controls preventing cross-workspace data poisoning: input validation on data entering shared models, anomaly detection on training data itself, and the ability to exclude a specific workspace's data from fleet models on request. | Should |
| AG-005 | The system shall maintain a documented AI risk assessment per AI-powered feature, identifying potential failure modes, cross-tenant data leakage vectors, adversarial attack surfaces, and mitigation controls. Risk assessments shall be reviewed annually or when features are significantly modified. | Should |
| AG-006 | The system shall support periodic adversarial testing (red teaming) of LLM-powered features, including prompt injection testing, cross-workspace data leakage probing, and privilege escalation attempts via AI interfaces. Results and remediations shall be documented and tracked. | Should |
| AG-007 | All AI-generated outputs that are presented to users shall include provenance indicators identifying: that the output was AI-generated, which AI feature produced it, and the model version used. Users shall be informed when outputs are AI-generated rather than deterministic query results. | Should |
| AG-008 | The system shall support blast radius containment for AI component failures: compromise or malfunction of any single AI component (LLM provider, evaluation pipeline, anomaly detection model) shall not propagate to other AI components or to non-AI monitoring functionality. Each AI component shall be independently deployable and isolatable. | Should |

---

## 3. Non-Functional Requirements

| ID | Requirement | Category | Target |
|----|-------------|----------|--------|
| NFR-001 | Ingestion pipeline latency from receipt to queryability. | Performance | ≤ 30 seconds (p95) |
| NFR-002 | Self-service dashboard query response time. | Performance | ≤ 5 seconds for standard queries |
| NFR-003 | System uptime for ingestion and alerting pipelines. | Availability | 99.5% monthly |
| NFR-004 | Self-service dashboard availability. | Availability | 99.0% monthly |
| NFR-005 | Alert delivery latency from condition trigger to notification dispatch. | Timeliness | ≤ 3 minutes |
| NFR-006 | The system shall scale horizontally to support onboarding new tenants without performance degradation to existing tenants. | Scalability | — |
| NFR-007 | PII/secret scrubbing shall add no more than negligible overhead to the ingestion pipeline. | Performance | ≤ 5% additional latency |
| NFR-008 | Schema compatibility checks via CI API shall complete within acceptable build-time constraints. | Performance | ≤ 10 seconds per check |
| NFR-009 | All data at rest and in transit shall be encrypted. | Security | AES-256 at rest, TLS 1.2+ in transit |
| NFR-010 | All administrative and data-access actions shall be recorded in an immutable audit log per §2.20. | Compliance | Retained for ≥ 12 months |
| NFR-011 | Stuck/looping agent detection latency from onset to alert. | Timeliness | ≤ 5 minutes |
| NFR-012 | Fleet-wide anomaly detection model shall process incoming data without introducing backpressure on the ingestion pipeline. | Performance | — |
| NFR-013 | Natural-language query translation response time (user-perceived). | Performance | ≤ 5 seconds |
| NFR-014 | LLM-assisted features shall gracefully degrade (fallback to manual mode) when LLM backends are unavailable, without impacting core monitoring functionality. | Resilience | — |
| NFR-015 | AI-generated queries shall never bypass workspace isolation filters, even under adversarial prompt input. | Security | Zero cross-workspace leakage |
| NFR-016 | Per-workspace LLM token consumption shall be metered and reportable for cost attribution. | Observability | — |
| NFR-017 | Online evaluation pipeline latency from trace ingestion to evaluation score availability. | Performance | ≤ 120 seconds (p95) |
| NFR-018 | CI/CD quality gate API response time for a standard evaluation suite. | Performance | ≤ 60 seconds per suite run |
| NFR-019 | Guardrail event ingestion shall not add latency to the core observability ingestion pipeline. | Performance | ≤ 5% additional latency |
| NFR-020 | Cold-tier data rehydration latency. | Performance | ≤ 4 hours |
| NFR-021 | Prompt injection detection for **all LLM-powered features** (§2.5, §2.4.5, §2.7) shall have a false negative rate below acceptable security thresholds. | Security | ≤ 1% false negative rate |
| NFR-022 | Per-workspace ingestion rate limiting shall enforce limits without introducing latency or data loss for other workspaces sharing the same infrastructure. One workspace exceeding its limits shall not degrade ingestion performance for any other workspace. | Isolation | Zero cross-workspace impact |
| NFR-023 | Per-workspace query concurrency limits shall be enforced independently, ensuring that one workspace's heavy query load does not increase query latency for other workspaces. | Isolation | — |
| NFR-024 | SSO authentication (SAML/OIDC) response time shall not add significant latency to user login flows. | Performance | ≤ 3 seconds for SSO round-trip |
| NFR-025 | SCIM provisioning events shall be processed within acceptable latency to ensure timely user creation and — critically — immediate access revocation upon deprovisioning. | Timeliness | ≤ 60 seconds for deprovisioning |
| NFR-026 | Usage metering shall capture all billable events with guaranteed delivery and no data loss, supporting eventual consistency with a maximum lag for billing-grade accuracy. | Reliability | ≤ 1 hour metering lag; zero event loss |
| NFR-027 | Tenant onboarding (from API call to first-data-ready state) shall complete within acceptable time for both automated and self-service flows. | Performance | ≤ 5 minutes |
| NFR-028 | Tenant offboarding data destruction shall be cryptographically verifiable and complete across all storage tiers, indexes, backups, and caches. | Security | Zero residual data post-deletion |
| NFR-029 | Resource limit configuration changes shall propagate to enforcement points without requiring system restarts. | Operability | ≤ 60 seconds propagation delay |
| NFR-030 | Enterprise tenants requiring per-tenant encryption keys (BYOK) shall be supported without performance degradation relative to platform-managed encryption. | Security | ≤ 5% additional latency vs. shared keys |
| NFR-031 | API key revocation shall propagate to all enforcement points within acceptable latency. | Security | ≤ 60 seconds propagation |
| NFR-032 | MFA verification shall not add significant latency to the authentication flow. | Performance | ≤ 3 seconds for MFA round-trip |
| NFR-033 | Audit log writes shall not introduce backpressure on the operations being logged. Audit logging shall use asynchronous, guaranteed-delivery mechanisms. | Performance | ≤ 1% additional latency on audited operations |
| NFR-034 | Security alerts (failed auth threshold, cross-workspace access attempts, privilege escalation) shall be delivered to Platform Owner notification channels within acceptable latency. | Timeliness | ≤ 60 seconds |
| NFR-035 | LLM output scanning for cross-workspace data leakage (DS-015) shall not add significant latency to AI feature response times. | Performance | ≤ 500ms additional latency per response |
| NFR-036 | Platform Owner JIT elevation (MT-040) shall be provisioned within acceptable latency while maintaining full audit trail integrity. | Performance | ≤ 30 seconds from request to active elevation |
| NFR-037 | AI global kill switch (AG-002) shall halt the targeted AI feature(s) across all workspaces within acceptable latency. | Timeliness | ≤ 60 seconds |
| NFR-038 | All internal service-to-service communication shall be mutually authenticated (mTLS or equivalent service mesh identity). No service shall grant access to another service based solely on network location. | Security | Zero unauthenticated internal calls |

---

## 4. Glossary

| Term | Definition |
|------|------------|
| **Organization** | The top-level tenant entity representing a billing, identity, and administrative boundary. An organization contains one or more workspaces, manages subscription tier and SSO/SCIM configuration, and serves as the unit for billing and user management. |
| **Workspace** | The primary trust and data isolation boundary within an organization. Each workspace has independent API keys, data isolation, RBAC, resource quotas, and configuration. Workspaces map to teams, departments, or environments within a customer's structure. |
| **Project** | A logical grouping within a workspace for organizing agents, traces, dashboards, and alert rules by application or purpose. Projects share the workspace's data isolation boundary and do not enforce independent access control. |
| **Tenant** | A generic term encompassing any organizational entity (organization, workspace) whose observability data is logically isolated within the platform. In most contexts, "tenant" refers to a workspace as the primary data isolation unit. |
| **AI Agent** | An autonomous software component, built on the common agent codebase, that executes multi-step tasks using LLM reasoning, tool calls, and external integrations on behalf of a tenant. AI agents are the primary producers of logs, metrics, and traces in this system. |
| **Common Codebase** | The shared agent framework from which all tenant AI agents are instantiated. Ensures homogeneous log structures, metric names, error categories, and trace schemas **within a given version** across tenants, enabling version-partitioned fleet-wide anomaly baselines. |
| **RBAC** | Role-Based Access Control — a method of restricting system access based on assigned roles (e.g., Admin, Operator, Viewer), enforced at each level of the tenant hierarchy. |
| **Separation of Duties** | A security principle requiring that no single individual can complete a critical action alone — e.g., users cannot elevate their own roles, and security-critical changes require approval from a second authorized party. Enforced per NIST AC-5 and SOC 2 CC6.3. |
| **MFA** | Multi-Factor Authentication — an authentication mechanism requiring two or more independent verification factors (knowledge, possession, inherence). Required for all accounts, with phishing-resistant methods (FIDO2/WebAuthn) required for privileged roles. |
| **SSO** | Single Sign-On — an authentication mechanism allowing users to access the platform using credentials from their organization's identity provider (via SAML 2.0 or OIDC), configured per organization. |
| **SCIM** | System for Cross-domain Identity Management — a protocol (SCIM 2.0) for automating user provisioning and deprovisioning between an identity provider and the platform, ensuring user lifecycle events propagate automatically. |
| **JIT Provisioning** | Just-In-Time Provisioning — a lightweight alternative to SCIM where user accounts are created automatically on first SSO login, with roles derived from SAML assertions or OIDC claims. Does not handle deprovisioning as cleanly as SCIM. |
| **JIT Elevation** | Just-In-Time Privilege Elevation — a privileged access management pattern where cross-tenant or administrative access is granted temporarily upon request with automatic expiration, rather than assigned persistently. Used for Platform Owner access per MT-040. |
| **Step-Up Authentication** | Re-authentication required before performing sensitive operations, even when the user has an active session. Ensures that high-risk actions are explicitly authorized by the current user at the time of action. |
| **Break-Glass Access** | An emergency access procedure that bypasses normal JIT elevation controls when immediate action is required. Subject to dual authorization, strict time limits, and mandatory post-incident review per MT-042. |
| **BOLA** | Broken Object Level Authorization — an API vulnerability (OWASP API1:2023) where an attacker manipulates resource identifiers to access resources belonging to other tenants. Mitigated by composite key lookups (workspace_id + resource_id) at the data access layer per MT-012. |
| **Tenant Context Propagation** | The mechanism by which verified workspace identity (derived from authenticated credentials) flows immutably through every service boundary in the processing pipeline, ensuring all downstream services operate within the correct tenant scope. A foundational multi-tenancy requirement per AWS SaaS Lens. Defined in MT-011. |
| **Data Classification** | A scheme categorizing all platform data types by sensitivity (Confidential, Internal, Restricted, Integrity-Protected) to drive access control, encryption, masking, and retention requirements per MT-048. |
| **Prompt Injection** | An attack technique (OWASP LLM01:2025, MITRE ATLAS AML.T0051) where malicious input causes an LLM to deviate from its intended behavior. Direct injection targets user-facing LLM features; indirect injection embeds malicious payloads in data processed by LLMs. |
| **Indirect Prompt Injection** | A variant of prompt injection where malicious content is embedded in data sources (logs, traces, tool outputs) rather than direct user input, exploiting the LLM when it processes that data for anomaly explanation, evaluation, or summarization. Mitigated by DS-016. |
| **LLM Service Identity** | A workspace-scoped service credential acquired per request by LLM processing components, ensuring AI features authenticate to data stores with minimum necessary access scoped to the requesting workspace. Defined in LS-001. |
| **AI Kill Switch** | A platform-wide or per-workspace mechanism to immediately halt AI-powered features in response to safety incidents, without affecting non-AI monitoring functionality. Defined in AG-002 with ≤60s SLA per NFR-037. |
| **AI Supply Chain** | The chain of external dependencies used by AI features: LLM providers, model artifacts, embedding models, evaluation frameworks, and their associated data processing agreements, provenance verification, and integrity controls. Governed by LS-010 through LS-013. |
| **Tamper-Evident Logging** | An audit logging architecture where log entries are stored in append-only storage with cryptographic integrity verification (hash chains or equivalent), making any modification or deletion detectable. Required per SA-003 for compliance with SOC 2 CC7.1 and ISO 27001 A.8.15. |
| **Observability Data** | The collective term for logs, metrics, and distributed traces emitted by a tenant's AI agents. |
| **PII** | Personally Identifiable Information — any data that can be used to identify an individual (e.g., email, phone number, IP address). |
| **Scrubbing** | The process of detecting and redacting sensitive data (secrets, PII, LLM prompt content) from ingested telemetry before it reaches storage. |
| **Schema Registry** | A centralized catalog that stores versioned definitions of event, log, and metric structures, enforcing consistency across the common agent codebase and its consumers. |
| **Cardinality** | The number of unique values a metric label can take. High cardinality (e.g., using user IDs as labels) causes storage and query performance degradation. |
| **Compatibility Check** | An automated validation that a proposed schema change does not break existing consumers (backward-compatible) or producers (forward-compatible). |
| **Fleet-Wide Baseline** | An anomaly detection model trained across all workspaces **running the same codebase version**, leveraging log and trace homogeneity within a version to detect structural anomalies. Separate baselines are maintained per active version. |
| **Per-Workspace Volume Baseline** | A lightweight time-series model per workspace that tracks rate and volume indicators normalized to that workspace's own historical patterns and scale. Version-independent. |
| **Peer Group** | A classification of workspaces by scale tier **and codebase version** used for comparative anomaly detection. |
| **Stuck / Looping Agent** | An AI agent that continues to emit data but shows no meaningful progress — identified by repeated identical tool-call sequences, cycling LLM outputs, or step counts exceeding a threshold. |
| **Loop Signature** | A pattern definition for stuck agent detection. Defined once globally due to codebase homogeneity, with version-specific threshold overrides where needed. |
| **Version-Transition Anomaly** | An anomaly class specific to codebase upgrades: a metric regression that correlates with a tenant changing from one codebase version to another. Detected by Layer 4. |
| **Version Rollout (Mixed Versions)** | A transitional state where a workspace's agents are running more than one codebase version simultaneously. The system must attribute telemetry and anomalies to the correct version using `agent_version` metadata. |
| **Stale-Version Workspace** | A workspace still running a codebase version that most or all other workspaces have migrated away from. Platform owners receive advisory alerts. |
| **Baseline Learning Period** | A configurable window after a new codebase version is deployed during which structural alerts for that version are suppressed. |
| **LLM Explanation Layer** | An on-demand AI capability that generates natural-language root-cause hypotheses for detected anomalies, scoped to the requesting workspace's data and subject to token budgets. |
| **Rule Synthesis** | An offline process where an LLM generates lightweight detection rules from historical anomaly patterns for zero-LLM-cost runtime execution. |
| **Cross-Tenant Analytics** | Aggregated or comparative queries that span multiple organizations and workspaces, accessible only to platform owners. |
| **Platform Owner** | An operator or administrator of the monitoring system itself, with cross-tenant visibility for management and support. Cross-tenant access is provisioned via JIT elevation with automatic expiration (MT-040), not persistent grants. |
| **Ingestion Pipeline** | The data processing path from initial receipt of telemetry through scrubbing, validation, rate-limit enforcement, and persistence to queryable storage. |
| **Token Budget** | A configurable per-workspace limit on LLM tokens consumed by AI-assisted features, enforced to control cost. |
| **GenAI Semantic Conventions** | OpenTelemetry-standardized attribute schemas for AI/LLM interactions. |
| **OpenInference** | An open-source specification from Arize defining AI-specific span types. Adopted by Phoenix, Langfuse, and OpenLLMetry. |
| **AEOP** | AI Evaluation and Observability Platform — a Gartner-defined market category (February 2026). |
| **Online Evaluation** | Asynchronous scoring of production agent traces against quality dimensions without adding latency to the agent execution path. |
| **LLM-as-Judge** | An evaluation methodology where an LLM scores another LLM's output against specified quality criteria. |
| **Quality Gate** | A CI/CD checkpoint that runs an evaluation suite and blocks or warns on deployment if quality scores fall below thresholds. |
| **Production-to-Test-Case Flywheel** | A workflow where production failures are promoted into curated evaluation datasets, creating a self-improving test suite. |
| **Guardrail** | A runtime safety mechanism applied to agent inputs or outputs. Guardrail events are monitored as first-class telemetry per §2.8. |
| **RAG Pipeline** | Retrieval-Augmented Generation — an agent architecture pattern. Each component is monitored as a distinct trace span per §2.9. |
| **Embedding Drift** | A shift in the distribution of embedding vectors over time that may degrade retrieval quality. |
| **Prompt Template** | A versioned, parameterized text template tracked in the prompt registry per §2.10. |
| **Session** | A cohesive grouping of multiple agent traces belonging to a single multi-turn interaction per §2.13. |
| **Annotation** | A human-provided label or comment attached to an agent trace during review per §2.12. |
| **Tiered Storage** | A data lifecycle architecture with hot, warm, and cold tiers per §2.14. |
| **Tenant Lifecycle** | The formal state machine governing a tenant's progression from creation through deletion per §2.15. |
| **Subscription Tier** | A product packaging level (e.g., Free, Pro, Enterprise) that determines feature entitlements and resource quotas. |
| **Resource Governance** | Per-workspace limits on ingestion rates, query concurrency, storage, and LLM endpoint usage per §2.16. |
| **Noisy Neighbor** | A condition where one tenant's resource consumption degrades performance for other tenants. Mitigated per §2.16 and NFR-022/NFR-023. |
| **Usage Metering** | Capture and aggregation of billable consumption events per workspace per §2.17. Distinct from operational metrics. |
| **Hot-Reloadable Configuration** | Resource limits and feature flags updatable at runtime without restarts per RG-014 and TC-008. |
| **BYOK** | Bring Your Own Key — enterprise tenants manage their own encryption keys per NFR-030. |
| **Tenant Health Score** | A composite metric per workspace combining operational and engagement indicators per TH-002. |
| **Data Residency** | Geographic constraints on where tenant data is stored and processed per DR-010. |

---

## Appendix A: Anomaly Detection Architecture Rationale

The five-layer anomaly detection architecture (version-partitioned fleet-wide structural → per-workspace volume → peer-group comparison → version-transition detection → LLM explanation) is specifically designed for AI agents sharing a common codebase where multiple versions may coexist in production.

**Why fleet-wide baselines are partitioned by version:** All agents on a given version emit the same log formats, error types, and trace structures — so a single model per version can learn "what normal looks like" without per-workspace training. However, different versions may introduce new log fields, change error categories, or alter trace spans. A single unversioned model would flood operators with false positives every time any workspace upgrades. Version partitioning ensures that a novel error in v2.3 is flagged, while the same error in v2.4 (where it was intentionally introduced) is not.

**Why new versions bootstrap from prior versions:** When v2.4 first deploys, there's minimal data to train on. Bootstrapping from v2.3's model provides a reasonable starting point. A configurable learning period suppresses structural alerts while the new baseline adapts, avoiding false positives during the early rollout window.

**Why per-workspace volume baselines are still necessary and version-independent:** Although log structures are identical within a version, the rate at which they occur varies dramatically by workspace. Volume baselines track "how much" rather than "what kind," making them largely insensitive to version changes — 500 errors/10min is anomalous for a small workspace regardless of which version produced them. A transition dampening window handles the expected volume shifts during upgrades.

**Why peer-group comparison must be version-aware:** Comparing a workspace on v2.3 against peers on v2.4 would produce false signals if the versions have different baseline error rates. Peer groups are therefore scoped to same-version, same-scale-tier cohorts. This also enables a powerful insight: when a workspace on v2.4 deviates from other v2.4 workspaces of similar size, it points to a workspace-specific issue, not a version issue.

**Why version-transition detection is its own layer:** Neither fleet-wide baselines nor volume baselines naturally capture the pattern "this workspace was healthy on v2.3, upgraded to v2.4, and immediately degraded." This requires explicit before/after comparison correlated with the version-change event. It catches regressions introduced by new versions that may be "normal" for the new version's baseline but harmful relative to the workspace's prior experience. It also detects stale-version workspaces that may be stuck on old versions for non-obvious reasons.

**Why LLM explanations are on-demand, not inline:** Generating natural-language explanations for every anomaly would be prohibitively expensive and noisy. Instead, explanations are triggered by user action (clicking "explain this anomaly" in the dashboard) or by high-severity alerts, and are always subject to per-workspace token budgets.

---

## Appendix B: Evaluation Architecture Rationale

The evaluation integration (§2.7) is designed to align with the Gartner AEOP category definition while complementing the existing anomaly detection architecture rather than replacing it.

**Why evaluation is separate from anomaly detection:** Anomaly detection (§2.4) answers "is something unusual happening?" using statistical baselines — it detects structural deviations, volume spikes, and version regressions. Evaluation answers "is the agent producing good output?" using quality scoring — it detects correctness failures, hallucinations, and safety violations that may occur within statistically normal operating parameters. An agent can produce low-quality output without triggering any anomaly, and conversely an anomaly (e.g., a latency spike) may not affect output quality. Both perspectives are necessary.

**Why online evaluation is asynchronous:** Evaluating every trace inline would add unacceptable latency to the agent path and create a hard dependency on LLM-as-judge availability. Asynchronous evaluation decouples scoring from execution, allowing the system to process evaluation at its own pace without backpressure. Sampling-based evaluation further manages cost for LLM-as-judge scoring.

**Why CI/CD quality gates are a first-class requirement:** The market benchmarking revealed that quality gates preventing regressions before deployment are now a category-defining capability. They complement the version-transition anomaly detection (§2.4.4) — quality gates catch regressions before they reach production, while version-transition detection catches regressions that slip through.

**Why the production-to-test-case flywheel is included:** This creates a self-improving evaluation dataset that captures real-world failure modes. Without it, evaluation suites drift away from production reality over time, reducing their effectiveness as quality gates.

---

## Appendix C: NFR Target Rationale

v3.0 relaxed several NFR targets relative to v2.1 to reflect operationally sustainable commitments informed by market benchmarking.

**Uptime (NFR-003, NFR-004):** The v2.1 target of 99.9% for ingestion and alerting (~43 min/month downtime) exceeded the published SLAs of Datadog (99.8%) and New Relic (99.8%). Given that even Datadog experienced an 11-hour outage in 2023 that breached its SLA, the 99.5% target (~3.6 hours/month) is more operationally realistic for an early-stage platform while still exceeding most AI-native monitoring tools, which publish no SLA at all. Dashboard availability is further relaxed to 99.0% (~7.3 hours/month) as a non-critical-path component. These targets should be revisited upward as the platform matures.

**Alert delivery (NFR-005):** The v2.1 target of ≤60 seconds was 5× faster than PagerDuty's published SLA of 5 minutes — the only vendor with a comparable published commitment. The revised target of ≤3 minutes remains significantly faster than PagerDuty while being achievable without the streaming evaluation infrastructure required for sub-minute delivery. This can be tightened as an engineering investment once the platform stabilizes.

**Dashboard query response time (NFR-002):** Relaxed from ≤3 seconds to ≤5 seconds to account for the increased query complexity introduced by evaluation scores, guardrail events, session aggregations, and RAG metrics in v3.0. The ≤5 second target remains within the 1–5 second range typical of enterprise observability tools.

---

## Appendix D: Tenant Model Architecture Rationale

v4.0 significantly expanded the tenant model based on benchmarking against Datadog, New Relic, Grafana Cloud, LangSmith, Langfuse, Arize, and cloud provider multi-tenancy guidance (AWS Well-Architected SaaS Lens, Azure Architecture Center).

**Why a three-level hierarchy (Organization → Workspace → Project):** Every mature observability platform uses multi-level hierarchy rather than flat tenant isolation. The specific levels are informed by LangSmith's model (where Workspaces are the primary trust boundary with independent RBAC and API keys) and Datadog's multi-org architecture (where child organizations provide full data siloing). Organizations handle billing and identity — concerns that naturally span multiple teams. Workspaces provide the data isolation boundary — the unit at which RBAC, API keys, resource quotas, and retention are independently configured. Projects provide lightweight grouping within a workspace without additional isolation overhead.

**Why SSO/SCIM is a Must requirement:** Enterprise security teams universally require centralized identity management for procurement approval. Without SSO, enterprises cannot enforce their security policies (MFA, conditional access, session management). Without SCIM, they cannot guarantee immediate access revocation when employees leave — a compliance liability. Every competing platform gates SSO/SCIM behind an Enterprise tier, confirming it as a market expectation rather than a differentiator. Per-organization IdP configuration (not global) is essential because different customers use different identity providers.

**Why formal tenant lifecycle management:** Azure's Architecture Center and AWS's SaaS Lens both prescribe explicit lifecycle state machines with automated onboarding and offboarding. Without defined states (Provisioning, Trial, Active, Suspended, Offboarding, Deleted), operational edge cases become ad-hoc: What happens when a customer stops paying? What happens to their data? How is access revoked? These questions need deterministic answers for compliance (GDPR right to erasure), operational stability (preventing resource leaks from abandoned tenants), and customer trust (transparent offboarding).

**Why per-workspace resource governance with hot-reloadable limits:** Grafana Mimir's architecture demonstrates that 50+ per-tenant limits, hot-reloadable without restarts, is both achievable and operationally necessary at scale. The three-layer inheritance model (platform defaults → tier defaults → workspace overrides) balances simplicity (most workspaces use tier defaults) with flexibility (specific workspaces can be tuned). Without per-workspace rate limiting at the ingestion, query, and API layers, one workspace's telemetry flood or runaway query can degrade the entire platform — the classic noisy-neighbor problem that AWS identifies as a critical multi-tenant anti-pattern.

**Why usage metering is a separate concern from operational metrics:** AWS's SaaS Architecture Fundamentals distinguishes metering (billable consumption events with guaranteed delivery and idempotency) from metrics (operational health indicators with best-effort delivery). Metering requires different reliability guarantees — losing a billing event is a revenue leak, while losing an operational metric is a monitoring gap. Separating these concerns ensures that billing accuracy is not compromised by operational monitoring optimizations.

**Why tenant health scoring for platform owners:** AWS's SaaS Lens recommends "tenant-aware operational views" as a design principle. Platform operators need to know not just whether the system is healthy overall, but whether each tenant is healthy individually. Composite health scores enable proactive management — identifying onboarding stalls, engagement drops, or degraded performance before tenants file support tickets or churn.

---

## Appendix E: Security Architecture Rationale

v5.0 added comprehensive security controls informed by a gap analysis against seven security frameworks. This appendix explains the architectural reasoning behind the new requirements.

**Why MFA is a Must requirement (MT-030–031):** Every framework examined — NIST SP 800-53 IA-2(1), SOC 2 CC6.1/CC6.6, ISO 27001 A.8.5 — requires multi-factor authentication. For a SaaS platform where all access is external, MFA is not optional. Phishing-resistant MFA (FIDO2/WebAuthn) for privileged accounts reflects NIST guidance that password + SMS/TOTP is insufficient for administrative access. Platform-enforced MFA ensures protection for organizations not yet using SSO, while SSO-enforced organizations can delegate MFA to their IdP to avoid friction.

**Why session management is explicit (MT-032–035):** v4.0 delegated session behavior implicitly to SSO providers, but many tenants use local authentication (especially on Free/Pro tiers). Without platform-level session controls, there are no idle timeouts, no concurrent session limits, and no session invalidation on role change — all of which SOC 2 CC6.1 expects. Step-up re-authentication (MT-034) prevents session hijacking from escalating to administrative actions.

**Why privileged access management is a dedicated section (MT-039–043):** The Platform Owner role has the highest-impact access in the system — cross-tenant data access, lifecycle management, configuration changes. ISO 27001 A.8.2 requires formal controls for privileged access including time-limited elevation and enhanced monitoring. JIT elevation (MT-040) ensures Platform Owners don't hold persistent cross-tenant access, reducing the blast radius of credential compromise. Break-glass procedures (MT-042) provide a governed emergency path that's auditable, unlike ad-hoc workarounds.

**Why separation of duties is explicit (MT-020):** NIST AC-5 and SOC 2 CC6.3 require documented duty separation. The specific constraints chosen — no self-elevation, dual approval for admin role changes, Platform Owners cannot modify audit logs — address the most common separation-of-duties audit findings in SaaS platforms.

**Why access reviews have specific cadences (MT-044–046):** SOC 2 CC6.3 requires periodic access review, and auditors sample evidence of completed reviews during the examination period. Quarterly for workspace access and monthly for privileged access reflects industry practice. Automated dormant/orphaned account detection (MT-046) reduces the manual burden while catching the most common access hygiene failures.

**Why LLM security is a dedicated section (§2.21):** Traditional RBAC and database-level isolation are necessary but insufficient for AI features. The LLM processing layer introduces attack vectors that operate above the data access layer: prompt injection can manipulate query generation, shared vector stores can leak embeddings across workspaces, and LLM service accounts with cross-workspace access turn any injection into a cross-tenant breach. OWASP LLM Top 10 2025 (LLM01, LLM02, LLM06, LLM08) and MITRE ATLAS (AML.T0051, AML.T0024) document these risks specifically. The key architectural principle is that workspace scoping must be enforced at the data access layer (LS-002), never delegated to the LLM itself — because LLMs can be manipulated by adversarial input.

**Why indirect prompt injection defense is included (DS-013, DS-016):** The system's LLM features process tenant observability data — logs, traces, error messages — that could contain malicious content. An attacker could embed LLM instructions in their agent's log output, which would then be processed by the anomaly explanation or evaluation features. Without sanitization (DS-016), this creates an indirect injection path. The ANSSI/BSI joint guidance on Zero Trust for LLM systems specifically recommends treating all data fed to LLMs as untrusted, regardless of its source.

**Why AI supply chain controls are Must priority (LS-010–011):** The system uses external LLM providers for multiple features. Without contractual controls, tenant data sent for evaluation or explanation could be retained by the provider for model training — a data privacy violation that no amount of platform-level encryption can prevent. This is the most commonly raised concern in enterprise AI procurement.

**Why AI governance includes a kill switch (AG-002):** The EU AI Act Article 14 requires human oversight including the ability to halt AI operations. Beyond compliance, this is operationally essential: if a prompt injection vulnerability is discovered in production, the platform needs to disable affected AI features immediately without taking down the entire monitoring system. The 60-second SLA (NFR-037) ensures rapid response while blast radius containment (AG-008) ensures non-AI features continue operating.

**Why audit logging is a dedicated section (§2.20) rather than scattered references:** v4.0 referenced audit trails in 8 different sections but never specified what events are logged, what fields each entry contains, or how tamper-evidence is achieved. A SOC 2 auditor needs a single, reviewable specification they can test against. Consolidating audit requirements into §2.20 while keeping the cross-references in other sections provides both the auditable specification and the contextual traceability.

---

*End of document.*
