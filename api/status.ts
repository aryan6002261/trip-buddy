export default function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const geminiOk = Boolean(process.env.GEMINI_API_KEY);
  const openrouterOk = Boolean(process.env.OPENROUTER_API_KEY);
  const tavilyOk = Boolean(process.env.TAVILY_API_KEY);

  return res.status(200).json({
    ai_model: geminiOk || openrouterOk,
    web_search: tavilyOk,
    provider: geminiOk ? 'Google Gemini 3.8 Flash' : (openrouterOk ? 'OpenRouter' : 'Local Fallback'),
    services: {
      gemini: geminiOk,
      openrouter: openrouterOk,
      tavily: tavilyOk,
    },
  });
}
