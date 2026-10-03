import { executePlanPipeline } from '../src/lib/planner';

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

  try {
    const result = await executePlanPipeline(user_request);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Vercel api/plan error:', err);
    return res.status(500).json({
      error: err.message || 'Something went wrong while planning your trip.',
    });
  }
}
