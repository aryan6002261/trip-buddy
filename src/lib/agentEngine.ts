import type {
  AIProviderId,
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
  tavilySearch,
} from './providers.js';
import { getCurrencySymbol } from './storage.js';

const CURRENT_YEAR = new Date().getFullYear();

async function geocodeStopsBatch(
  days: ItineraryDay[],
  destinationContext: string
): Promise<ItineraryDay[]> {
  const enrichedDays: ItineraryDay[] = [];
  for (const day of days) {
    const stops = await Promise.all(
      (day.stops || []).map(async (stop, idx) => {
        const safeId = stop.id || `stop-d${day.day}-${idx + 1}-${Date.now().toString(36)}`;
        if (typeof stop.lat === 'number' && typeof stop.lon === 'number' && Math.abs(stop.lat) > 0.01) {
          return { ...stop, id: safeId, day: day.day };
        }
        const searchLabel = stop.neighborhood
          ? `${stop.title}, ${stop.neighborhood}`
          : stop.title;
        const geo = await geocodePlace(searchLabel, destinationContext);
        return {
          ...stop,
          id: safeId,
          day: day.day,
          lat: geo?.lat,
          lon: geo?.lon,
        };
      })
    );
    enrichedDays.push({ ...day, stops });
  }
  return enrichedDays;
}

