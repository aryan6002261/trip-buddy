import { GoogleGenAI } from '@google/genai';
import type {
  AIModelDefinition,
  AIProviderId,
  GroundingSource,
  WeatherDayForecast,
  WeatherSnapshot,
} from '../types.js';

let cachedGeminiClient: GoogleGenAI | null = null;
let geminiAuthState: 'unknown' | 'valid' | 'invalid' = 'unknown';
const geocodeCache = new Map<string, { lat: number; lon: number; displayName?: string } | null>();

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  if (!cachedGeminiClient) {
    const isVertexExpressKey = apiKey.startsWith('AQ.');
    cachedGeminiClient = new GoogleGenAI({
      apiKey,
      ...(isVertexExpressKey ? { vertexai: true } : {}),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        timeout: 22000,
      },
    });
  }
  return cachedGeminiClient;
}

function isAuthError(err: Error): boolean {
  const msg = err.message || '';
  return (
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
    msg.includes('API key not valid') ||
    msg.includes('"code":401') ||
    msg.includes('401')
  );
}

async function checkGeminiKeyHealth(): Promise<boolean> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    geminiAuthState = 'invalid';
    return false;
  }
  if (geminiAuthState === 'valid') return true;
  if (geminiAuthState === 'invalid') return false;

  // Standard Gemini Developer API keys begin with "AIza".
  if (apiKey.startsWith('AIza')) {
    geminiAuthState = 'valid';
    return true;
  }

  // If OpenRouter is available and GEMINI_API_KEY is a non-AIza token (e.g. AQ.),
  // avoid burning cold-start seconds on a guaranteed 401 probe on Vercel.
  if (apiKey.startsWith('AQ.') && (process.env.OPENROUTER_API_KEY || '').trim()) {
    geminiAuthState = 'invalid';
    return false;
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      geminiAuthState = 'invalid';
      return false;
    }
    await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'ok',
    });
    geminiAuthState = 'valid';
    return true;
  } catch (err: any) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (isAuthError(e)) {
      geminiAuthState = 'invalid';
      return false;
    }
    geminiAuthState = 'valid';
    return true;
  }
}

export async function getAvailableModels(): Promise<AIModelDefinition[]> {
  const models: AIModelDefinition[] = [];
  const hasGeminiKey = Boolean((process.env.GEMINI_API_KEY || '').trim());
  const hasOpenRouterKey = Boolean((process.env.OPENROUTER_API_KEY || '').trim());
  const geminiHealthy = hasGeminiKey ? await checkGeminiKeyHealth() : false;

  const geminiModels: AIModelDefinition[] = hasGeminiKey
    ? [
        {
          id: 'gemini-4-hydrogen',
          label: 'Gemini 4 Hydrogen',
          provider: 'gemini',
          note: 'Deep conversational planner & Search grounding',
        },
        {
          id: 'gemini-3.1-flash-lite',
          label: 'Gemini 3.1 Flash Lite',
          provider: 'gemini',
          note: 'Ultra-fast responses & rapid edits',
        },
      ]
    : [];

  // Fast, low-latency OpenRouter models first to guarantee <6s responses on Vercel
  const openRouterModels: AIModelDefinition[] = hasOpenRouterKey
    ? [
        {
          id: 'openrouter/openai/gpt-4o-mini',
          label: 'OpenRouter · GPT-4o Mini (Fast)',
          provider: 'openrouter',
          note: 'Ultra-fast (~2s) reliable planning',
        },
        {
          id: 'openrouter/google/gemini-2.5-flash',
          label: 'OpenRouter · Gemini 2.5 Flash',
          provider: 'openrouter',
          note: 'Fast global travel reasoning',
        },
        {
          id: 'openrouter/deepseek/deepseek-chat',
          label: 'OpenRouter · DeepSeek Chat',
          provider: 'openrouter',
          note: 'Strong multi-step itinerary reasoning',
        },
        {
          id: 'openrouter/auto',
          label: 'OpenRouter Auto',
          provider: 'openrouter',
          note: 'Automatic router',
        },
      ]
    : [];

  if (geminiHealthy) {
    models.push(...geminiModels, ...openRouterModels);
  } else if (hasOpenRouterKey) {
    models.push(...openRouterModels, ...geminiModels);
  } else {
    models.push(...geminiModels);
  }

  return models;
}

