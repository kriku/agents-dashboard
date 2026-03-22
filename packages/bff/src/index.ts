import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { ping } from './clickhouse/client.js';
import { authMiddleware } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { viewsRouter } from './routes/views.js';
import { workspacesRouter } from './routes/workspaces.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// --- Unauthenticated routes ---

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/ready', async (_req, res) => {
  const ok = await ping();
  if (ok) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready', error: 'ClickHouse unreachable' });
  }
});

app.use('/api/auth', authRouter);

// --- Auth middleware for everything below ---
app.use('/api', authMiddleware);

// --- Authenticated routes ---
app.use('/api/views', viewsRouter);
app.use('/api/workspaces', workspacesRouter);

app.listen(config.port, () => {
  logger.info(`BFF listening on http://localhost:${config.port}`);
});
