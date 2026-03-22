FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/bff/package.json packages/bff/
RUN pnpm install --frozen-lockfile --filter @agent-monitor/bff...

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/bff/ packages/bff/

# Build
RUN pnpm --filter @agent-monitor/bff run build

EXPOSE 3001
CMD ["node", "packages/bff/dist/index.js"]
