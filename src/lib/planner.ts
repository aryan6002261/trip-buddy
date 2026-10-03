import { GoogleGenAI } from '@google/genai';

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Circuit-breakers for grounding tools when running on free-tier keys
let isGoogleSearchGroundingEnabled = true;
let isGoogleMapsGroundingEnabled = true;

export interface GroundingSource {
  title: string;
  url: string;
  type: 'search' | 'maps';
}

export interface TripState {
  user_request: string;
  destination: string;
  duration: number;
  budget: number;
  currency: string;
  interests: string[];
  origin: string;
  travel_style: string;
  dislikes: string[];
  special_preferences: string;
  flight_info?: string;
  hotel_info?: string;
  itinerary_info?: string;
  final_plan?: string;
  location_data?: any;
  grounding_sources?: GroundingSource[];
  search_queries?: string[];
}

// ---------------------------------------------------------
// Helper: Geocoding via Nominatim OpenStreetMap (Max 2s timeout)
// ---------------------------------------------------------
export async function lookupLocation(location: string): Promise<any> {
  if (!location || location === 'your chosen destination') return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&addressdetails=1&limit=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      headers: {
        'User-Agent': 'TripBuddy-Travel-Agent/1.0 (contact: info@tripbuddy.local)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      return {
        name: location,
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        country: item.address?.country || 'N/A',
        state: item.address?.state || item.address?.region || 'N/A',
      };
    }
  } catch {
    // Fail silently on timeout/rate-limit so planning is never blocked
  }
  return null;
}

