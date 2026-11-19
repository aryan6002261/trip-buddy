import type {
  AIProviderId,
  AreaNewsFeed,
  AreaNewsItem,
  ChatTurnResponse,
  CostRealityCheckResult,
  GroupConsensus,
  GroupMember,
  HiddenGemItem,
  ItineraryDay,
  ItineraryStop,
  LiveSuggestion,
  PlanBAlternative,
  SurprisePitch,
  TripGuidance,
  TripPatch,
  TripWorkspace,
  WeatherSnapshot,
} from '../types.js';
import {
  callAI,
  dedupeSources,
  extractJsonObject,
  fetchOpenMeteoWeather,
  geocodePlace,
  tavilyAreaNewsSearch,
  tavilySearch,
} from './providers.js';
import { getCurrencySymbol } from './storage.js';

const CURRENT_YEAR = new Date().getFullYear();

function hasValidCoords(lat?: number, lon?: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    (Math.abs(lat) > 0.01 || Math.abs(lon) > 0.01)
  );
}

async function geocodeWithBudget<T>(promise: Promise<T>, fallback: T, ms = 2400): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function geocodeStopsBatch(
  days: ItineraryDay[],
  destinationContext: string
): Promise<ItineraryDay[]> {
  const missing: Array<{ dayIdx: number; stopIdx: number; query: string }> = [];
  const normalizedDays: ItineraryDay[] = days.map((day, dIdx) => ({
    ...day,
    stops: (day.stops || []).map((stop, sIdx) => {
      const safeId = stop.id || `stop-d${day.day}-${sIdx + 1}-${Date.now().toString(36)}`;
      const cleaned: ItineraryStop = {
        ...stop,
        id: safeId,
        day: day.day,
        estimatedCost: Number(stop.estimatedCost) || 0,
      };
      if (!hasValidCoords(cleaned.lat, cleaned.lon) && missing.length < 6) {
        const searchLabel = cleaned.neighborhood
          ? `${cleaned.title}, ${cleaned.neighborhood}`
          : cleaned.title;
        missing.push({ dayIdx: dIdx, stopIdx: sIdx, query: searchLabel });
      }
      return cleaned;
    }),
  }));

  if (missing.length === 0 || !destinationContext) {
    return normalizedDays;
  }

  await geocodeWithBudget(
    Promise.all(
      missing.map(async (item) => {
        const geo = await geocodePlace(item.query, destinationContext);
        if (geo) {
          normalizedDays[item.dayIdx].stops[item.stopIdx].lat = geo.lat;
          normalizedDays[item.dayIdx].stops[item.stopIdx].lon = geo.lon;
        }
      })
    ),
    undefined,
    2500
  );

  return normalizedDays;
}

