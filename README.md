# Agent Monitor

Multi-tenant AI agent monitoring dashboard — monorepo with pnpm workspaces.

## Structure

```
packages/
├── frontend/     # React SPA (Vite + TanStack Query + uPlot/ECharts)
├── bff/          # Express.js API server (Backend-for-Frontend)
├── clickhouse/   # Schema migrations + seed scripts
└── shared/       # Shared TypeScript types
```

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm 9+
corepack enable

# Install dependencies
pnpm install

# Start ClickHouse + BFF
docker compose up -d

# Seed sample data
pnpm --filter @agent-monitor/clickhouse seed

# Start frontend dev server
pnpm dev:frontend
```

## Development

```bash
pnpm dev:frontend    # Vite dev server (port 5173)
pnpm dev:bff         # BFF with hot reload (port 3001)
pnpm test            # Run all tests
pnpm build           # Build all packages
```

## Specs

- `specs/00-core-requirements.md` — Functional and non-functional requirements
- `specs/01-development-plan.md` — Implementation roadmap
