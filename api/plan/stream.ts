import { executePlanPipeline } from '../../src/lib/planner.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_request } = req.body || {};

  if (!user_request || typeof user_request !== 'string' || !user_request.trim()) {
    return res.status(400).json({ error: 'user_request is required' });
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };

  try {
    await executePlanPipeline(user_request, sendEvent);
    res.write('event: done\ndata: {}\n\n');
    res.end();
  } catch (err: any) {
    console.error('Vercel api/plan/stream error:', err);
    sendEvent('error', {
      message: err.message || 'Something went wrong while planning your trip.',
    });
    res.end();
  }
}