function summarizeTripState(trip: Partial<TripWorkspace>): string {
  const daysSummary = (trip.days || [])
    .map(
      (d) =>
        `Day ${d.day} (${d.title}): ${(d.stops || [])
          .map(
            (s) =>
              `[${s.status}] ${s.timeWindow} ${s.title} (${s.indoorOutdoor}, ~${trip.currencySymbol || '$'}${s.estimatedCost})`
          )
          .join('; ')}`
    )
    .join('\n');

  const customSummary = (trip.customSections || []).map((s) => `- ${s.title}`).join('\n');

  const groupSummary = (trip.groupMembers || [])
    .map(
      (m) =>
        `- ${m.name}: max ${trip.currencySymbol || '$'}${m.maxBudget ?? 0}, pace=${m.pace || 'balanced'}, interests=[${(m.interests || []).join(', ')}], mustHaves=[${(m.mustHaves || []).join(', ')}], vetoes=[${(m.vetoes || []).join(', ')}]`
    )
    .join('\n');

  const spentTotal = (trip.expenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const totalStops = (trip.days || []).reduce((s, d) => s + (d.stops?.length || 0), 0);
  const completedStops = (trip.days || []).reduce(
    (s, d) => s + (d.stops || []).filter((st) => st.status === 'completed').length,
    0
  );

  return `CURRENT TRIP WORKSPACE STATE:
- Title: ${trip.title || 'Not set yet'}
- Origin: ${trip.origin || 'Not specified yet'}
- Destination: ${trip.destination || 'Not chosen yet'}${trip.country ? `, ${trip.country}` : ''}
- Duration: ${trip.durationDays ? `${trip.durationDays} days` : 'Not set yet'}
- Start Date: ${trip.startDate || 'Flexible'}
- Currency: ${trip.currency || 'USD'} (${trip.currencySymbol || '$'})
- Target Budget: ${trip.targetBudget ? `${trip.currencySymbol || '$'}${trip.targetBudget}` : 'Not set yet'}
- Travelers: ${trip.travelersCount || 1}
- Spent So Far: ${trip.currencySymbol || '$'}${spentTotal}
- Progress: ${completedStops}/${totalStops} stops completed
- Active Mode: ${trip.mode || 'planning'}
- AI Local Friend Mode: ${trip.localFriendMode ? 'ON (speak like a savvy local resident, avoid tourist traps)' : 'OFF'}
- Pace & Energy Profile: wake=${trip.paceProfile?.wakeWindow || 'balanced'}, pace=${trip.paceProfile?.pace || 'moderate'}, walking=${trip.paceProfile?.walkingTolerance || 'medium'}, restBuffer=${trip.paceProfile?.restBufferMinutes ?? 45}m
- Live Location Context: ${trip.liveLocation?.label || trip.destination || 'Unknown'} (${trip.liveLocation?.remainingHours || 4}h remaining today)
- Live Weather: ${trip.weather ? `${trip.weather.currentTemp}°C ${trip.weather.currentCondition}, Wind ${trip.weather.currentWindKmh} km/h` : 'Not fetched yet'}
- Existing Custom Sections: ${customSummary || 'None'}
- Group Roster:\n${groupSummary || 'Solo / Not configured'}
- Existing Itinerary:\n${daysSummary || 'No itinerary built yet'}`;
}

export async function runConversationalTurn(params: {
  trip: Partial<TripWorkspace>;
  userMessage: string;
  model?: AIProviderId;
}): Promise<ChatTurnResponse> {
  const { trip, userMessage, model } = params;
  const allSources = [];

  const destHint = trip.destination || '';
  const searchNeeded =
    userMessage.length > 14 &&
    !['yes', 'no', 'ok', 'thanks', 'sure'].includes(userMessage.trim().toLowerCase());

  let liveResearchBlock = '';
  if (searchNeeded) {
    const queryBase = destHint
      ? `${destHint} ${userMessage.slice(0, 90)} ${trip.localFriendMode ? 'local hidden gems non-touristy' : ''} ${CURRENT_YEAR}`
      : `${userMessage.slice(0, 110)} travel guide prices ${CURRENT_YEAR}`;
    const searchRes = await tavilySearch(queryBase, 4);
    if (searchRes.contextText) {
      liveResearchBlock = `\nRECENT WEB RESEARCH (Tavily ${CURRENT_YEAR}):\n${searchRes.contextText}\n`;
      allSources.push(...searchRes.sources);
    }
  }

  const systemInstruction = `You are TripBuddy — a sharp, warm, globally knowledgeable AI travel companion and strategist (year ${CURRENT_YEAR}).

CORE BEHAVIORAL RULES (STRICT):
1. TALK FIRST BEFORE CONCLUDING: If the user gives a broad or incomplete trip request (missing destination, origin, rough budget/currency, duration, travel style, or group context) and has NOT explicitly asked you to "just build it now", DO NOT dump a full itinerary yet! Instead, react thoughtfully, offer 1–2 smart observations, and ask 2–4 concise clarifying questions. Provide 3–4 clickable quickReplies so they can answer fast.
2. NO RIGID PRE-MADE HEADINGS: Never output canned boilerplate headings unless the user asked for them. Write naturally like a human strategist. Only create or update customSections for specific topics the user asks about.
3. GLOBAL-FIRST & RECENT DATA: Never default to India or INR unless the user asks for India/INR. Match the user's stated currency or the destination's natural currency. Ground prices, transit, and openings in the current ${CURRENT_YEAR} live research provided.
4. AI LOCAL FRIEND MODE: ${trip.localFriendMode ? 'CURRENTLY ACTIVE — Speak like a trusted local resident. Steer away from overcrowded tourist traps and recommend neighborhood cafés, family-run eateries, underrated galleries, local transit hacks, and real etiquette.' : 'Currently off — give balanced, authentic travel advice.'}
5. ACTIVE MODE (${trip.mode === 'live' ? 'LIVE TRIP COMPANION' : 'PRE-TRIP PLANNING'}): ${
    trip.mode === 'live'
      ? 'The traveler is currently ON THE TRIP. Be immediate, practical, and location/time/weather aware.'
      : 'Help refine preferences, stress-test budget realism, optimize routes & energy pace, and build/update the itinerary interactively.'
  }
6. RESPECT PACE & GROUP CONSTRAINTS: Honor Pace & Energy Profile and any Group Member vetoes or budget ceilings.
7. REALISTIC COST REASONING & MAP COORDINATES: Always provide realistic market-grounded budget estimates AND accurate real-world decimal lat/lon coordinates for destination, stops, and hidden gems so the route map pins render immediately.

OUTPUT FORMAT (STRICT JSON ONLY):
Return a single valid JSON object:
{
  "phase": "clarifying" | "planning" | "updating" | "live-guidance",
  "reply": "Natural, helpful markdown conversational response.",
  "quickReplies": ["Short clickable follow-up option 1", "Option 2", "Option 3"],
  "appliedUpdates": ["Short plain-English note of each workspace change made, or empty array if clarifying"],
  "tripPatch": {
    "title": "Optional concise trip title",
    "origin": "Optional origin city",
    "destination": "Optional destination city",
    "country": "Optional country",
    "lat": 38.7223,
    "lon": -9.1393,
    "durationDays": 5,
    "startDate": "Optional date or season",
    "currency": "USD",
    "targetBudget": 2200,
    "travelersCount": 2,
    "paceProfile": { "wakeWindow": "late", "pace": "relaxed", "walkingTolerance": "medium", "restBufferMinutes": 60 },
    "budgetEstimate": { "flights": 650, "stay": 750, "food": 400, "activities": 250, "misc": 150 },
    "days": [
      {
        "day": 1,
        "title": "Neighborhood theme",
        "summary": "1-sentence flow of the day",
        "stops": [
          {
            "id": "stop-1-1",
            "day": 1,
            "timeWindow": "10:00 – 11:30",
            "title": "Real specific place name",
            "neighborhood": "Specific neighborhood",
            "description": "Concrete reason to go and what to do/order",
            "category": "food" | "stay" | "attraction" | "nature" | "culture" | "transit" | "hidden-gem" | "nightlife",
            "indoorOutdoor": "indoor" | "outdoor" | "mixed",
            "estimatedCost": 25,
            "lat": 38.7117,
            "lon": -9.1303,
            "status": "planned",
            "isHiddenGem": false
          }
        ]
      }
    ],
    "upsertCustomSections": [
      { "id": "sec-coffee", "title": "Specialty Coffee Spots", "contentMarkdown": "Markdown notes requested by user" }
    ],
    "addHiddenGems": [
      {
        "id": "gem-1",
        "title": "Real underrated place name",
        "neighborhood": "Neighborhood",
        "category": "hidden-gem",
        "whyLocalsLoveIt": "Authentic reason",
        "bestTime": "Weekday late afternoon",
        "estimatedCost": 12,
        "insiderTip": "Specific local tip",
        "lat": 38.713,
        "lon": -9.142,
        "pinnedOnMap": true
      }
    ]
  }
}

IMPORTANT: Only include fields inside "tripPatch" that are newly learned or modified. If clarifying, omit "days". When building or updating "days", include the full updated array of days with real venue names and real lat/lon.`;

  const recentHistory = (trip.messages || []).slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const statePrompt = `${summarizeTripState(trip)}${liveResearchBlock}\nUSER MESSAGE:\n${userMessage}`;

  const aiResult = await callAI({
    model,
    systemInstruction,
    messages: [...recentHistory, { role: 'user', content: statePrompt }],
    useSearchGrounding: model === 'gemini-4-hydrogen' && !liveResearchBlock,
    expectJson: true,
    maxTokens: 2800,
  });

  allSources.push(...aiResult.groundingSources);

  const parsed = extractJsonObject<any>(aiResult.text);
  if (!parsed || typeof parsed.reply !== 'string') {
    return {
      reply: aiResult.text || 'I had trouble structuring that update — could you rephrase what you would like to adjust?',
      quickReplies: [],
      appliedUpdates: [],
      sources: dedupeSources(allSources),
      modelUsed: aiResult.modelUsed,
      phase: 'clarifying',
    };
  }

  const patch: TripPatch | undefined = parsed.tripPatch ? { ...parsed.tripPatch } : undefined;

  if (patch) {
    if (patch.currency && !patch.currencySymbol) {
      patch.currencySymbol = getCurrencySymbol(patch.currency);
    }

    const destName = patch.destination || trip.destination || '';
    const countryName = patch.country || trip.country || '';
    const geoContext = [destName, countryName].filter(Boolean).join(', ');

    if (patch.destination && !hasValidCoords(patch.lat, patch.lon)) {
      const destGeo = await geocodeWithBudget(geocodePlace(geoContext || patch.destination), null, 2000);
      if (destGeo) {
        patch.lat = destGeo.lat;
        patch.lon = destGeo.lon;
      }
    }

    if (Array.isArray(patch.days) && patch.days.length > 0 && geoContext) {
      patch.days = await geocodeStopsBatch(patch.days, geoContext);
    }

    if (Array.isArray(patch.addHiddenGems) && patch.addHiddenGems.length > 0) {
      patch.addHiddenGems = patch.addHiddenGems.map((gem, idx) => ({
        ...gem,
        id: gem.id || `gem-${Date.now()}-${idx}`,
        pinnedOnMap: gem.pinnedOnMap ?? true,
      }));
    }

    if (Array.isArray(patch.upsertCustomSections)) {
      const now = new Date().toISOString();
      patch.upsertCustomSections = patch.upsertCustomSections.map((sec, i) => ({
        id: sec.id || `sec-${Date.now()}-${i}`,
        title: sec.title,
        contentMarkdown: sec.contentMarkdown,
        updatedAt: now,
      }));
    }
  }

  return {
    reply: parsed.reply,
    quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies.slice(0, 4) : [],
    appliedUpdates: Array.isArray(parsed.appliedUpdates) ? parsed.appliedUpdates : [],
    tripPatch: patch,
    sources: dedupeSources(allSources),
    modelUsed: aiResult.modelUsed,
    phase: parsed.phase || 'planning',
  };
}

export async function runWeatherFetch(params: {
  destination?: string;
  country?: string;
  lat?: number;
  lon?: number;
}): Promise<WeatherSnapshot> {
  let lat = params.lat;
  let lon = params.lon;
  const label = [params.destination, params.country].filter(Boolean).join(', ') || 'Current Location';

  if (!hasValidCoords(lat, lon)) {
    const geo = await geocodePlace(label);
    if (!geo) {
      throw new Error(`Could not locate "${label}" for weather data.`);
    }
    lat = geo.lat;
    lon = geo.lon;
  }

  return fetchOpenMeteoWeather(lat as number, lon as number, label);
}

export async function runAreaNewsBrief(params: {
  destination: string;
  country?: string;
  model?: AIProviderId;
}): Promise<{ feed: AreaNewsFeed; modelUsed: string }> {
  const locationName = [params.destination, params.country].filter(Boolean).join(', ').trim();
  if (!locationName) {
    throw new Error('Set a destination or current city to load live area news.');
  }

  const newsRes = await tavilyAreaNewsSearch(locationName);

  const systemInstruction = `You are TripBuddy's Live Local News & Traveler Advisory Desk (${CURRENT_YEAR}).
Analyze the real-time Tavily news articles below for ${locationName}.
Distill up to 6 current, genuinely useful updates for a traveler in or heading to ${locationName} — covering transit disruptions, strikes, local festivals/events, weather advisories, attraction closures, or notable local news.
CRITICAL: Only cite real URLs and publication names from the provided Tavily articles. Never invent fake URLs.

Return ONLY valid JSON:
{
  "summary": "Crisp 1–2 sentence executive pulse on what is happening in ${locationName} right now for travelers.",
  "items": [
    {
      "id": "news-1",
      "title": "Concise headline",
      "sourceName": "Domain or publication name from article",
      "url": "Exact article URL from Tavily input",
      "publishedDate": "Optional date string",
      "category": "transit" | "events" | "weather" | "closure" | "safety" | "local",
      "severity": "info" | "watch" | "alert",
      "impactSummary": "1–2 sentences explaining what this means for a traveler right now",
      "actionableAdvice": "Concrete action (e.g. 'Use metro line B instead' or 'Book tickets 24h early')"
    }
  ]
}`;

  const articlesPayload = newsRes.articles
    .map(
      (a, idx) =>
        `[${idx + 1}] Source: ${a.sourceName} | Date: ${a.publishedDate || 'Recent'} | URL: ${a.url}\nTitle: ${a.title}\nSnippet: ${a.content}`
    )
    .join('\n\n');

  const aiRes = await callAI({
    model: params.model,
    systemInstruction,
    messages: [
      {
        role: 'user',
        content: articlesPayload || `Provide general current travel awareness & seasonal advisories for ${locationName}.`,
      },
    ],
    expectJson: true,
    maxTokens: 1600,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: AreaNewsItem[] = rawItems.slice(0, 6).map((item, idx) => ({
    id: item.id || `news-${Date.now()}-${idx}`,
    title: item.title || newsRes.articles[idx]?.title || 'Local update',
    sourceName: item.sourceName || newsRes.articles[idx]?.sourceName || 'Trusted Source',
    url: item.url || newsRes.articles[idx]?.url || '',
    publishedDate: item.publishedDate || newsRes.articles[idx]?.publishedDate,
    category: item.category || 'local',
    severity: item.severity || 'info',
    impactSummary: item.impactSummary || '',
    actionableAdvice: item.actionableAdvice || undefined,
  }));

  return {
    feed: {
      locationName,
      summary: parsed?.summary || `Latest verified local news and travel updates for ${locationName}.`,
      items,
      sources: dedupeSources([...newsRes.sources, ...aiRes.groundingSources]),
      fetchedAt: new Date().toISOString(),
    },
    modelUsed: aiRes.modelUsed,
  };
}

export async function runTripProgressGuidance(params: {
  trip: TripWorkspace;
  model?: AIProviderId;
}): Promise<{
  guidance: TripGuidance;
  weather: WeatherSnapshot | null;
  areaNews: AreaNewsFeed | null;
  modelUsed: string;
}> {
  const { trip, model } = params;
  const locationLabel =
    trip.liveLocation?.label ||
    [trip.destination, trip.country].filter(Boolean).join(', ');

  if (!locationLabel) {
    throw new Error('Set a destination or current location first so TripBuddy can guide you.');
  }

  // Fetch live weather + live Tavily area news in parallel for instant speed
  const [weatherRes, newsRes] = await Promise.all([
    trip.weather
      ? Promise.resolve(trip.weather)
      : runWeatherFetch({
          destination: trip.destination || locationLabel,
          country: trip.country,
          lat: trip.liveLocation?.lat ?? trip.lat,
          lon: trip.liveLocation?.lon ?? trip.lon,
        }).catch(() => null),
    tavilyAreaNewsSearch(locationLabel),
  ]);

  const allStops = trip.days.flatMap((d) => d.stops.map((s) => ({ ...s, day: d.day })));
  const completedCount = allStops.filter((s) => s.status === 'completed').length;
  const nextStop = allStops.find((s) => s.status !== 'completed');
  const lastCompleted = [...allStops].reverse().find((s) => s.status === 'completed');

  const spent = (trip.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remainingBudget = trip.targetBudget > 0 ? trip.targetBudget - spent : 0;

  const systemInstruction = `You are TripBuddy's Active During-Trip Progress Guide (${CURRENT_YEAR}).
Give the traveler crisp, real-time step-by-step guidance based on:
- Exact trip progress (${completedCount}/${allStops.length} stops completed)
- Next scheduled stop: ${nextStop ? `Day ${nextStop.day} · ${nextStop.timeWindow} · ${nextStop.title} (${nextStop.neighborhood || locationLabel})` : 'No remaining stops — suggest a fresh next move'}
- Last completed stop: ${lastCompleted ? lastCompleted.title : 'Trip starting now'}
- Live weather: ${weatherRes ? `${weatherRes.currentTemp}°C ${weatherRes.currentCondition}${weatherRes.isRaining ? ' (RAINING)' : ''}` : 'Unknown'}
- Budget: target ${trip.currencySymbol}${trip.targetBudget || 'flexible'}, spent ${trip.currencySymbol}${spent}, remaining ${trip.currencySymbol}${remainingBudget}
- Live Local News from Tavily (check for any transit strikes, closures, events, or alerts!)

Return ONLY valid JSON:
{
  "headline": "Short urgent/encouraging 1-line status headline",
  "nextAction": "Clear 2-sentence step-by-step guidance on what to do right now",
  "transitTip": "Practical transit/walking/timing move to reach the next stop smoothly",
  "budgetCheckNote": "1-sentence real-time budget pacing note",
  "newsHeadsUp": "1–2 sentence synthesis of the latest local news/events/transit alerts in ${locationLabel}",
  "quickActions": ["Short clickable action 1", "Action 2", "Action 3"],
  "newsItems": [
    {
      "id": "n-1",
      "title": "Headline",
      "sourceName": "Trusted domain",
      "url": "Exact URL from Tavily articles",
      "category": "transit" | "events" | "weather" | "closure" | "safety" | "local",
      "severity": "info" | "watch" | "alert",
      "impactSummary": "1 sentence traveler impact",
      "actionableAdvice": "Quick practical tip"
    }
  ]
}`;

  const articlesSnippet = newsRes.articles
    .slice(0, 6)
    .map(
      (a, idx) =>
        `[${idx + 1}] ${a.sourceName} (${a.publishedDate || 'Recent'}) | ${a.url} | ${a.title}: ${a.content}`
    )
    .join('\n');

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [
      {
        role: 'user',
        content: `${summarizeTripState(trip)}\n\nLIVE LOCAL NEWS ARTICLES:\n${articlesSnippet || 'No breaking disruptions reported.'}`,
      },
    ],
    expectJson: true,
    maxTokens: 1500,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const now = new Date().toISOString();
  const sources = dedupeSources([...newsRes.sources, ...aiRes.groundingSources]);

  const guidance: TripGuidance = {
    headline: parsed?.headline || (nextStop ? `Up next: ${nextStop.title}` : `Ready to explore ${locationLabel}`),
    nextAction:
      parsed?.nextAction ||
      (nextStop
        ? `Head toward ${nextStop.title} in ${nextStop.neighborhood || locationLabel} for ${nextStop.timeWindow}.`
        : `You have completed your scheduled stops — ask Live Companion for a spontaneous nearby gem.`),
    currentStopTitle: lastCompleted?.title,
    nextStopTitle: nextStop?.title,
    transitTip: parsed?.transitTip || 'Check local transit departure times before heading out.',
    budgetCheckNote:
      parsed?.budgetCheckNote ||
      (trip.targetBudget > 0
        ? `You have ${trip.currencySymbol}${remainingBudget} remaining out of ${trip.currencySymbol}${trip.targetBudget}.`
        : 'Log expenses in the Budget tab to track real-time pacing.'),
    newsHeadsUp: parsed?.newsHeadsUp || 'No major local disruptions detected in recent news.',
    quickActions: Array.isArray(parsed?.quickActions)
      ? parsed.quickActions.slice(0, 3)
      : [
          nextStop ? `Give me a Plan B for ${nextStop.title}` : `Find a hidden café near ${locationLabel}`,
          `Any transit delays or closures in ${locationLabel} right now?`,
        ],
    sources,
    updatedAt: now,
  };

  let areaNews: AreaNewsFeed | null = trip.areaNews;
  if (Array.isArray(parsed?.newsItems) && parsed.newsItems.length > 0) {
    areaNews = {
      locationName: locationLabel,
      summary: guidance.newsHeadsUp,
      items: parsed.newsItems.slice(0, 6).map((item: any, idx: number) => ({
        id: item.id || `news-${Date.now()}-${idx}`,
        title: item.title || newsRes.articles[idx]?.title || 'Local update',
        sourceName: item.sourceName || newsRes.articles[idx]?.sourceName || 'Trusted Source',
        url: item.url || newsRes.articles[idx]?.url || '',
        publishedDate: newsRes.articles[idx]?.publishedDate,
        category: item.category || 'local',
        severity: item.severity || 'info',
        impactSummary: item.impactSummary || '',
        actionableAdvice: item.actionableAdvice,
      })),
      sources,
      fetchedAt: now,
    };
  }

  return {
    guidance,
    weather: weatherRes,
    areaNews,
    modelUsed: aiRes.modelUsed,
  };
}

export async function runWeatherAdaptation(params: {
  trip: TripWorkspace;
  model?: AIProviderId;
}): Promise<{
  weather: WeatherSnapshot;
  adaptedDays: ItineraryDay[];
  summary: string;
  changes: string[];
  sources: ReturnType<typeof dedupeSources>;
  modelUsed: string;
}> {
  const { trip, model } = params;
  const destinationContext = [trip.destination, trip.country].filter(Boolean).join(', ');
  if (!destinationContext) {
    throw new Error('Set a destination before running weather adaptation.');
  }

  const [weather, searchRes] = await Promise.all([
    runWeatherFetch({
      destination: trip.destination,
      country: trip.country,
      lat: trip.lat,
      lon: trip.lon,
    }),
    tavilySearch(
      `best indoor activities museums cafes rainy day ${destinationContext} ${trip.localFriendMode ? 'local hidden gems' : ''} ${CURRENT_YEAR}`,
      4
    ),
  ]);

  const weatherLines = weather.daily
    .map(
      (d, idx) =>
        `Forecast Day ${idx + 1} (${d.date}): ${d.condition}, ${d.tempMin}–${d.tempMax}°C, precip=${d.precipitationProb}%, severity=${d.severity}`
    )
    .join('\n');

  const systemInstruction = `You are TripBuddy's Smart Weather-Adaptive Itinerary Engine.
Rearrange or swap outdoor stops affected by rain, storms, or extreme heat (>=36°C) to high-quality indoor alternatives matching budget (${trip.currencySymbol}${trip.targetBudget || 'flexible'}). Mark swapped stops with "status": "swapped" and include real decimal lat/lon for every stop.

Return ONLY valid JSON:
{
  "summary": "Clear 2-sentence explanation of how the itinerary was adapted for the real forecast.",
  "changes": ["Day 2 afternoon: Swapped outdoor viewpoint for Covered Market due to rain"],
  "days": [ ...full updated ItineraryDay[] array... ]
}`;

  const prompt = `Destination: ${destinationContext}
Weather:\nCurrent: ${weather.currentTemp}°C ${weather.currentCondition}\n${weatherLines}
Indoor Research:\n${searchRes.contextText}
Existing Itinerary:\n${JSON.stringify(trip.days)}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
    maxTokens: 2600,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const adaptedDays: ItineraryDay[] = Array.isArray(parsed?.days)
    ? await geocodeStopsBatch(parsed.days, destinationContext)
    : trip.days;

  return {
    weather,
    adaptedDays,
    summary: parsed?.summary || 'Checked live weather and optimized outdoor/indoor sequencing.',
    changes: Array.isArray(parsed?.changes) ? parsed.changes : [],
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}

export async function runPlanBGenerator(params: {
  trip: Partial<TripWorkspace>;
  cancelledStop?: Partial<ItineraryStop>;
  reason: string;
  model?: AIProviderId;
}): Promise<{
  alternatives: PlanBAlternative[];
  note: string;
  sources: ReturnType<typeof dedupeSources>;
  modelUsed: string;
}> {
  const { trip, cancelledStop, reason, model } = params;
  const destinationContext =
    [trip.destination, trip.country].filter(Boolean).join(', ') || trip.liveLocation?.label || '';
  if (!destinationContext) {
    throw new Error('Please set a destination or current location first to generate a Plan B.');
  }

  const neighborhood = cancelledStop?.neighborhood || trip.liveLocation?.label || destinationContext;
  const searchRes = await tavilySearch(
    `open alternatives near ${neighborhood} ${destinationContext} ${reason} ${trip.localFriendMode ? 'local hidden gem' : ''} ${CURRENT_YEAR}`,
    4
  );

  const systemInstruction = `You are TripBuddy's Instant Plan B Generator.
Suggest 3 realistic, specific nearby replacements in ${destinationContext} (near ${neighborhood}) in currency ${trip.currency || 'USD'}. Include accurate decimal lat/lon for each alternative.

Return ONLY valid JSON:
{
  "note": "Brief empathetic 1-sentence tactical note",
  "alternatives": [
    {
      "id": "planb-1",
      "title": "Real specific venue name",
      "neighborhood": "Neighborhood",
      "category": "food" | "culture" | "attraction" | "nature" | "hidden-gem" | "nightlife",
      "indoorOutdoor": "indoor" | "outdoor" | "mixed",
      "estimatedCost": 20,
      "reason": "Why this is an ideal immediate swap",
      "openStatus": "Typical hours / availability note",
      "lat": 38.712,
      "lon": -9.139
    }
  ]
}`;

  const prompt = `Destination: ${destinationContext}
Cancelled Stop: ${cancelledStop?.title || 'Ad-hoc activity'} (${cancelledStop?.category || 'general'})
Issue: ${reason}
Weather: ${trip.weather ? `${trip.weather.currentTemp}°C ${trip.weather.currentCondition}` : 'Unknown'}
Live Research:\n${searchRes.contextText}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
    maxTokens: 1200,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawAlts: PlanBAlternative[] = Array.isArray(parsed?.alternatives) ? parsed.alternatives : [];

  const alternatives = await geocodeWithBudget(
    Promise.all(
      rawAlts.slice(0, 3).map(async (alt, idx) => {
        let lat = alt.lat;
        let lon = alt.lon;
        if (!hasValidCoords(lat, lon)) {
          const geo = await geocodePlace(`${alt.title}, ${alt.neighborhood || ''}`, destinationContext);
          lat = geo?.lat;
          lon = geo?.lon;
        }
        return {
          ...alt,
          id: alt.id || `planb-${Date.now()}-${idx}`,
          estimatedCost: Number(alt.estimatedCost) || 0,
          lat,
          lon,
        };
      })
    ),
    rawAlts.slice(0, 3).map((alt, idx) => ({
      ...alt,
      id: alt.id || `planb-${Date.now()}-${idx}`,
      estimatedCost: Number(alt.estimatedCost) || 0,
    })),
    2200
  );

  return {
    alternatives,
    note: parsed?.note || 'Here are three immediate nearby backups you can swap in with one click.',
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}

export async function runLiveSuggestions(params: {
  trip: Partial<TripWorkspace>;
  locationLabel: string;
  lat?: number;
  lon?: number;
  remainingHours: number;
  mood?: string;
  model?: AIProviderId;
}): Promise<{
  weather: WeatherSnapshot | null;
  suggestions: LiveSuggestion[];
  summary: string;
  sources: ReturnType<typeof dedupeSources>;
  modelUsed: string;
}> {
  const { trip, locationLabel, remainingHours, mood, model } = params;
  const targetPlace = locationLabel || [trip.destination, trip.country].filter(Boolean).join(', ');
  if (!targetPlace && !hasValidCoords(params.lat, params.lon)) {
    throw new Error('Provide a current city, neighborhood, or GPS location for live suggestions.');
  }

  // Run weather + Tavily search in parallel
  const [weather, searchRes] = await Promise.all([
    runWeatherFetch({
      destination: targetPlace,
      lat: params.lat ?? trip.lat,
      lon: params.lon ?? trip.lon,
    }).catch(() => trip.weather || null),
    tavilySearch(
      `things to do right now near ${targetPlace} ${mood || ''} ${trip.localFriendMode ? 'local cafes hidden gems non-touristy' : 'top nearby spots'} ${CURRENT_YEAR}`,
      4
    ),
  ]);

  const spent = (trip.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remainingBudget = trip.targetBudget ? Math.max(0, trip.targetBudget - spent) : 0;

  const systemInstruction = `You are TripBuddy's Live Trip Companion assisting a traveler ON THE GROUND right now.
Recommend 4 actionable nearby moves tailored to:
- Location: ${targetPlace}
- Free time: ${remainingHours}h
- Weather: ${weather ? `${weather.currentTemp}°C, ${weather.currentCondition}${weather.isRaining ? ' (RAINING — prioritize indoor stops!)' : ''}` : 'Unknown'}
- Remaining budget: ${trip.targetBudget ? `${trip.currencySymbol || '$'}${remainingBudget} ${trip.currency || 'USD'}` : 'Flexible'}
- Mood: ${mood || 'Best use of the next few hours'}
- Local Friend Mode: ${trip.localFriendMode ? 'ON — avoid tourist traps' : 'OFF'}

Return ONLY valid JSON with accurate decimal lat/lon:
{
  "summary": "Brief, practical on-the-ground advice (1–2 sentences).",
  "suggestions": [
    {
      "id": "live-1",
      "title": "Real specific place",
      "neighborhood": "Area / district",
      "category": "food" | "culture" | "attraction" | "nature" | "hidden-gem" | "nightlife",
      "indoorOutdoor": "indoor" | "outdoor" | "mixed",
      "estimatedMinutes": 75,
      "estimatedCost": 18,
      "whyNow": "Why this fits the exact time window and weather",
      "localTip": "Actionable insider tip",
      "lat": 38.712,
      "lon": -9.139
    }
  ]
}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: `Live web research:\n${searchRes.contextText || 'Use verified local knowledge.'}` }],
    expectJson: true,
    maxTokens: 1300,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawList: LiveSuggestion[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

  const suggestions = rawList.slice(0, 4).map((item, idx) => ({
    ...item,
    id: item.id || `live-${Date.now()}-${idx}`,
    estimatedMinutes: Number(item.estimatedMinutes) || 60,
    estimatedCost: Number(item.estimatedCost) || 0,
  }));

  return {
    weather,
    suggestions,
    summary: parsed?.summary || `Tailored ideas around ${targetPlace} for your next ${remainingHours} hours.`,
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}

export async function runCostRealityCheck(params: {
  trip: Partial<TripWorkspace>;
  overrideBudget?: number;
  overrideCurrency?: string;
  model?: AIProviderId;
}): Promise<{ result: CostRealityCheckResult; modelUsed: string }> {
  const { trip, overrideBudget, overrideCurrency, model } = params;
  const destination = [trip.destination, trip.country].filter(Boolean).join(', ');
  if (!destination) {
    throw new Error('Set a destination first to run an AI Trip Cost Reality Check.');
  }

  const currency = (overrideCurrency || trip.currency || 'USD').toUpperCase();
  const currencySymbol = getCurrencySymbol(currency);
  const userBudget = Number(overrideBudget ?? trip.targetBudget ?? 0);
  const duration = Math.max(1, Number(trip.durationDays) || 5);
  const travelers = Math.max(1, Number(trip.travelersCount) || 1);
  const origin = trip.origin || 'Major international hub';

  const [flightSearch, dailyCostSearch] = await Promise.all([
    tavilySearch(`round trip flight cost ${origin} to ${destination} ${currency} ${CURRENT_YEAR}`, 3),
    tavilySearch(`${destination} average daily travel cost hotel food transport ${currency} ${CURRENT_YEAR}`, 4),
  ]);

  const sources = dedupeSources([...flightSearch.sources, ...dailyCostSearch.sources]);

  const systemInstruction = `You are TripBuddy's AI Trip Cost Reality Check Auditor (${CURRENT_YEAR}).
Be ruthlessly honest and grounded in REAL ${CURRENT_YEAR} pricing.
Evaluate whether ${currencySymbol}${userBudget} ${currency} is realistic for ${travelers} traveler(s) spending ${duration} days in ${destination} from ${origin}.

Return ONLY valid JSON:
{
  "verdict": "realistic" | "tight" | "unrealistic",
  "headline": "Sharp, honest 1-line assessment",
  "summary": "2–3 sentences diagnosing what is realistic vs. underestimated.",
  "recommendedMinimum": 1800,
  "comfortableEstimate": 2600,
  "categories": [
    {
      "category": "flights" | "stay" | "food" | "activities" | "misc",
      "label": "Flights & Transit",
      "userEstimated": 500,
      "marketLow": 650,
      "marketHigh": 1100,
      "status": "realistic" | "tight" | "underestimated",
      "note": "Specific real-world cost explanation"
    }
  ],
  "savingSwaps": [
    {
      "id": "swap-1",
      "title": "Concrete money-saving tactic",
      "estimatedSavings": 240,
      "description": "Specific swap that saves real money.",
      "actionPrompt": "Apply this exact cost-saving swap to my trip itinerary and budget: ..."
    }
  ]
}
Include all 5 categories: flights, stay, food, activities, misc. All figures in ${currency} for ALL ${travelers} traveler(s) combined.`;

  const prompt = `Trip: ${origin} -> ${destination}, ${duration} days, ${travelers} traveler(s)
Target Budget: ${currencySymbol}${userBudget} ${currency}
Estimated Breakdown: ${JSON.stringify(trip.budgetEstimate || {})}
Flight Pricing:\n${flightSearch.contextText}
Daily Cost Research:\n${dailyCostSearch.contextText}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
    maxTokens: 1600,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const allSources = dedupeSources([...sources, ...aiRes.groundingSources]);

  const result: CostRealityCheckResult = {
    verdict: parsed?.verdict || 'tight',
    headline: parsed?.headline || 'Budget audit completed against current market rates.',
    summary: parsed?.summary || 'Review the category ranges below to spot any underestimated costs.',
    userBudget,
    recommendedMinimum: Number(parsed?.recommendedMinimum) || userBudget,
    comfortableEstimate: Number(parsed?.comfortableEstimate) || Math.round(userBudget * 1.25),
    currency,
    currencySymbol,
    categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
    savingSwaps: Array.isArray(parsed?.savingSwaps)
      ? parsed.savingSwaps.map((s: any, i: number) => ({
          ...s,
          id: s.id || `swap-${i + 1}`,
          estimatedSavings: Number(s.estimatedSavings) || 0,
        }))
      : [],
    sources: allSources,
    checkedAt: new Date().toISOString(),
  };

  return { result, modelUsed: aiRes.modelUsed };
}

export async function runGroupSynthesis(params: {
  trip: TripWorkspace;
  members: GroupMember[];
  model?: AIProviderId;
}): Promise<{
  consensus: GroupConsensus;
  days: ItineraryDay[];
  budgetEstimate: TripWorkspace['budgetEstimate'];
  reply: string;
  sources: ReturnType<typeof dedupeSources>;
  modelUsed: string;
}> {
  const { trip, members, model } = params;
  if (!members || members.length < 2) {
    throw new Error('Add at least 2 group members to synthesize a group consensus itinerary.');
  }

  const destinationContext =
    [trip.destination, trip.country].filter(Boolean).join(', ') || 'a mutually suitable global destination';
  const searchRes = await tavilySearch(
    `group travel itinerary ${destinationContext} ${members.flatMap((m) => m.interests || []).slice(0, 5).join(' ')} ${CURRENT_YEAR}`,
    4
  );

  const budgets = members.map((m) => Number(m.maxBudget) || 0).filter((b) => b > 0);
  const sharedCeiling = budgets.length > 0 ? Math.min(...budgets) : trip.targetBudget || 1500;
  const duration = Math.max(2, trip.durationDays || 4);

  const systemInstruction = `You are TripBuddy's Group Travel Decision Maker.
Combine ${members.length} travelers' budgets, paces, interests, must-haves, and strict vetoes into ONE fair itinerary for ${destinationContext} (${duration} days).
Strictly honor all VETOES and respect the shared ceiling (${trip.currencySymbol}${sharedCeiling} ${trip.currency}/person). Include real decimal lat/lon for every stop.

Return ONLY valid JSON:
{
  "reply": "Clear explanation to the group explaining how you balanced everyone's priorities.",
  "consensus": {
    "summary": "2-sentence overview of the group strategy.",
    "sharedBudgetCeiling": ${sharedCeiling},
    "commonInterests": ["Overlap 1", "Overlap 2"],
    "tradeoffsResolved": ["How conflict 1 was solved fairly"],
    "memberNotes": [{ "name": "Member Name", "satisfiedBy": "Which stops deliver their priorities" }]
  },
  "budgetEstimate": { "flights": 0, "stay": 0, "food": 0, "activities": 0, "misc": 0 },
  "days": [ ...full ItineraryDay[] array with real places and lat/lon... ]
}`;

  const prompt = `Destination: ${destinationContext}, ${duration} days, ${trip.currency} (${trip.currencySymbol})
Members:\n${JSON.stringify(members)}
Live Research:\n${searchRes.contextText}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
    maxTokens: 2600,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const days = Array.isArray(parsed?.days)
    ? await geocodeStopsBatch(parsed.days, destinationContext)
    : trip.days;

  const consensus: GroupConsensus = {
    summary: parsed?.consensus?.summary || 'Balanced everyone’s priorities into a shared itinerary.',
    sharedBudgetCeiling: Number(parsed?.consensus?.sharedBudgetCeiling) || sharedCeiling,
    commonInterests: Array.isArray(parsed?.consensus?.commonInterests) ? parsed.consensus.commonInterests : [],
    tradeoffsResolved: Array.isArray(parsed?.consensus?.tradeoffsResolved) ? parsed.consensus.tradeoffsResolved : [],
    memberNotes: Array.isArray(parsed?.consensus?.memberNotes) ? parsed.consensus.memberNotes : [],
    updatedAt: new Date().toISOString(),
  };

  return {
    consensus,
    days,
    budgetEstimate: parsed?.budgetEstimate || trip.budgetEstimate,
    reply: parsed?.reply || consensus.summary,
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}

export async function runSurpriseMe(params: {
  origin: string;
  budget: number;
  currency: string;
  durationDays: number;
  personality: string;
  vibe: string;
  model?: AIProviderId;
}): Promise<{
  pitches: SurprisePitch[];
  sources: ReturnType<typeof dedupeSources>;
  modelUsed: string;
}> {
  const { origin, budget, currency, durationDays, personality, vibe, model } = params;
  const sym = getCurrencySymbol(currency);

  const searchRes = await tavilySearch(
    `underrated unexpected travel destinations from ${origin || 'anywhere'} ${durationDays} days ${vibe} ${CURRENT_YEAR}`,
    4
  );

  const systemInstruction = `You are TripBuddy's Surprise Me Mode Global Destination Scout (${CURRENT_YEAR}).
Suggest 3 UNEXPECTED, cost-checked global destinations for:
- Origin: ${origin || 'Flexible global origin'}
- Days: ${durationDays}
- Budget: ${sym}${budget} ${currency}
- Personality: ${personality}
- Vibe: ${vibe}

Return ONLY valid JSON including accurate decimal lat/lon for each city:
{
  "pitches": [
    {
      "id": "surprise-1",
      "destination": "City or Region",
      "country": "Country",
      "tagline": "Evocative 6–10 word pitch",
      "estimatedTotal": 1450,
      "currency": "${currency}",
      "durationDays": ${durationDays},
      "whyItFits": "2 sentences linking personality, budget, and travel distance",
      "highlights": ["Specific highlight 1", "Highlight 2", "Highlight 3"],
      "seasonNote": "Current seasonal/crowd insight",
      "lat": 41.1579,
      "lon": -8.6291
    }
  ]
}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: `Live travel trends:\n${searchRes.contextText}` }],
    expectJson: true,
    maxTokens: 1300,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawPitches: any[] = Array.isArray(parsed?.pitches) ? parsed.pitches : [];

  const pitches: SurprisePitch[] = rawPitches.slice(0, 3).map((p, idx) => ({
    id: p.id || `surprise-${Date.now()}-${idx}`,
    destination: p.destination || 'Unexpected Escape',
    country: p.country || '',
    tagline: p.tagline || '',
    estimatedTotal: Number(p.estimatedTotal) || budget,
    currency: p.currency || currency,
    currencySymbol: getCurrencySymbol(p.currency || currency),
    durationDays: Number(p.durationDays) || durationDays,
    whyItFits: p.whyItFits || '',
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    seasonNote: p.seasonNote || '',
    lat: hasValidCoords(p.lat, p.lon) ? Number(p.lat) : undefined,
    lon: hasValidCoords(p.lat, p.lon) ? Number(p.lon) : undefined,
  }));

  return {
    pitches,
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}

export async function runLocalGemsDiscovery(params: {
  destination: string;
  country?: string;
  focus?: string;
  currency?: string;
  model?: AIProviderId;
}): Promise<{
  gems: HiddenGemItem[];
  localIntro: string;
  sources: ReturnType<typeof dedupeSources>;
  modelUsed: string;
}> {
  const { destination, country, focus, currency = 'USD', model } = params;
  const place = [destination, country].filter(Boolean).join(', ');
  if (!place) {
    throw new Error('Enter a destination city to discover local hidden gems.');
  }

  const searchRes = await tavilySearch(
    `hidden gems locals love ${place} underrated cafes local food non-touristy ${focus || ''} ${CURRENT_YEAR}`,
    5
  );

  const systemInstruction = `You are acting in AI LOCAL FRIEND MODE — a plugged-in local resident of ${place}.
Recommend 6 genuine, real, underrated non-touristy spots in ${place} focused on: ${focus || 'hidden cafés, local food, neighborhood walks'}.
Estimate costs in ${currency}. Include accurate decimal lat/lon for every venue so it pins immediately on the map.

Return ONLY valid JSON:
{
  "localIntro": "Warm 2-sentence note from a local friend.",
  "gems": [
    {
      "id": "gem-1",
      "title": "Real venue name",
      "neighborhood": "Neighborhood",
      "category": "hidden-gem" | "food" | "culture" | "nature" | "nightlife",
      "whyLocalsLoveIt": "Authentic reason",
      "bestTime": "Best time to visit",
      "estimatedCost": 15,
      "insiderTip": "Specific local move",
      "lat": 38.713,
      "lon": -9.142,
      "pinnedOnMap": true
    }
  ]
}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: `Recent local discoveries:\n${searchRes.contextText}` }],
    expectJson: true,
    maxTokens: 1500,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawGems: any[] = Array.isArray(parsed?.gems) ? parsed.gems : [];

  const gems: HiddenGemItem[] = rawGems.slice(0, 6).map((g, idx) => ({
    id: g.id || `gem-${Date.now()}-${idx}`,
    title: g.title,
    neighborhood: g.neighborhood || place,
    category: g.category || 'hidden-gem',
    whyLocalsLoveIt: g.whyLocalsLoveIt || '',
    bestTime: g.bestTime || 'Late afternoon',
    estimatedCost: Number(g.estimatedCost) || 0,
    insiderTip: g.insiderTip || '',
    lat: hasValidCoords(g.lat, g.lon) ? Number(g.lat) : undefined,
    lon: hasValidCoords(g.lat, g.lon) ? Number(g.lon) : undefined,
    pinnedOnMap: true,
  }));

  return {
    gems,
    localIntro: parsed?.localIntro || `Here are the neighborhood spots locals actually love in ${place}.`,
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}