function summarizeTripState(trip: Partial<TripWorkspace>): string {
  const daysSummary = (trip.days || [])
    .map(
      (d) =>
        `Day ${d.day} (${d.title}): ${(d.stops || [])
          .map((s) => `${s.timeWindow} ${s.title} [${s.indoorOutdoor}, ~${trip.currencySymbol || '$'}${s.estimatedCost}]`)
          .join('; ')}`
    )
    .join('\n');

  const customSummary = (trip.customSections || [])
    .map((s) => `- ${s.title}`)
    .join('\n');

  const groupSummary = (trip.groupMembers || [])
    .map(
      (m) =>
        `- ${m.name}: max ${trip.currencySymbol || '$'}${m.maxBudget}, pace=${m.pace}, interests=[${m.interests.join(', ')}], mustHaves=[${m.mustHaves.join(', ')}], vetoes=[${m.vetoes.join(', ')}]`
    )
    .join('\n');

  const spentTotal = (trip.expenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

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

  // Decide whether live Tavily search adds fresh facts
  const destHint = trip.destination || '';
  const searchNeeded =
    userMessage.length > 14 &&
    !['yes', 'no', 'ok', 'thanks', 'sure'].includes(userMessage.trim().toLowerCase());

  let liveResearchBlock = '';
  if (searchNeeded) {
    const queryBase = destHint
      ? `${destHint} ${userMessage.slice(0, 90)} ${trip.localFriendMode ? 'local hidden gems non-touristy' : ''} ${CURRENT_YEAR}`
      : `${userMessage.slice(0, 110)} travel guide prices ${CURRENT_YEAR}`;
    const searchRes = await tavilySearch(queryBase, 5);
    if (searchRes.contextText) {
      liveResearchBlock = `\nRECENT WEB RESEARCH (Tavily ${CURRENT_YEAR}):\n${searchRes.contextText}\n`;
      allSources.push(...searchRes.sources);
    }
  }

  const systemInstruction = `You are TripBuddy — a sharp, warm, globally knowledgeable AI travel companion and strategist (year ${CURRENT_YEAR}).

CORE BEHAVIORAL RULES (STRICT):
1. TALK FIRST BEFORE CONCLUDING: If the user gives a broad or incomplete trip request (missing destination, origin, rough budget/currency, duration, travel style, or group context) and has NOT explicitly asked you to "just build it now", DO NOT dump a full itinerary yet! Instead, react thoughtfully to what they shared, offer 1–2 smart observations, and ask 2–4 concise, high-leverage clarifying questions. Provide 3–4 clickable quickReplies so they can answer fast.
2. NO RIGID PRE-MADE HEADINGS: Never output canned boilerplate headings like "Executive Summary / Accommodation / Visa / Packing List" unless the user actually asked for them. Write naturally like a human strategist. Only create or update customSections for specific topics the user asks about (e.g., "Specialty Coffee Map", "Vegan Street Food", "Rail Pass Breakdown", "Night Photography Spots").
3. GLOBAL-FIRST & RECENT DATA: Never default to India or INR unless the user asks for India/INR. Match the user's stated currency or the destination's natural currency (USD/EUR/GBP/JPY/etc.). Ground prices, transit, and openings in the current ${CURRENT_YEAR} live web research provided.
4. AI LOCAL FRIEND MODE: ${trip.localFriendMode ? 'CURRENTLY ACTIVE — Speak like a trusted local resident who lives in the destination. Steer away from overcrowded tourist traps and recommend neighborhood cafés, family-run eateries, underrated galleries, local transit hacks, and real etiquette.' : 'Currently off — give balanced, authentic travel advice (and mention they can toggle Local Friend Mode anytime).'}
5. ACTIVE MODE (${trip.mode === 'live' ? 'LIVE TRIP COMPANION' : 'PRE-TRIP PLANNING'}): ${
    trip.mode === 'live'
      ? 'The traveler is currently ON THE TRIP. Be immediate, practical, and location/time/weather aware. Prioritize open venues, transit realism, instant swaps, and remaining-time optimization.'
      : 'Help refine preferences, stress-test budget realism, optimize routes & energy pace, and build/update the itinerary interactively.'
  }
6. RESPECT PACE & GROUP CONSTRAINTS: Always honor the Pace & Energy Profile (e.g., late risers NEVER get 7:00 AM starts; low walking tolerance minimizes long walks) and any Group Member vetoes or budget ceilings.
7. REALISTIC COST REASONING: Never invent absurdly low budgets (like $200 for an international flight + 7-day hotel). If a user's budget looks unrealistic, gently flag it right in conversation and suggest they run the Cost Reality Check or explore smart swaps.

OUTPUT FORMAT (STRICT JSON ONLY — NO MARKDOWN WRAPPER):
Return a single valid JSON object matching this exact schema:
{
  "phase": "clarifying" | "planning" | "updating" | "live-guidance",
  "reply": "Natural, helpful markdown conversational response to the user (no rigid boilerplate headings).",
  "quickReplies": ["Short clickable follow-up option 1", "Option 2", "Option 3"],
  "appliedUpdates": ["Short plain-English note of each workspace change made, e.g. 'Added Day 1–4 Lisbon itinerary' or empty array if only clarifying"],
  "tripPatch": {
    "title": "Optional concise trip title",
    "origin": "Optional origin city",
    "destination": "Optional destination city",
    "country": "Optional country",
    "durationDays": 5,
    "startDate": "Optional date or season string",
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
            "status": "planned",
            "isHiddenGem": false
          }
        ]
      }
    ],
    "upsertCustomSections": [
      { "id": "sec-coffee", "title": "Specialty Coffee Spots", "contentMarkdown": "Markdown notes requested by the user" }
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
        "pinnedOnMap": true
      }
    ]
  }
}

IMPORTANT:
- Only include fields inside "tripPatch" that are actually newly learned or modified in this turn!
- If you are in the "clarifying" phase, omit "days" from "tripPatch" (you may still patch destination, origin, budget, currency, or durationDays if the user already mentioned them).
- When building or updating "days", ALWAYS include the full updated array of days so nothing is accidentally dropped, using real specific venue/neighborhood names (never generic placeholders like "Local Restaurant").`;

  const recentHistory = (trip.messages || []).slice(-10).map((m) => ({
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

    // Geocode destination hub if newly set or changed
    if (patch.destination && (patch.destination !== trip.destination || !trip.lat)) {
      const destGeo = await geocodePlace(geoContext || patch.destination);
      if (destGeo) {
        patch.lat = destGeo.lat;
        patch.lon = destGeo.lon;
      }
    }

    // Geocode itinerary stops for real Google Maps pins
    if (Array.isArray(patch.days) && patch.days.length > 0 && geoContext) {
      patch.days = await geocodeStopsBatch(patch.days, geoContext);
    }

    // Geocode hidden gems if added
    if (Array.isArray(patch.addHiddenGems) && patch.addHiddenGems.length > 0 && geoContext) {
      patch.addHiddenGems = await Promise.all(
        patch.addHiddenGems.map(async (gem, idx) => {
          const geo = await geocodePlace(`${gem.title}, ${gem.neighborhood || ''}`, geoContext);
          return {
            ...gem,
            id: gem.id || `gem-${Date.now()}-${idx}`,
            pinnedOnMap: gem.pinnedOnMap ?? true,
            lat: geo?.lat ?? gem.lat,
            lon: geo?.lon ?? gem.lon,
          };
        })
      );
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

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    const geo = await geocodePlace(label);
    if (!geo) {
      throw new Error(`Could not locate "${label}" for weather data.`);
    }
    lat = geo.lat;
    lon = geo.lon;
  }

  return fetchOpenMeteoWeather(lat, lon, label);
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

  const weather = await runWeatherFetch({
    destination: trip.destination,
    country: trip.country,
    lat: trip.lat,
    lon: trip.lon,
  });

  const searchRes = await tavilySearch(
    `best indoor activities museums cafes rainy day ${destinationContext} ${trip.localFriendMode ? 'local hidden gems' : ''} ${CURRENT_YEAR}`,
    5
  );

  const weatherLines = weather.daily
    .map(
      (d, idx) =>
        `Forecast Day ${idx + 1} (${d.date}): ${d.condition}, ${d.tempMin}–${d.tempMax}°C, precip=${d.precipitationProb}%, severity=${d.severity} (${d.advisory})`
    )
    .join('\n');

  const systemInstruction = `You are TripBuddy's Smart Weather-Adaptive Itinerary Engine.
Given the traveler's existing itinerary and real-time Open-Meteo 7-day forecast:
- Identify outdoor stops scheduled on days with rain, storms, extreme heat (>=36°C), or high precipitation probability (>=45%).
- Rearrange outdoor stops to clearer days when possible, OR replace exposed outdoor stops with nearby high-quality indoor alternatives (museums, covered markets, specialty cafés, galleries, bathhouses, culinary workshops) matching the user's budget (${trip.currencySymbol}${trip.targetBudget || 'flexible'}) and pace.
- If weather is mostly clear, suggest proactive midday shade/comfort optimizations or keep outdoor highlights intact while marking any minor swaps.
- Mark swapped stops with "status": "swapped".

Return ONLY valid JSON:
{
  "summary": "Clear 2-sentence explanation of how the itinerary was adapted for the real forecast.",
  "changes": ["Day 2 afternoon: Swapped outdoor viewpoint for Covered Market & Gallery due to 80% rain"],
  "days": [ ...full updated ItineraryDay[] array preserving all days and stop fields... ]
}`;

  const prompt = `${summarizeTripState(trip)}

REAL-TIME FORECAST FOR ${weather.locationName}:
Current: ${weather.currentTemp}°C, ${weather.currentCondition}, Wind ${weather.currentWindKmh} km/h
${weatherLines}

INDOOR ALTERNATIVES RESEARCH:
${searchRes.contextText}

EXISTING ITINERARY JSON:
${JSON.stringify(trip.days)}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
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
  const destinationContext = [trip.destination, trip.country].filter(Boolean).join(', ') || trip.liveLocation?.label || '';
  if (!destinationContext) {
    throw new Error('Please set a destination or current location first to generate a Plan B.');
  }

  const neighborhood = cancelledStop?.neighborhood || trip.liveLocation?.label || destinationContext;
  const searchQuery = `open now alternatives near ${neighborhood} ${destinationContext} ${reason} ${trip.localFriendMode ? 'local hidden gem' : ''} ${CURRENT_YEAR}`;
  const searchRes = await tavilySearch(searchQuery, 5);

  const systemInstruction = `You are TripBuddy's Instant Plan B Generator.
A traveler's activity, attraction, or restaurant just got cancelled, closed, sold out, or disrupted by weather.
Suggest 3 realistic, specific, currently-operating nearby replacements in ${destinationContext} (ideally near ${neighborhood}) matching the traveler's currency (${trip.currency || 'USD'}) and vibe.
${trip.localFriendMode ? 'AI Local Friend Mode is ON: prioritize genuine non-touristy neighborhood spots.' : ''}

Return ONLY valid JSON:
{
  "note": "Brief empathetic 1-sentence tactical note",
  "alternatives": [
    {
      "id": "planb-1",
      "title": "Real specific venue or experience name",
      "neighborhood": "Neighborhood name",
      "category": "food" | "culture" | "attraction" | "nature" | "hidden-gem" | "nightlife",
      "indoorOutdoor": "indoor" | "outdoor" | "mixed",
      "estimatedCost": 20,
      "reason": "Why this is an ideal immediate swap",
      "openStatus": "Typically open midday–late evening (verify live hours)"
    }
  ]
}`;

  const prompt = `Destination: ${destinationContext}
Cancelled/Disrupted Stop: ${cancelledStop?.title || 'Ad-hoc activity'} (${cancelledStop?.category || 'general'}, est. ${trip.currencySymbol || '$'}${cancelledStop?.estimatedCost ?? 0})
Issue / Reason: ${reason}
Current Weather: ${trip.weather ? `${trip.weather.currentTemp}°C ${trip.weather.currentCondition}` : 'Unknown'}
Live Web Research:
${searchRes.contextText}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawAlts: PlanBAlternative[] = Array.isArray(parsed?.alternatives) ? parsed.alternatives : [];

  const alternatives = await Promise.all(
    rawAlts.slice(0, 3).map(async (alt, idx) => {
      const geo = await geocodePlace(`${alt.title}, ${alt.neighborhood || ''}`, destinationContext);
      return {
        ...alt,
        id: alt.id || `planb-${Date.now()}-${idx}`,
        estimatedCost: Number(alt.estimatedCost) || 0,
        lat: geo?.lat,
        lon: geo?.lon,
      };
    })
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
  if (!targetPlace && (typeof params.lat !== 'number' || typeof params.lon !== 'number')) {
    throw new Error('Provide a current city, neighborhood, or GPS location for live suggestions.');
  }

  let weather: WeatherSnapshot | null = null;
  try {
    weather = await runWeatherFetch({
      destination: targetPlace,
      lat: params.lat ?? trip.lat,
      lon: params.lon ?? trip.lon,
    });
  } catch {
    weather = trip.weather || null;
  }

  const spent = (trip.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remainingBudget = trip.targetBudget ? Math.max(0, trip.targetBudget - spent) : 0;

  const searchRes = await tavilySearch(
    `things to do right now near ${targetPlace} ${mood || ''} ${trip.localFriendMode ? 'local cafes hidden gems non-touristy' : 'top nearby spots'} ${CURRENT_YEAR}`,
    5
  );

  const systemInstruction = `You are TripBuddy's Live Trip Companion assisting a traveler ON THE GROUND right now.
Recommend 4 actionable, nearby moves tailored to:
- Current location: ${targetPlace}
- Remaining free time today: ${remainingHours} hours
- Live weather: ${weather ? `${weather.currentTemp}°C, ${weather.currentCondition}${weather.isRaining ? ' (RAINING — prioritize indoor/sheltered stops!)' : ''}` : 'Unknown'}
- Remaining budget: ${trip.targetBudget ? `${trip.currencySymbol || '$'}${remainingBudget} ${trip.currency || 'USD'}` : 'Flexible'}
- Energy & walking tolerance: pace=${trip.paceProfile?.pace || 'moderate'}, walking=${trip.paceProfile?.walkingTolerance || 'medium'}
- Mood / request: ${mood || 'Best use of the next few hours'}
- Local Friend Mode: ${trip.localFriendMode ? 'ON — avoid tourist traps, suggest authentic local haunts.' : 'OFF'}

Return ONLY valid JSON:
{
  "summary": "Brief, practical on-the-ground advice (1–2 sentences).",
  "suggestions": [
    {
      "id": "live-1",
      "title": "Real specific place or experience",
      "neighborhood": "Area / district",
      "category": "food" | "culture" | "attraction" | "nature" | "hidden-gem" | "nightlife",
      "indoorOutdoor": "indoor" | "outdoor" | "mixed",
      "estimatedMinutes": 75,
      "estimatedCost": 18,
      "whyNow": "Why this fits the exact time window and current weather",
      "localTip": "Actionable insider tip (best seat, what to order, timing)"
    }
  ]
}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: `Live web research:\n${searchRes.contextText || 'Use current verified local knowledge.'}` }],
    expectJson: true,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawList: LiveSuggestion[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

  const suggestions = await Promise.all(
    rawList.slice(0, 4).map(async (item, idx) => {
      const geo = await geocodePlace(`${item.title}, ${item.neighborhood || ''}`, targetPlace);
      return {
        ...item,
        id: item.id || `live-${Date.now()}-${idx}`,
        estimatedMinutes: Number(item.estimatedMinutes) || 60,
        estimatedCost: Number(item.estimatedCost) || 0,
        lat: geo?.lat,
        lon: geo?.lon,
      };
    })
  );

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
    tavilySearch(`average round trip flight cost ${origin} to ${destination} ${currency} ${CURRENT_YEAR}`, 4),
    tavilySearch(`${destination} average daily travel cost hotel food transport ${currency} ${CURRENT_YEAR}`, 5),
  ]);

  const sources = dedupeSources([...flightSearch.sources, ...dailyCostSearch.sources]);

  const systemInstruction = `You are TripBuddy's AI Trip Cost Reality Check Auditor (${CURRENT_YEAR}).
Be ruthlessly honest, practical, and grounded in REAL ${CURRENT_YEAR} pricing — never flatter an unrealistic budget!
Evaluate whether ${currencySymbol}${userBudget} ${currency} is realistic for ${travelers} traveler(s) spending ${duration} days in ${destination} departing from ${origin}.

Return ONLY valid JSON:
{
  "verdict": "realistic" | "tight" | "unrealistic",
  "headline": "Sharp, honest 1-line assessment",
  "summary": "2–3 sentences diagnosing what is realistic vs. underestimated based on real ${CURRENT_YEAR} prices.",
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
      "description": "Specific neighborhood, transit pass, or booking swap that saves real money without ruining the trip.",
      "actionPrompt": "Apply this exact cost-saving swap to my trip itinerary and budget: ..."
    }
  ]
}
Include all 5 categories: flights, stay, food, activities, misc. All numeric values must be in ${currency} for ALL ${travelers} traveler(s) combined.`;

  const prompt = `Trip: ${origin} -> ${destination}, ${duration} days, ${travelers} traveler(s)
User Target Budget: ${currencySymbol}${userBudget} ${currency}
Current Estimated Breakdown: ${JSON.stringify(trip.budgetEstimate || {})}

LIVE FLIGHT PRICING RESEARCH (${CURRENT_YEAR}):
${flightSearch.contextText}

LIVE DESTINATION DAILY COST RESEARCH (${CURRENT_YEAR}):
${dailyCostSearch.contextText}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    useSearchGrounding: model === 'gemini-4-hydrogen' && sources.length === 0,
    expectJson: true,
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

  const destinationContext = [trip.destination, trip.country].filter(Boolean).join(', ') || 'a mutually suitable global destination';
  const searchRes = await tavilySearch(
    `group travel itinerary ${destinationContext} diverse interests ${members.flatMap((m) => m.interests).slice(0, 6).join(' ')} ${CURRENT_YEAR}`,
    5
  );

  const budgets = members.map((m) => Number(m.maxBudget) || 0).filter((b) => b > 0);
  const sharedCeiling = budgets.length > 0 ? Math.min(...budgets) : trip.targetBudget || 1500;
  const duration = Math.max(2, trip.durationDays || 4);

  const systemInstruction = `You are TripBuddy's Group Travel Decision Maker.
You must combine ${members.length} travelers' distinct budgets, paces, interests, must-haves, and strict vetoes into ONE fair, joyful itinerary for ${destinationContext} (${duration} days) that everyone agrees on.
CRITICAL RULES:
- Respect every member's VETOES strictly — never include vetoed activities.
- Keep per-person costs within the group's shared budget ceiling (${trip.currencySymbol}${sharedCeiling} ${trip.currency} per person) OR clearly mark optional split blocks so lower-budget travelers aren't pressured.
- Use smart split-afternoon or dual-option blocks when pace or interests diverge strongly.

Return ONLY valid JSON:
{
  "reply": "Warm, clear explanation to the group explaining how you balanced everyone's priorities.",
  "consensus": {
    "summary": "2-sentence overview of the group strategy.",
    "sharedBudgetCeiling": ${sharedCeiling},
    "commonInterests": ["Overlap 1", "Overlap 2"],
    "tradeoffsResolved": ["How conflict 1 was solved fairly", "How conflict 2 was solved"],
    "memberNotes": [
      { "name": "Member Name", "satisfiedBy": "Which days/stops deliver their top priorities while respecting vetoes" }
    ]
  },
  "budgetEstimate": { "flights": 0, "stay": 0, "food": 0, "activities": 0, "misc": 0 },
  "days": [ ...full ItineraryDay[] array with real specific places... ]
}`;

  const prompt = `Destination: ${destinationContext}
Duration: ${duration} days
Currency: ${trip.currency} (${trip.currencySymbol})
Group Members:
${JSON.stringify(members, null, 2)}

Live Research:
${searchRes.contextText}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: prompt }],
    expectJson: true,
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
    `underrated unexpected travel destinations from ${origin || 'anywhere'} ${durationDays} days ${vibe} ${personality} travel deals ${CURRENT_YEAR}`,
    6
  );

  const systemInstruction = `You are TripBuddy's Surprise Me Mode Global Destination Scout (${CURRENT_YEAR}).
Suggest 3 UNEXPECTED, genuinely exciting global destinations (avoid overly cliché obvious defaults unless a unique angle makes them fit) tailored to:
- Departing from: ${origin || 'Flexible global origin'}
- Available days: ${durationDays} days
- Target budget: ${sym}${budget} ${currency}
- Travel personality: ${personality}
- Preferred vibe / interests: ${vibe}

Make sure every destination is realistically achievable within ${durationDays} days and roughly within ${sym}${budget} ${currency} (accounting for travel distance from ${origin || 'major hubs'}).

Return ONLY valid JSON:
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
      "whyItFits": "2 sentences linking their exact personality, budget, and travel time from origin",
      "highlights": ["Specific unique highlight 1", "Highlight 2", "Highlight 3"],
      "seasonNote": "Current seasonal/weather & crowd insight"
    }
  ]
}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: `Live global travel trends:\n${searchRes.contextText}` }],
    expectJson: true,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawPitches: any[] = Array.isArray(parsed?.pitches) ? parsed.pitches : [];

  const pitches: SurprisePitch[] = await Promise.all(
    rawPitches.slice(0, 3).map(async (p, idx) => {
      const geo = await geocodePlace(`${p.destination}, ${p.country}`);
      return {
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
        lat: geo?.lat,
        lon: geo?.lon,
      };
    })
  );

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
    6
  );

  const systemInstruction = `You are acting in AI LOCAL FRIEND MODE — a warm, plugged-in local resident of ${place}.
Recommend 6 genuine, real, underrated non-touristy spots (hidden cafés, neighborhood food joints, quiet viewpoints, independent galleries, evening hangouts, or artisan walks) in ${place}.
Focus requested: ${focus || 'Mix of cafés, local food, neighborhood walks, and underrated culture'}.
Exclude generic top-3 tourist traps. Use real venue & neighborhood names. Estimate costs in ${currency}.

Return ONLY valid JSON:
{
  "localIntro": "Warm 2-sentence note from a local friend sharing how to feel the real rhythm of ${place}.",
  "gems": [
    {
      "id": "gem-1",
      "title": "Real specific venue or spot name",
      "neighborhood": "Specific neighborhood",
      "category": "hidden-gem" | "food" | "culture" | "nature" | "nightlife",
      "whyLocalsLoveIt": "What makes locals actually go here",
      "bestTime": "Exact best time/day to visit",
      "estimatedCost": 15,
      "insiderTip": "Specific local move (what to order, side entrance, nearby street)",
      "pinnedOnMap": true
    }
  ]
}`;

  const aiRes = await callAI({
    model,
    systemInstruction,
    messages: [{ role: 'user', content: `Recent local discoveries web search:\n${searchRes.contextText}` }],
    expectJson: true,
  });

  const parsed = extractJsonObject<any>(aiRes.text);
  const rawGems: any[] = Array.isArray(parsed?.gems) ? parsed.gems : [];

  const gems: HiddenGemItem[] = await Promise.all(
    rawGems.slice(0, 6).map(async (g, idx) => {
      const geo = await geocodePlace(`${g.title}, ${g.neighborhood || ''}`, place);
      return {
        id: g.id || `gem-${Date.now()}-${idx}`,
        title: g.title,
        neighborhood: g.neighborhood || place,
        category: g.category || 'hidden-gem',
        whyLocalsLoveIt: g.whyLocalsLoveIt || '',
        bestTime: g.bestTime || 'Late afternoon',
        estimatedCost: Number(g.estimatedCost) || 0,
        insiderTip: g.insiderTip || '',
        lat: geo?.lat,
        lon: geo?.lon,
        pinnedOnMap: true,
      };
    })
  );

  return {
    gems,
    localIntro: parsed?.localIntro || `Here are the neighborhood spots locals actually love in ${place}.`,
    sources: dedupeSources([...searchRes.sources, ...aiRes.groundingSources]),
    modelUsed: aiRes.modelUsed,
  };
}