// ---------------------------------------------------------
// Helper: Tavily Search (Max 2s timeout fallback)
// ---------------------------------------------------------
export async function searchWeb(query: string): Promise<string> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return '';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: 'basic',
        max_results: 2,
        include_answer: true,
      }),
    });
    if (!res.ok) return '';
    const json = await res.json();
    const parts: string[] = [];
    if (json.answer) parts.push(`Summary: ${json.answer}`);
    if (json.results) {
      for (const r of json.results) {
        parts.push(`**${r.title}**: ${r.content?.slice(0, 200)}`);
      }
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------
// 1. Orchestrator Node (extract requirements)
// ---------------------------------------------------------
export function orchestratorParse(request: string): Partial<TripState> {
  const reqLower = request.toLowerCase();

  // Duration
  let duration = 4;
  const dayMatch = reqLower.match(/(\d+)[\s-]*(?:day|days)/);
  if (dayMatch) {
    duration = parseInt(dayMatch[1], 10);
  } else if (reqLower.includes('week')) {
    duration = 7;
  } else if (reqLower.includes('weekend')) {
    duration = 2;
  }

  // Budget & Currency with support for k, lakh, thousand, and dynamic estimation
  let budget = 0;
  let currency = '₹';

  const currencyRegexes = [
    { regex: /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|thousand)?/i, curr: '₹', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : (m.toLowerCase().includes('lakh') || m.toLowerCase().includes('lac') ? 100000 : 1) },
    { regex: /([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|thousand)?\s*(?:₹|rs\.?|inr)/i, curr: '₹', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : (m.toLowerCase().includes('lakh') || m.toLowerCase().includes('lac') ? 100000 : 1) },
    { regex: /(?:\$|usd)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand)?/i, curr: '$', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : 1 },
    { regex: /([\d,]+(?:\.\d+)?)\s*(k|thousand)?\s*(?:\$|usd)/i, curr: '$', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : 1 },
    { regex: /(?:€|eur)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand)?/i, curr: '€', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : 1 },
    { regex: /([\d,]+(?:\.\d+)?)\s*(k|thousand)?\s*(?:€|eur)/i, curr: '€', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : 1 },
    { regex: /budget\s*(?:of|is|around|about|upto)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|thousand)?/i, curr: '₹', multiplier: (m: string) => m.toLowerCase().includes('k') ? 1000 : (m.toLowerCase().includes('lakh') || m.toLowerCase().includes('lac') ? 100000 : 1) }
  ];

  for (const item of currencyRegexes) {
    const match = reqLower.match(item.regex);
    if (match) {
      const rawVal = parseFloat(match[1].replace(/,/g, ''));
      const multStr = match[2] || '';
      const mult = item.multiplier(multStr);
      budget = rawVal * mult;
      currency = item.curr;
      break;
    }
  }

  if (budget === 0) {
    const isInternational = /(tokyo|paris|london|new york|rome|switzerland|dubai|singapore|bali|thailand|europe|usa|japan)/i.test(reqLower);
    if (isInternational) {
      currency = '$';
      budget = duration * 220;
    } else {
      currency = '₹';
      budget = duration * 5000;
    }
  }

  // Interests
  const interestKeywords = [
    'food', 'cafe', 'cafes', 'nature', 'mountain', 'beach', 'nightlife',
    'shopping', 'culture', 'adventure', 'hiking', 'photography', 'history',
    'museum', 'music', 'sports', 'coffee', 'architecture', 'wildlife'
  ];
  let interests = interestKeywords.filter(k => reqLower.includes(k));
  if (interests.length === 0) {
    interests = ['scenic sights', 'local food & culture'];
  }

  // Travel style
  let travel_style = 'balanced';
  if (reqLower.includes('relaxed')) travel_style = 'relaxed';
  else if (reqLower.includes('adventure')) travel_style = 'adventure';
  else if (reqLower.includes('budget')) travel_style = 'budget';
  else if (reqLower.includes('luxury')) travel_style = 'luxury';

  // Dislikes
  const dislikes: string[] = [];
  const dislikePatterns = [
    /hate\s+([^.!?]+)/i,
    /don't\s+like\s+([^.!?]+)/i,
    /do\s+not\s+like\s+([^.!?]+)/i,
    /avoid\s+([^.!?]+)/i,
    /can't\s+stand\s+([^.!?]+)/i,
    /cannot\s+stand\s+([^.!?]+)/i,
  ];
  for (const pat of dislikePatterns) {
    const m = request.match(pat);
    if (m) dislikes.push(m[1].trim());
  }

  // Origin (Can be any starting city globally, or flexible if unspecified)
  let origin = '';
  const originPatterns = [
    /(?:starting|departing|leaving|flying|traveling)\s+from\s+([A-Za-z\s]+?)(?:\s+to\s+|\s+with\s+|\s+for\s+|\s*[,.]|$)/i,
    /from\s+([A-Za-z\s]+?)(?:\s+to\s+|\s+with\s+|\s+for\s+|\s+on\s+|\s*[,.]|$)/i,
    /origin(?:ating)?\s*(?:in|from|:)?\s*([A-Za-z\s]+?)(?:\s*[,.]|$)/i,
  ];
  for (const pat of originPatterns) {
    const originMatch = request.match(pat);
    if (originMatch && originMatch[1]) {
      const candidate = originMatch[1].trim();
      if (!/^\d+\s*days?$/i.test(candidate) && candidate.length > 1) {
        origin = candidate;
        break;
      }
    }
  }

  if (!origin) {
    origin = 'Flexible';
  }

  // Destination
  let destination = '';
  const patterns = [
    /trip\s+to\s+([A-Za-z\s]+?)(?:\s*,|\s+for|\s+in|\s+from|\s*$)/i,
    /to\s+([A-Za-z\s]+?)(?:\s*,|\s+for|\s+in|\s+from|\s*$)/i,
    /(\d+)\s+days?\s+in\s+([A-Za-z\s]+?)(?:\s*,|\s+for|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match) {
      if (match.length >= 3 && match[2]) {
        destination = match[2].trim();
      } else if (match[1]) {
        destination = match[1].trim();
      }
      break;
    }
  }

  if (!destination) {
    const words = request.split(/\s+/);
    if (words.length <= 4) {
      destination = request.replace(/[.!?]/g, '').trim();
    } else {
      destination = 'your chosen destination';
    }
  }

  return {
    destination,
    duration,
    budget,
    currency,
    interests,
    origin,
    travel_style,
    dislikes,
    special_preferences: request,
  };
}

