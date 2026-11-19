import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getAvailableModels } from './src/lib/providers';
import {
  runConversationalTurn,
  runCostRealityCheck,
  runGroupSynthesis,
  runLiveSuggestions,
  runLocalGemsDiscovery,
  runPlanBGenerator,
  runSurpriseMe,
  runWeatherAdaptation,
  runWeatherFetch,
} from './src/lib/agentEngine';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const apiRouter = express.Router();

apiRouter.get('/status', async (_req: Request, res: Response) => {
  const models = await getAvailableModels();
  res.json({
    gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    openrouter: Boolean((process.env.OPENROUTER_API_KEY || '').trim()),
    tavily: Boolean((process.env.TAVILY_API_KEY || '').trim()),
    maps: Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY),
    availableModels: models,
  });
});

apiRouter.get('/maps-key', (_req: Request, res: Response) => {
  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  res.json({ key });
});

apiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { trip, userMessage, model } = req.body || {};
    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      res.status(400).json({ error: 'userMessage is required.' });
      return;
    }
    const result = await runConversationalTurn({
      trip: trip || {},
      userMessage: userMessage.trim(),
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/chat] error:', err);
    res.status(500).json({ error: err?.message || 'Conversational AI request failed.' });
  }
});

apiRouter.post('/weather', async (req: Request, res: Response) => {
  try {
    const { destination, country, lat, lon } = req.body || {};
    const snapshot = await runWeatherFetch({ destination, country, lat, lon });
    res.json(snapshot);
  } catch (err: any) {
    console.error('[/api/weather] error:', err);
    res.status(500).json({ error: err?.message || 'Unable to fetch live weather.' });
  }
});

apiRouter.post('/weather/adapt', async (req: Request, res: Response) => {
  try {
    const { trip, model } = req.body || {};
    if (!trip) {
      res.status(400).json({ error: 'trip state is required.' });
      return;
    }
    const result = await runWeatherAdaptation({ trip, model });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/weather/adapt] error:', err);
    res.status(500).json({ error: err?.message || 'Weather adaptation failed.' });
  }
});

apiRouter.post('/plan-b', async (req: Request, res: Response) => {
  try {
    const { trip, cancelledStop, reason, model } = req.body || {};
    const result = await runPlanBGenerator({
      trip: trip || {},
      cancelledStop,
      reason: reason || 'Venue is closed, crowded, or disrupted',
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/plan-b] error:', err);
    res.status(500).json({ error: err?.message || 'Plan B generation failed.' });
  }
});

apiRouter.post('/live/suggest', async (req: Request, res: Response) => {
  try {
    const { trip, locationLabel, lat, lon, remainingHours, mood, model } = req.body || {};
    const result = await runLiveSuggestions({
      trip: trip || {},
      locationLabel: locationLabel || '',
      lat: typeof lat === 'number' ? lat : undefined,
      lon: typeof lon === 'number' ? lon : undefined,
      remainingHours: Number(remainingHours) || 3,
      mood,
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/live/suggest] error:', err);
    res.status(500).json({ error: err?.message || 'Live companion suggestions failed.' });
  }
});

apiRouter.post('/budget/reality-check', async (req: Request, res: Response) => {
  try {
    const { trip, overrideBudget, overrideCurrency, model } = req.body || {};
    const result = await runCostRealityCheck({
      trip: trip || {},
      overrideBudget: overrideBudget !== undefined ? Number(overrideBudget) : undefined,
      overrideCurrency,
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/budget/reality-check] error:', err);
    res.status(500).json({ error: err?.message || 'Cost reality check failed.' });
  }
});

apiRouter.post('/group/synthesize', async (req: Request, res: Response) => {
  try {
    const { trip, members, model } = req.body || {};
    const result = await runGroupSynthesis({
      trip: trip || {},
      members: members || [],
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/group/synthesize] error:', err);
    res.status(500).json({ error: err?.message || 'Group consensus synthesis failed.' });
  }
});

apiRouter.post('/discover/surprise', async (req: Request, res: Response) => {
  try {
    const { origin, budget, currency, durationDays, personality, vibe, model } = req.body || {};
    const result = await runSurpriseMe({
      origin: origin || '',
      budget: Number(budget) || 1500,
      currency: currency || 'USD',
      durationDays: Number(durationDays) || 5,
      personality: personality || 'Curious Explorer',
      vibe: vibe || 'Culture, food & hidden neighborhoods',
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/discover/surprise] error:', err);
    res.status(500).json({ error: err?.message || 'Surprise Me discovery failed.' });
  }
});

apiRouter.post('/discover/gems', async (req: Request, res: Response) => {
  try {
    const { destination, country, focus, currency, model } = req.body || {};
    const result = await runLocalGemsDiscovery({
      destination: destination || '',
      country,
      focus,
      currency,
      model,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[/api/discover/gems] error:', err);
    res.status(500).json({ error: err?.message || 'Local gems discovery failed.' });
  }
});

app.use('/api', apiRouter);
app.use('/', apiRouter);

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
