import { GoogleGenAI } from '@google/genai';

// Initialize Gemini Client
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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
}

// ---------------------------------------------------------
// Helper: Geocoding via Nominatim OpenStreetMap
// ---------------------------------------------------------
export async function lookupLocation(location: string): Promise<any> {
  if (!location || location === 'Unknown destination') return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&addressdetails=1&limit=1`;
    const res = await fetch(url, {
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
  } catch (err) {
    console.warn('Nominatim lookup error:', err);
  }
  return null;
}

// ---------------------------------------------------------
// Helper: Tavily Search (if key present)
// ---------------------------------------------------------
export async function searchWeb(query: string): Promise<string> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return '';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: 'basic',
        max_results: 3,
        include_answer: true,
      }),
    });
    if (!res.ok) return '';
    const json = await res.json();
    const parts: string[] = [];
    if (json.answer) parts.push(`Summary: ${json.answer}`);
    if (json.results) {
      for (const r of json.results) {
        parts.push(`**${r.title}**: ${r.content?.slice(0, 300)}`);
      }
    }
    return parts.join('\n\n');
  } catch (err) {
    console.warn('Tavily search error:', err);
    return '';
  }
}

// ---------------------------------------------------------
// 1. Orchestrator Node (extract requirements)
// ---------------------------------------------------------
export function orchestratorParse(request: string): Partial<TripState> {
  const reqLower = request.toLowerCase();

  // Duration
  let duration = 5;
  const dayMatch = reqLower.match(/(\d+)[\s-]*(?:day|days)/);
  if (dayMatch) {
    duration = parseInt(dayMatch[1], 10);
  } else if (reqLower.includes('week')) {
    duration = 7;
  } else if (reqLower.includes('weekend')) {
    duration = 2;
  }

  // Budget & Currency
  let budget = 15000;
  let currency = '₹';
  const inrMatch = reqLower.match(/(?:₹|rs\.?|inr)\s*([\d,]+)/);
  const usdMatch = reqLower.match(/(?:\$|usd)\s*([\d,]+)/);
  const eurMatch = reqLower.match(/(?:€|eur)\s*([\d,]+)/);

  if (inrMatch) {
    budget = parseFloat(inrMatch[1].replace(/,/g, ''));
    currency = '₹';
  } else if (usdMatch) {
    budget = parseFloat(usdMatch[1].replace(/,/g, ''));
    currency = '$';
  } else if (eurMatch) {
    budget = parseFloat(eurMatch[1].replace(/,/g, ''));
    currency = '€';
  }

  // Interests
  const interestKeywords = [
    'food', 'cafe', 'cafes', 'nature', 'mountain', 'beach', 'nightlife',
    'shopping', 'culture', 'adventure', 'hiking', 'photography', 'history',
    'museum', 'music', 'sports', 'coffee', 'architecture', 'wildlife'
  ];
  let interests = interestKeywords.filter(k => reqLower.includes(k));
  if (interests.length === 0) {
    interests = ['general travel', 'local sights'];
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

  // Origin
  let origin = 'Delhi';
  const originMatch = request.match(/from\s+([A-Za-z\s]+?)(?:\s+to\s+|\s*[,.])/i);
  if (originMatch) {
    origin = originMatch[1].trim();
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
// Call AI Helper (Gemini or OpenRouter)
// ---------------------------------------------------------
export async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    if (process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
      const model = process.env.DEFAULT_MODEL || 'openai/gpt-oss-20b:free';
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'TripBuddy',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
        })
      });
      if (!res.ok) {
         throw new Error(`OpenRouter Error: ${res.statusText}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });
    return response.text || '';
  } catch (err: any) {
    console.error('AI generation error:', err);
    return `Note: AI generation note (${err.message || 'connection issue'}). Using fallback planner recommendations.`;
  }
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
  const locationData = await lookupLocation(parsed.destination || '');
  parsed.location_data = locationData;

  onEvent?.('orchestrator_complete', { parsed, locationData });

  // STEP 2: Flight Agent
  onEvent?.('status', {
    node: 'flight_agent',
    title: '🚆 Finding the best way to get there...',
    description: `Exploring travel options from ${parsed.origin} to ${parsed.destination} for a ${parsed.duration}-day trip...`,
  });

  const flightTavilySearch = await searchWeb(`travel options from ${parsed.origin} to ${parsed.destination} flights trains buses`);
  const flightPrompt = `Find practical transport options from ${parsed.origin} to ${parsed.destination} for a ${parsed.duration}-day trip.
Total budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Travel style: ${parsed.travel_style}
Special preferences: ${parsed.special_preferences}
${flightTavilySearch ? `Web search context:\n${flightTavilySearch}\n` : ''}

Compare flights, trains, buses, or road trips where sensible. Provide estimated fares, travel durations, frequency, departure recommendations, and booking advice. Label all prices as approximate estimates.`;

  const flightSystemPrompt = `You are TripBuddy's transport planning specialist.
Your job is to help a real person plan practical transport.
Prioritize: realistic travel time, affordability, convenient schedules, minimizing stress, and matching personal preferences.
Compare flights, trains, or buses based on sensible distance rather than assuming flight is always best. Clearly label prices as approximate estimates.`;

  const flight_info = await callGemini(flightSystemPrompt, flightPrompt);
  onEvent?.('flight_complete', { flight_info });

  // STEP 3: Hotel Agent
  onEvent?.('status', {
    node: 'hotel_agent',
    title: '🏨 Finding places that fit your style...',
    description: `Curating accommodations in ${parsed.destination} that match ${parsed.travel_style} vibe and budget...`,
  });

  const hotelTavilySearch = await searchWeb(`best hotels stays in ${parsed.destination} for ${parsed.travel_style} travelers`);
  const hotelPrompt = `Find accommodation options in ${parsed.destination} for ${parsed.duration} days.
Total trip budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Interests: ${parsed.interests?.join(', ')}
Travel style: ${parsed.travel_style}
Preferences: ${parsed.special_preferences}
${hotelTavilySearch ? `Web search context:\n${hotelTavilySearch}\n` : ''}

Provide 3 distinct tiers of options (e.g. Budget/Backpacker/Hostel, Character/Boutique/Mid-range, and Comfort/Premium), highlighting recommended neighborhoods, estimated nightly rates in ${parsed.currency}, vibe, and why they fit this traveler.`;

  const hotelSystemPrompt = `You are TripBuddy's accommodation specialist.
Find accommodation that matches the traveler's personality, budget, and stated interests (e.g. quiet vs social, near cafes, scenic). Prefer practical recommendations over generic luxury. Clearly label estimates.`;

  const hotel_info = await callGemini(hotelSystemPrompt, hotelPrompt);
  onEvent?.('hotel_complete', { hotel_info });

  // STEP 4: Itinerary Agent
  onEvent?.('status', {
    node: 'itinerary_agent',
    title: '🗺️ Building your personalized itinerary...',
    description: `Crafting day-by-day plan with activities, food spots, and mindful pacing...`,
  });

  const itineraryPrompt = `Create a personalized ${parsed.duration}-day day-by-day itinerary for ${parsed.destination}.
Starting point: ${parsed.origin}
Budget: ${parsed.currency}${parsed.budget?.toLocaleString()}
Interests: ${parsed.interests?.join(', ')}
Travel style: ${parsed.travel_style}
Things the traveler dislikes: ${parsed.dislikes?.join(', ') || 'None specified'}
Special preferences: ${parsed.special_preferences}
${locationData ? `Geographic details: ${locationData.display_name} (Lat: ${locationData.lat}, Lon: ${locationData.lon})` : ''}

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

  const itinerary_info = await callGemini(itinerarySystemPrompt, itineraryPrompt);
  onEvent?.('itinerary_complete', { itinerary_info });

  // STEP 5: Synthesizer
  onEvent?.('status', {
    node: 'synthesizer',
    title: '✨ Putting your trip together...',
    description: 'Assembling complete personalized plan, budget breakdown, and essential tips...',
  });

  const finalPlanMarkdown = `# ✈️ Your Complete Travel Plan: ${parsed.destination}

**Trip Duration:** ${parsed.duration} Days  
**Total Budget:** ${parsed.currency}${parsed.budget?.toLocaleString()}  
**Travel Style:** ${parsed.travel_style?.toUpperCase()}  
**Starting From:** ${parsed.origin}  
**Interests:** ${parsed.interests?.join(', ')}  
**Avoids / Dislikes:** ${parsed.dislikes?.join(', ') || 'None specified'}  

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

---

## 💡 TRIPBUDDY TRAVEL TIPS

- 📲 **Offline Maps:** Download Google Maps or Maps.me areas offline before arriving in ${parsed.destination}.
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
  };

  onEvent?.('complete', payload);
  return payload;
}
