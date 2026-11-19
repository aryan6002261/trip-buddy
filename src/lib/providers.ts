import { GoogleGenAI } from '@google/genai';
import {
  AIModelDefinition,
  AIProviderId,
  GroundingSource,
  WeatherDayForecast,
  WeatherSnapshot,
} from '../types';

let cachedGeminiClient: GoogleGenAI | null = null;
let geminiAuthState: 'unknown' | 'valid' | 'invalid' = 'unknown';
const geocodeCache = new Map<string, { lat: number; lon: number; displayName?: string } | null>();

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

  // Standard Gemini Developer API keys begin with "AIza". Non-AIza tokens (e.g. AQ.)
  // are verified once so we don't repeatedly fail with 401 on every user chat turn.
  if (apiKey.startsWith('AIza')) {
    geminiAuthState = 'valid';
    return true;
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
    // Transient or model error — keep available
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

  const openRouterModels: AIModelDefinition[] = hasOpenRouterKey
    ? [
        {
          id: 'openrouter/auto',
          label: 'OpenRouter Auto',
          provider: 'openrouter',
          note: 'Automatic best-fit router',
        },
        {
          id: 'openrouter/google/gemini-2.5-flash',
          label: 'OpenRouter · Gemini 2.5 Flash',
          provider: 'openrouter',
          note: 'Fast travel reasoning via OpenRouter',
        },
        {
          id: 'openrouter/openai/gpt-4o-mini',
          label: 'OpenRouter · GPT-4o Mini',
          provider: 'openrouter',
          note: 'Reliable structured planning',
        },
        {
          id: 'openrouter/deepseek/deepseek-chat',
          label: 'OpenRouter · DeepSeek Chat',
          provider: 'openrouter',
          note: 'Strong multi-step reasoning',
        },
      ]
    : [];

  if (geminiHealthy) {
    models.push(...geminiModels, ...openRouterModels);
  } else if (hasOpenRouterKey) {
    // Prioritize verified working OpenRouter models first when Gemini key is unauthenticated
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

  const cleanModel = requestedModel.replace(/^openrouter\//, '') || 'openrouter/auto';
  const modelId = cleanModel === 'auto' ? 'openrouter/auto' : cleanModel;

  const payload: Record<string, any> = {
    model: modelId,
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
  if (isAuthError(err)) {
    return new Error(
      'The configured GEMINI_API_KEY was rejected by Google (401 Unauthenticated). Update your Gemini API key in Settings > Secrets or select an OpenRouter model.'
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
  const requested =
    options.model || (geminiUsable ? 'gemini-4-hydrogen' : hasOpenRouterKey ? 'openrouter/auto' : 'gemini-4-hydrogen');

  const attempts: Array<{ provider: 'gemini' | 'openrouter'; run: () => Promise<AICallResult> }> = [];

  if (requested.startsWith('openrouter/')) {
    if (hasOpenRouterKey) {
      attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel(requested, options) });
      if (requested !== 'openrouter/auto') {
        attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel('openrouter/auto', options) });
      }
    }
    if (geminiUsable) {
      attempts.push({ provider: 'gemini', run: () => callGeminiModel('gemini-4-hydrogen', { ...options, useSearchGrounding: false }) });
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
      attempts.push({ provider: 'openrouter', run: () => callOpenRouterModel('openrouter/auto', options) });
    } else if (hasGeminiKey && !geminiUsable) {
      // Only try Gemini directly if no other provider exists, so the user sees the clear auth error
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

  // Direct parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  // Fenced JSON block
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // First { to last }
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

export interface TavilySearchOutput {
  contextText: string;
  sources: GroundingSource[];
}

export async function tavilySearch(
  query: string,
  maxResults = 5,
  topic: 'general' | 'news' = 'general'
): Promise<TavilySearchOutput> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !query.trim()) {
    return { contextText: '', sources: [] };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.trim(),
        search_depth: 'basic',
        topic,
        max_results: maxResults,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      console.warn(`Tavily search returned ${response.status} for query: ${query}`);
      return { contextText: '', sources: [] };
    }

    const data: any = await response.json();
    const sources: GroundingSource[] = [];
    const lines: string[] = [];

    if (data.answer) {
      lines.push(`Summary: ${data.answer}`);
    }

    if (Array.isArray(data.results)) {
      for (const item of data.results) {
        if (item.url) {
          sources.push({
            title: item.title || item.url,
            uri: item.url,
            provider: 'tavily',
          });
        }
        if (item.title || item.content) {
          lines.push(`- ${item.title || 'Source'}: ${(item.content || '').slice(0, 320)}`);
        }
      }
    }

    return {
      contextText: lines.join('\n'),
      sources,
    };
  } catch (err: any) {
    console.warn('Tavily search failed:', err?.message || err);
    return { contextText: '', sources: [] };
  }
}

export async function geocodePlace(
  query: string,
  nearContext?: string
): Promise<{ lat: number; lon: number; displayName?: string } | null> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  const fullQuery = nearContext && !cleanQuery.toLowerCase().includes(nearContext.toLowerCase())
    ? `${cleanQuery}, ${nearContext}`
    : cleanQuery;

  const cacheKey = fullQuery.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  // 1. Try Google Maps Geocoding API if key is available
  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullQuery)}&key=${encodeURIComponent(googleKey)}`;
      const res = await fetch(url);
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
      // fall through to Nominatim
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim (free, global)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fullQuery)}`;
    const res = await fetch(nomUrl, {
      headers: { 'User-Agent': 'TripBuddyTravelCompanion/2.0' },
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
    // ignore
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

  const res = await fetch(url);
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
