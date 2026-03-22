import express from 'express';
import cors from 'cors';
import { viewsRouter } from './routes/views.js';

const app = express();
const port = parseInt(process.env.BFF_PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// Health / readiness
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/ready', (_req, res) => {
  // TODO: check ClickHouse connectivity
  res.json({ status: 'ready' });
});

// Views API
app.use('/api/views', viewsRouter);

app.listen(port, () => {
  console.log(`BFF listening on http://localhost:${port}`);
});