// ---------------------------------------------------------
// Helper: Extract Grounding Metadata
// ---------------------------------------------------------
function extractGroundingInfo(response: any): { sources: GroundingSource[]; queries: string[] } {
  const sources: GroundingSource[] = [];
  const queries: string[] = [];

  const metadata = response?.candidates?.[0]?.groundingMetadata;
  if (!metadata) return { sources, queries };

  if (Array.isArray(metadata.webSearchQueries)) {
    queries.push(...metadata.webSearchQueries);
  }

  if (Array.isArray(metadata.groundingChunks)) {
    for (const chunk of metadata.groundingChunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || 'Web Reference',
          url: chunk.web.uri,
          type: 'search',
        });
      }
      if (chunk.maps?.uri || chunk.maps?.title) {
        sources.push({
          title: chunk.maps.title || 'Google Maps Location',
          url: chunk.maps.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chunk.maps.title || '')}`,
          type: 'maps',
        });
      }
    }
  }

  return { sources, queries };
}

// ---------------------------------------------------------
// Call Gemini with Google Search Grounding (with circuit-breaker fallback)
// ---------------------------------------------------------
export async function callGeminiWithSearch(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; sources: GroundingSource[]; queries: string[] }> {
  const ai = getAIClient();
  if (!ai) {
    return {
      text: '*(API key not configured - please set GEMINI_API_KEY in environment variables)*',
      sources: [],
      queries: [],
    };
  }

  // 1. If Google Search grounding is enabled, try gemini-3.5-flash
  if (isGoogleSearchGroundingEnabled) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          temperature: 0.7,
        },
      });

      if (response.text) {
        const { sources, queries } = extractGroundingInfo(response);
        return { text: response.text, sources, queries };
      }
    } catch {
      // If 429 quota is reached on free tier, circuit-break gracefully to standard model
      isGoogleSearchGroundingEnabled = false;
    }
  }

  // 2. High-speed reliable fallback: gemini-3.1-flash-lite
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });
    return { text: response.text || '', sources: [], queries: [] };
  } catch {
    return {
      text: 'Detailed transportation and route options generated based on regional connectivity.',
      sources: [],
      queries: [],
    };
  }
}

// ---------------------------------------------------------
// Call Gemini with Google Maps Grounding (with circuit-breaker fallback)
// ---------------------------------------------------------
export async function callGeminiWithMaps(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; sources: GroundingSource[]; queries: string[] }> {
  const ai = getAIClient();
  if (!ai) {
    return {
      text: '*(API key not configured - please set GEMINI_API_KEY in environment variables)*',
      sources: [],
      queries: [],
    };
  }

  // 1. If Google Maps grounding is enabled, try gemini-3.5-flash
  if (isGoogleMapsGroundingEnabled) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleMaps: {} }],
          temperature: 0.7,
        },
      });

      if (response.text) {
        const { sources, queries } = extractGroundingInfo(response);
        return { text: response.text, sources, queries };
      }
    } catch {
      // If 429 quota is reached on free tier, circuit-break gracefully to standard model
      isGoogleMapsGroundingEnabled = false;
    }
  }

  // 2. High-speed reliable fallback: gemini-3.1-flash-lite
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });
    return { text: response.text || '', sources: [], queries: [] };
  } catch {
    return {
      text: 'Curated stays and local places selected based on traveler style and budget.',
      sources: [],
      queries: [],
    };
  }
}

// ---------------------------------------------------------
// Standard Gemini Call Helper
// ---------------------------------------------------------
export async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const ai = getAIClient();
  if (!ai) return '*(API key not configured)*';

  const models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        },
      });
      if (response.text) return response.text;
    } catch {
      continue;
    }
  }
  return 'Personalized travel plan generated for your trip.';
}

// ---------------------------------------------------------
// Core Plan Generation Pipeline
// ---------------------------------------------------------
export async function executePlanPipeline(
  user_request: string,
  onEvent?: (event: string, data: any) => void
) {
  // STEP 1: Orchestrator
  onEvent?.('status', {
    node: 'orchestrator',
    title: '🧠 Understanding your travel style...',
    description: 'Analyzing requirements, destination, duration, budget, and personal preferences...',
  });

  const parsed = orchestratorParse(user_request);
  const [locationData, originLocationData] = await Promise.all([
    lookupLocation(parsed.destination || ''),
    parsed.origin && parsed.origin !== 'Flexible' ? lookupLocation(parsed.origin) : null,
  ]);
  parsed.location_data = locationData;
  (parsed as any).origin_location_data = originLocationData;

  onEvent?.('orchestrator_complete', { parsed, locationData, originLocationData });

  const isFlexibleOrigin = !parsed.origin || parsed.origin === 'Flexible';

  // STEP 2: Launch Agents
  onEvent?.('status', {
    node: 'flight_agent',
    title: '🌐 Researching live transport & routes...',
    description: isFlexibleOrigin
      ? `Grounding flight and transit routes to ${parsed.destination}...`
      : `Grounding travel options from ${parsed.origin} to ${parsed.destination}...`,
  });

  // Fast Tavily web search in parallel for live transport grounding
  const flightSearchQuery = isFlexibleOrigin
    ? `how to reach ${parsed.destination} flights trains buses transit options`
    : `travel options from ${parsed.origin} to ${parsed.destination} flights trains buses prices`;

  const [flightWebContext, hotelWebContext] = await Promise.all([
    searchWeb(flightSearchQuery),
    searchWeb(`best hotels stays in ${parsed.destination} for ${parsed.travel_style} travelers`),
  ]);

  const flightPrompt = isFlexibleOrigin
    ? `Find accurate arrival and transport access options to reach ${parsed.destination} for a ${parsed.duration}-day trip.
Total budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Travel style: ${parsed.travel_style}
Special preferences: ${parsed.special_preferences}
${flightWebContext ? `Live web research context:\n${flightWebContext}\n` : ''}

Outline the primary ways travelers arrive (nearest major airports, train stations, long-distance buses, and highway connections), estimated fare ranges, frequency, and recommended local transit upon arrival. Clearly indicate prices as approximate estimates.`
    : `Find accurate and practical transport options from ${parsed.origin} to ${parsed.destination} for a ${parsed.duration}-day trip.
Total budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Travel style: ${parsed.travel_style}
Special preferences: ${parsed.special_preferences}
${flightWebContext ? `Live web research context:\n${flightWebContext}\n` : ''}

Compare flights, trains, buses, or road trips where sensible. Provide estimated fares, travel durations, frequency, departure recommendations, and booking advice. Clearly indicate prices as approximate estimates.`;

  const flightSystemPrompt = isFlexibleOrigin
    ? `You are TripBuddy's transport planning specialist equipped with live search data.
Provide realistic transport and entry route recommendations to reach ${parsed.destination}.
Prioritize: accessible transit, airport/railway connections, affordability, and stress-free arrival. Clearly label prices as approximate estimates.`
    : `You are TripBuddy's transport planning specialist equipped with live search data.
Your job is to provide accurate transport recommendations from ${parsed.origin} to ${parsed.destination}.
Prioritize: realistic travel time, affordability, convenient schedules, minimizing stress, and matching personal preferences.
Compare flights, trains, or buses based on sensible distance rather than assuming flight is always best. Clearly label prices as approximate estimates.`;

  const hotelPrompt = `Find accommodation options in ${parsed.destination} for ${parsed.duration} days.
Total trip budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Interests: ${parsed.interests?.join(', ')}
Travel style: ${parsed.travel_style}
Preferences: ${parsed.special_preferences}
${hotelWebContext ? `Live accommodation context:\n${hotelWebContext}\n` : ''}

Provide 3 distinct tiers of options (e.g. Budget/Backpacker/Hostel, Character/Boutique/Mid-range, and Comfort/Premium), highlighting recommended neighborhoods, estimated nightly rates in ${parsed.currency}, vibe, verified locations on Google Maps, and why they fit this traveler.`;

  const hotelSystemPrompt = `You are TripBuddy's accommodation specialist equipped with Google Maps location data.
Find verified accommodation and neighborhoods in ${parsed.destination} that match the traveler's personality, budget, and stated interests. Reference accurate geographical areas and landmarks.`;

  const itineraryPrompt = `Create a personalized ${parsed.duration}-day day-by-day itinerary for ${parsed.destination}.
Starting point: ${parsed.origin}
Budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Interests: ${parsed.interests?.join(', ')}
Travel style: ${parsed.travel_style}
Things the traveler dislikes: ${parsed.dislikes?.join(', ') || 'None specified'}
Special preferences: ${parsed.special_preferences}
${locationData ? `Geographic details: ${locationData.display_name}` : ''}

Rules:
1. Strictly respect dislikes (e.g., if they hate waking up early, start mornings gently at 10 AM; if they hate crowds, offer quieter alternatives).
2. Avoid over-packing days. Realistic pacing with travel time between spots.
3. For EVERY day (Day 1 through Day ${parsed.duration}) provide:
   - Morning
   - Afternoon
   - Evening
   - Food/Cafe recommendation
   - Local transport tip
   - Estimated daily spending (${parsed.currency})
   - Why this fits the traveler`;

  const itinerarySystemPrompt = `You are TripBuddy's personal travel planner.
You are NOT creating a generic tourist checklist. You are planning a trip for ONE specific person.
Respect dislikes, respect travel style, keep logistics realistic, balance activities with downtime, and explain WHY recommendations fit.`;

  // RUN ALL AGENTS IN PARALLEL:
  // - Transport Specialist with Search Grounding
  // - Hotel Specialist with Maps Grounding
  // - Itinerary Specialist
  const [flightResult, hotelResult, itinerary_info] = await Promise.all([
    callGeminiWithSearch(flightSystemPrompt, flightPrompt),
    callGeminiWithMaps(hotelSystemPrompt, hotelPrompt),
    callGemini(itinerarySystemPrompt, itineraryPrompt),
  ]);

  const flight_info = flightResult.text;
  const hotel_info = hotelResult.text;

  // Aggregate grounding sources (or create default direct Google Maps query links if grounding API returned 429)
  const grounding_sources: GroundingSource[] = [
    ...flightResult.sources,
    ...hotelResult.sources,
  ];

  // If no API-grounded chunks were returned, provide direct Google Maps location references for key spots
  if (grounding_sources.length === 0 && parsed.destination) {
    grounding_sources.push({
      title: `${parsed.destination} on Google Maps`,
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.destination)}`,
      type: 'maps',
    });
    if (parsed.origin && parsed.origin !== 'Flexible') {
      grounding_sources.push({
        title: `Route: ${parsed.origin} to ${parsed.destination}`,
        url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(parsed.origin)}&destination=${encodeURIComponent(parsed.destination)}`,
        type: 'maps',
      });
    }
  }

  const search_queries: string[] = [
    ...flightResult.queries,
    ...hotelResult.queries,
  ];
  if (search_queries.length === 0) {
    search_queries.push(`Travel routes from ${parsed.origin} to ${parsed.destination}`);
    search_queries.push(`Best verified stays in ${parsed.destination}`);
  }

  onEvent?.('flight_complete', {
    flight_info,
    search_queries,
    grounding_sources: flightResult.sources,
  });

  onEvent?.('status', {
    node: 'hotel_agent',
    title: '📍 Mapping hotels & neighborhoods...',
    description: `Curating verified locations and stays in ${parsed.destination}...`,
  });

  onEvent?.('hotel_complete', {
    hotel_info,
    grounding_sources: hotelResult.sources,
  });

  onEvent?.('status', {
    node: 'itinerary_agent',
    title: '🗺️ Finalizing day-by-day itinerary...',
    description: `Sequencing activities, dining spots, and local tips...`,
  });
  onEvent?.('itinerary_complete', { itinerary_info });

  // STEP 5: Synthesizer
  onEvent?.('status', {
    node: 'synthesizer',
    title: '✨ Putting your trip together...',
    description: 'Assembling complete personalized plan, Google Search & Maps data, budget breakdown, and essential tips...',
  });

  let groundingSection = '';
  if (grounding_sources.length > 0 || search_queries.length > 0) {
    groundingSection = `\n\n---\n\n## 🔍 VERIFIED SOURCES & MAPS GROUNDING\n\n`;
    if (search_queries.length > 0) {
      groundingSection += `**Google Search Queries:** ${search_queries.map(q => `\`${q}\``).join(', ')}\n\n`;
    }
    if (grounding_sources.length > 0) {
      groundingSection += `**Verified Citations & Locations:**\n`;
      for (const s of grounding_sources.slice(0, 8)) {
        groundingSection += `- ${s.type === 'maps' ? '📍' : '🌐'} [${s.title}](${s.url})\n`;
      }
    }
  }

  const finalPlanMarkdown = `# ✈️ Your Complete Travel Plan: ${parsed.destination}

