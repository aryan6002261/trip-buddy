import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { executePlanPipeline } from './src/lib/planner';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// Status Route
// ---------------------------------------------------------
const handleStatus = (_req: Request, res: Response) => {
  const geminiOk = Boolean(process.env.GEMINI_API_KEY);
  const openrouterOk = Boolean(process.env.OPENROUTER_API_KEY);
  const tavilyOk = Boolean(process.env.TAVILY_API_KEY);

  res.json({
    ai_model: geminiOk || openrouterOk,
    web_search: tavilyOk,
    provider: geminiOk ? 'Google Gemini 3.8 Flash' : (openrouterOk ? 'OpenRouter' : 'Local Fallback'),
    services: {
      gemini: geminiOk,
      openrouter: openrouterOk,
      tavily: tavilyOk,
    },
  });
};

// ---------------------------------------------------------
// Plan Streaming Route (SSE)
// ---------------------------------------------------------
const handlePlanStream = async (req: Request, res: Response) => {
  const { user_request } = req.body || {};

  if (!user_request || typeof user_request !== 'string' || !user_request.trim()) {
    res.status(400).json({ error: 'user_request is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await executePlanPipeline(user_request, sendEvent);
    res.write('event: done\ndata: {}\n\n');
    res.end();
  } catch (err: any) {
    console.error('Plan stream error:', err);
    sendEvent('error', {
      message: err.message || 'Something went wrong while planning your trip.',
    });
    res.end();
  }
};

// ---------------------------------------------------------
// Plan JSON Route (Direct fallback)
// ---------------------------------------------------------
const handlePlanJSON = async (req: Request, res: Response) => {
  const { user_request } = req.body || {};

  if (!user_request || typeof user_request !== 'string' || !user_request.trim()) {
    res.status(400).json({ error: 'user_request is required' });
    return;
  }

  try {
    const result = await executePlanPipeline(user_request);
    res.json(result);
  } catch (err: any) {
    console.error('Plan JSON error:', err);
    res.status(500).json({
      error: err.message || 'Something went wrong while planning your trip.',
    });
  }
};

// ---------------------------------------------------------
// Mount Routes on both '/api' and '/'
// ---------------------------------------------------------
const apiRouter = express.Router();
apiRouter.get('/status', handleStatus);
apiRouter.post('/plan/stream', handlePlanStream);
apiRouter.post('/plan', handlePlanJSON);

app.use('/api', apiRouter);
app.use('/', apiRouter);

// ---------------------------------------------------------
// Vite Integration for Dev / Static Serving for Prod
// ---------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`TripBuddy server running at http://0.0.0.0:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