export interface AICallOptions {
  model?: AIProviderId | string;
  systemInstruction: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  useSearchGrounding?: boolean;
  expectJson?: boolean;
  maxTokens?: number;
}

export interface AICallResult {
  text: string;
  modelUsed: string;
  groundingSources: GroundingSource[];
}

async function callGeminiModel(
  modelName: string,
  options: AICallOptions
): Promise<AICallResult> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const contents = options.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // IMPORTANT: Never pass temperature, topP, topK, or candidateCount to gemini-4-hydrogen.
  const config: Record<string, any> = {
    systemInstruction: options.systemInstruction,
  };

  if (options.useSearchGrounding) {
    config.tools = [{ googleSearch: {} }];
  } else if (options.expectJson) {
    config.responseMimeType = 'application/json';
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config,
  });

  const text = response.text || '';
  const groundingSources: GroundingSource[] = [];

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (chunk?.web?.uri) {
        groundingSources.push({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri,
          provider: 'google-search',
        });
      }
    }
  }

  return {
    text,
    modelUsed: modelName,
    groundingSources,
  };
}

async function callOpenRouterModel(
  requestedModel: string,
  options: AICallOptions
): Promise<AICallResult> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured on the server.');
  }

  const cleanModel = requestedModel.replace(/^openrouter\//, '') || 'openai/gpt-4o-mini';
  const modelId = cleanModel === 'auto' ? 'openrouter/auto' : cleanModel;

  const payload: Record<string, any> = {
    model: modelId,
    max_tokens: options.maxTokens ?? 2600,
    messages: [
      { role: 'system', content: options.systemInstruction },
      ...options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  };

  if (options.expectJson && !modelId.includes('gemma')) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tripbuddy.local',
      'X-Title': 'TripBuddy AI Travel Companion',
    },
    body: JSON.stringify(payload),
    signal: timeoutSignal(20000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter (${modelId}) error ${response.status}: ${errText.slice(0, 220)}`);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const actualModel = data?.model ? `openrouter/${data.model}` : requestedModel;

  return {
    text,
    modelUsed: actualModel,
    groundingSources: [],
  };
}

function formatReadableProviderError(err: Error | null): Error {
  if (!err) {
    return new Error('Unable to reach the configured AI providers. Please try again.');
  }
  if (err.name === 'TimeoutError' || err.message.toLowerCase().includes('timeout')) {
    return new Error('The AI provider timed out. Try switching to GPT-4o Mini (Fast) and retry.');
  }
  if (isAuthError(err)) {
    return new Error(
      'The configured GEMINI_API_KEY was rejected by Google (401 Unauthenticated). Update your Gemini API key in Settings or select an OpenRouter model.'
    );
  }
  return err;
}

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const hasGeminiKey = Boolean((process.env.GEMINI_API_KEY || '').trim());
  const hasOpenRouterKey = Boolean((process.env.OPENROUTER_API_KEY || '').trim());

  if (!hasGeminiKey && !hasOpenRouterKey) {
    throw new Error('No AI provider API keys (GEMINI_API_KEY or OPENROUTER_API_KEY) are configured.');
  }

  const geminiUsable = hasGeminiKey ? await checkGeminiKeyHealth() : false;
  const defaultOpenRouter = 'openrouter/openai/gpt-4o-mini';
  const requested =
    options.model || (geminiUsable ? 'gemini-4-hydrogen' : hasOpenRouterKey ? defaultOpenRouter : 'gemini-4-hydrogen');

  const attempts: Array<{ provider: 'gemini' | 'openrouter'; run: () => Promise<AICallResult> }> = [];

  if (requested.startsWith('openrouter/')) {
    if (hasOpenRouterKey) {
      // Avoid routing slow openrouter/auto first when user didn't explicitly pick a slow model
      const primaryModel = requested === 'openrouter/auto' ? 'openrouter/openai/gpt-4o-mini' : requested;
      attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel(primaryModel, options) });
      if (primaryModel !== 'openrouter/openai/gpt-4o-mini') {
        attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel('openrouter/openai/gpt-4o-mini', options) });
      }
      if (primaryModel !== 'openrouter/google/gemini-2.5-flash') {
        attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel('openrouter/google/gemini-2.5-flash', options) });
      }
    }
    if (geminiUsable) {
      attempts.push({ provider: 'gemini', run: () => callGeminiModel('gemini-3.1-flash-lite', { ...options, useSearchGrounding: false }) });
    }
  } else {
    if (geminiUsable) {
      if (options.useSearchGrounding) {
        attempts.push({ provider: 'gemini', run: () => callGeminiModel(requested, options) });
      }
      attempts.push({ provider: 'gemini', run: () => callGeminiModel(requested, { ...options, useSearchGrounding: false }) });
      const altGemini = requested === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
      attempts.push({ provider: 'gemini', run: () => callGeminiModel(altGemini, { ...options, useSearchGrounding: false }) });
    }
    if (hasOpenRouterKey) {
      attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel('openrouter/openai/gpt-4o-mini', options) });
      attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel('openrouter/google/gemini-2.5-flash', options) });
    } else if (hasGeminiKey && !geminiUsable) {
      attempts.push({ provider: 'gemini', run: () => callGeminiModel(requested, { ...options, useSearchGrounding: false }) });
    }
  }

  let lastError: Error | null = null;
  let geminiAuthFailed = false;

  for (const attempt of attempts) {
    if (attempt.provider === 'gemini' && geminiAuthFailed) {
      continue;
    }
    try {
      const result = await attempt.run();
      if (result.text && result.text.trim()) {
        return result;
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt.provider === 'gemini' && isAuthError(lastError)) {
        geminiAuthFailed = true;
        geminiAuthState = 'invalid';
      }
    }
  }

  throw formatReadableProviderError(lastError);
}

export function extractJsonObject<T = any>(rawText: string): T | null {
  if (!rawText) return null;
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      // continue
    }
  }

  return null;
}

export interface TavilyArticle {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  sourceName: string;
}

export interface TavilySearchOutput {
  contextText: string;
  sources: GroundingSource[];
  articles: TavilyArticle[];
}

function extractDomainName(uri: string): string {
  try {
    const host = new URL(uri).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return 'Trusted Source';
  }
}

export async function tavilySearch(
  query: string,
  maxResults = 4,
  topic: 'general' | 'news' = 'general',
  days?: number
): Promise<TavilySearchOutput> {
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  if (!apiKey || !query.trim()) {
    return { contextText: '', sources: [], articles: [] };
  }

  try {
    const body: Record<string, any> = {
      api_key: apiKey,
      query: query.trim(),
      search_depth: 'basic',
      topic,
      max_results: maxResults,
      include_answer: true,
    };
    if (topic === 'news' && days) {
      body.days = days;
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(5500),
    });

    if (!response.ok) {
      return { contextText: '', sources: [], articles: [] };
    }

    const data: any = await response.json();
    const sources: GroundingSource[] = [];
    const articles: TavilyArticle[] = [];
    const lines: string[] = [];

    if (data.answer) {
      lines.push(`Summary: ${data.answer}`);
    }

    if (Array.isArray(data.results)) {
      for (const item of data.results) {
        if (item.url) {
          const sourceName = extractDomainName(item.url);
          sources.push({
            title: item.title || sourceName,
            uri: item.url,
            provider: 'tavily',
          });
          articles.push({
            title: item.title || sourceName,
            url: item.url,
            content: (item.content || '').slice(0, 340),
            publishedDate: item.published_date || undefined,
            sourceName,
          });
        }
        if (item.title || item.content) {
          lines.push(
            `- [${extractDomainName(item.url || '')}] ${item.title || 'Update'}${item.published_date ? ` (${item.published_date})` : ''}: ${(item.content || '').slice(0, 280)}`
          );
        }
      }
    }

    return {
      contextText: lines.join('\n'),
      sources,
      articles,
    };
  } catch {
    return { contextText: '', sources: [], articles: [] };
  }
}

export async function tavilyAreaNewsSearch(location: string): Promise<TavilySearchOutput> {
  if (!location.trim()) {
    return { contextText: '', sources: [], articles: [] };
  }

  const [breakingNews, eventsAdvisories] = await Promise.all([
    tavilySearch(
      `${location} latest news today transit strike weather alert closure travel advisory`,
      5,
      'news',
      7
    ),
    tavilySearch(
      `${location} local events festivals exhibitions closures travel updates this week`,
      4,
      'general'
    ),
  ]);

  const seenUrls = new Set<string>();
  const articles: TavilyArticle[] = [];
  for (const a of [...breakingNews.articles, ...eventsAdvisories.articles]) {
    if (!a.url || seenUrls.has(a.url)) continue;
    seenUrls.add(a.url);
    articles.push(a);
  }

  return {
    contextText: [breakingNews.contextText, eventsAdvisories.contextText].filter(Boolean).join('\n'),
    sources: dedupeSources([...breakingNews.sources, ...eventsAdvisories.sources]),
    articles: articles.slice(0, 8),
  };
}

export async function geocodePlace(
  query: string,
  nearContext?: string
): Promise<{ lat: number; lon: number; displayName?: string } | null> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  const fullQuery =
    nearContext && !cleanQuery.toLowerCase().includes(nearContext.toLowerCase())
      ? `${cleanQuery}, ${nearContext}`
      : cleanQuery;

  const cacheKey = fullQuery.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  // 1. Try Google Maps Geocoding API (fast, ~150ms)
  const googleKey = (process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullQuery)}&key=${encodeURIComponent(googleKey)}`;
      const res = await fetch(url, { signal: timeoutSignal(2200) });
      if (res.ok) {
        const data: any = await res.json();
        const first = data?.results?.[0];
        if (data?.status === 'OK' && first?.geometry?.location) {
          const result = {
            lat: Number(first.geometry.location.lat),
            lon: Number(first.geometry.location.lng),
            displayName: first.formatted_address,
          };
          geocodeCache.set(cacheKey, result);
          return result;
        }
      }
    } catch {
      // fall through
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim with tight 2s timeout
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fullQuery)}`;
    const res = await fetch(nomUrl, {
      headers: { 'User-Agent': 'TripBuddyTravelCompanion/2.0' },
      signal: timeoutSignal(2200),
    });
    if (res.ok) {
      const arr: any[] = await res.json();
      if (Array.isArray(arr) && arr[0]?.lat && arr[0]?.lon) {
        const result = {
          lat: parseFloat(arr[0].lat),
          lon: parseFloat(arr[0].lon),
          displayName: arr[0].display_name,
        };
        geocodeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {
    // ignore timeout
  }

  geocodeCache.set(cacheKey, null);
  return null;
}

function decodeWmoCode(code: number): { condition: string; isRain: boolean; severity: WeatherDayForecast['severity'] } {
  if (code === 0) return { condition: 'Clear Sky', isRain: false, severity: 'clear' };
  if (code === 1 || code === 2) return { condition: 'Partly Cloudy', isRain: false, severity: 'clear' };
  if (code === 3) return { condition: 'Overcast', isRain: false, severity: 'mild' };
  if (code === 45 || code === 48) return { condition: 'Fog & Mist', isRain: false, severity: 'mild' };
  if (code >= 51 && code <= 57) return { condition: 'Light Drizzle', isRain: true, severity: 'caution' };
  if (code >= 61 && code <= 65) return { condition: 'Rain Showers', isRain: true, severity: 'disruptive' };
  if (code >= 66 && code <= 67) return { condition: 'Freezing Rain', isRain: true, severity: 'disruptive' };
  if (code >= 71 && code <= 77) return { condition: 'Snowfall', isRain: true, severity: 'disruptive' };
  if (code >= 80 && code <= 82) return { condition: 'Heavy Rain Showers', isRain: true, severity: 'disruptive' };
  if (code >= 85 && code <= 86) return { condition: 'Snow Showers', isRain: true, severity: 'disruptive' };
  if (code >= 95) return { condition: 'Thunderstorms', isRain: true, severity: 'disruptive' };
  return { condition: 'Variable Conditions', isRain: false, severity: 'mild' };
}

export async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
  locationName: string
): Promise<WeatherSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;

  const res = await fetch(url, { signal: timeoutSignal(4500) });
  if (!res.ok) {
    throw new Error(`Open-Meteo weather request failed (${res.status})`);
  }

  const data: any = await res.json();
  const currentCode = Number(data?.current?.weather_code ?? 0);
  const currentDecoded = decodeWmoCode(currentCode);

  const dates: string[] = data?.daily?.time || [];
  const maxTemps: number[] = data?.daily?.temperature_2m_max || [];
  const minTemps: number[] = data?.daily?.temperature_2m_min || [];
  const precipProbs: number[] = data?.daily?.precipitation_probability_max || [];
  const codes: number[] = data?.daily?.weather_code || [];

  const daily: WeatherDayForecast[] = dates.map((date, idx) => {
    const code = Number(codes[idx] ?? 0);
    const decoded = decodeWmoCode(code);
    const tMax = Math.round(Number(maxTemps[idx] ?? 20));
    const tMin = Math.round(Number(minTemps[idx] ?? 12));
    const prob = Math.round(Number(precipProbs[idx] ?? 0));

    let severity = decoded.severity;
    let advisory = 'Ideal for outdoor exploration and walking.';

    if (tMax >= 36) {
      severity = 'disruptive';
      advisory = 'Extreme heat expected — shift midday stops indoors or to shaded venues.';
    } else if (tMin <= -2) {
      severity = 'caution';
      advisory = 'Sub-zero cold — prioritize warm cafés, museums, and shorter walks.';
    } else if (prob >= 60 || decoded.severity === 'disruptive') {
      severity = 'disruptive';
      advisory = 'High chance of rain — swap exposed outdoor sightseeing for indoor gems.';
    } else if (prob >= 35 || decoded.severity === 'caution') {
      severity = 'caution';
      advisory = 'Passing showers possible — keep a nearby indoor Plan B handy.';
    }

    return {
      date,
      tempMax: tMax,
      tempMin: tMin,
      precipitationProb: prob,
      weatherCode: code,
      condition: decoded.condition,
      severity,
      advisory,
    };
  });

  return {
    locationName,
    lat,
    lon,
    currentTemp: Math.round(Number(data?.current?.temperature_2m ?? 20)),
    currentCondition: currentDecoded.condition,
    currentWindKmh: Math.round(Number(data?.current?.wind_speed_10m ?? 8)),
    isRaining: currentDecoded.isRain || Number(data?.current?.precipitation ?? 0) > 0.2,
    daily,
    fetchedAt: new Date().toISOString(),
  };
}

export function dedupeSources(sources: GroundingSource[]): GroundingSource[] {
  const seen = new Set<string>();
  const out: GroundingSource[] = [];
  for (const s of sources) {
    if (!s.uri || seen.has(s.uri)) continue;
    seen.add(s.uri);
    out.push(s);
  }
  return out.slice(0, 10);
}