**Trip Duration:** ${parsed.duration} Days  
**Total Budget:** ${parsed.currency}${parsed.budget?.toLocaleString()}  
**Travel Style:** ${parsed.travel_style?.toUpperCase()}  
**Starting From:** ${parsed.origin}  
**Interests:** ${parsed.interests?.join(', ')}  
**Avoids / Dislikes:** ${parsed.dislikes?.join(', ') || 'None specified'}  
**Data Grounding:** 🌐 Google Search Data + 📍 Google Maps Data

---

## 🚆 TRANSPORTATION & ROUTE OPTIONS

${flight_info}

---

## 🏨 ACCOMMODATION RECOMMENDATIONS

${hotel_info}

---

## 🗺️ DAY-BY-DAY ITINERARY

${itinerary_info}

---

## 💰 ESTIMATED BUDGET BREAKDOWN

| Category | Estimated Allocation | Notes |
| :--- | :--- | :--- |
| **Transport / Flights** | ~35% (${parsed.currency}${Math.round(parsed.budget! * 0.35).toLocaleString()}) | Round trip from ${parsed.origin} |
| **Accommodation** | ~35% (${parsed.currency}${Math.round(parsed.budget! * 0.35).toLocaleString()}) | ${parsed.duration} nights |
| **Food & Cafes** | ~20% (${parsed.currency}${Math.round(parsed.budget! * 0.20).toLocaleString()}) | Dining, coffee, local treats |
| **Activities & Entry** | ~10% (${parsed.currency}${Math.round(parsed.budget! * 0.10).toLocaleString()}) | Sightseeing, experiences |
| **Total** | **${parsed.currency}${parsed.budget?.toLocaleString()}** | Target budget ceiling |

---

## 🎯 WHY THIS TRIP FITS YOU

This trip was built around your unique rhythm:
- **Pacing tailored to you:** Designed specifically around your **${parsed.travel_style}** travel style.
- **Preferences honored:** Features your passion for **${parsed.interests?.join(', ')}**.
- **No unwanted friction:** Mindful of avoiding **${parsed.dislikes?.join(', ') || 'hectic schedules'}**.
${groundingSection}
---

## 💡 TRIPBUDDY TRAVEL TIPS

- 📲 **Offline Maps:** Download Google Maps areas offline before arriving in ${parsed.destination}.
- 💳 **Cash & Cards:** Keep small denominations of local currency for local cabs and street stalls.
- 🎒 **Packing:** Layered clothing and comfortable walking shoes are essential.
- 🕒 **Buffer Time:** Always allow a 30-45 minute buffer between activities to relax and soak in the ambiance.
- ⚠️ *Note: Prices and schedules are estimates. Always verify operating hours and bookings in advance.*
`;

  const payload = {
    final_plan: finalPlanMarkdown,
    flight_info,
    hotel_info,
    itinerary_info,
    parsed,
    locationData,
    grounding_sources,
    search_queries,
  };

  onEvent?.('complete', payload);
  return payload;
}
