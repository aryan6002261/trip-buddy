# ✈️ TripBuddy

<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Gemini-8B5CF6?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/Tavily-111827?style=for-the-badge&logo=tavily&logoColor=white" />
  <img src="https://img.shields.io/badge/Google%20Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=for-the-badge&logo=openstreetmap&logoColor=white" />
</p>

**Your friend who actually plans the trip.**

TripBuddy is an AI-powered travel planning assistant that turns a natural-language prompt into a structured trip plan with destination research, itinerary suggestions, hotel and flight context, and an interactive location map.

The current app is built with a modern React + Vite frontend and a lightweight Express API layer, using Google Gemini for planning and Tavily for live web grounding.

---

## 🎥 Demo

![Demo](assets/demo.png)

---

## 🌍 What TripBuddy does

Give it a prompt like:

> "I want to spend 5 days in Manali starting from Delhi. My budget is ₹15,000. I love photography, nature and cafés, and I absolutely hate waking up early."

TripBuddy parses the request into trip details, researches the destination, creates a personalized itinerary, and returns a travel plan with an interactive map and travel metadata.

It can handle:

- destination + origin parsing
- duration and budget extraction
- interest and travel-style detection
- itinerary generation with recommendations, alternatives, and pacing
- map-based location rendering
- live grounding from search and geocoding APIs

---

## 🧠 How it works

TripBuddy uses a simple multi-stage planning pipeline:

```text
User prompt
   ↓
Orchestrator / parser
   ↓
Flight + hotel + itinerary reasoning
   ↓
Grounding via Tavily / Nominatim / Maps
   ↓
Final synthesized trip plan
   ↓
Rendered in React chat + map UI
```

The application currently follows this flow:

1. The frontend collects a trip request and sends it to the API.
2. The Express server receives the prompt and calls the planner pipeline.
3. The planner extracts trip details such as destination, budget, origin, interests, and travel style.
4. Gemini generates structured output using grounded web research.
5. The result is streamed back to the UI in real time, including plan content and map data.

---

## ✨ Features

- 💬 Natural-language trip planning from a single prompt
- ✈️ Flight and hotel research context
- 🗺️ Interactive Google Maps view for destinations and stop points
- 📍 OpenStreetMap/Nominatim geocoding for destination and origin lookup
- 🧭 Personalized day-by-day itinerary generation
- 📊 Budget, duration, and travel-style parsing
- 🔎 Tavily grounding for real-time web context
- ⚡ Server-sent events (SSE) for live planning progress
- 🎙️ Voice input using the browser Web Speech API
- 🧠 Model-aware planning with Google Gemini fallback paths
- 🧹 Clear-trip and prompt-reset flows in the UI

---

## 🛠️ Tech stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React + Vite + TypeScript |
| UI components | Tailwind CSS + Lucide icons |
| Backend | Express.js |
| AI inference | Google Gemini (`@google/genai`) |
| Search grounding | Tavily |
| Maps | Google Maps JavaScript API |
| Geocoding | OpenStreetMap / Nominatim |
| Hosting | Vercel-ready serverless API + local dev server |

---

## 📁 Project structure

```text
trip-buddy/
├── api/
│   ├── index.ts
│   ├── status.ts
│   ├── plan.ts
│   └── plan/
│       ├── planner.ts
│       └── stream.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── types.ts
│   └── components/
│       ├── Sidebar.tsx
│       ├── GoogleMapView.tsx
│       ├── MockMap.tsx
│       ├── PlanCard.tsx
│       ├── ProgressIndicator.tsx
│       ├── MarkdownRenderer.tsx
│       └── ExpenseBreakdown.tsx
├── assets/
│   └── demo.png
├── .env.example
├── .gitignore
├── index.html
├── LICENSE
├── package.json
├── server.ts
├── tsconfig.json
├── vite.config.ts
├── README.md
└── bun.lock
```

---

## 🚀 Getting started

### Prerequisites

Make sure you have:

- Node.js 18+
- npm or Bun
- A Google Gemini API key
- A Tavily API key
- An optional Google Maps API key for map rendering

### 1. Clone the repository

```bash
git clone https://github.com/aryan6002261/trip-buddy.git
cd trip-buddy
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Example `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

Notes:

- `GEMINI_API_KEY` is required for planning.
- `TAVILY_API_KEY` enables real-time grounding and research.
- `VITE_GOOGLE_MAPS_API_KEY` is optional but recommended for the live map view.

### 4. Run the app locally

```bash
npm run dev
```

The app starts on the Express server with Vite middleware enabled for local development, usually on:

```text
http://localhost:3000
```

### 5. Production build

```bash
npm run build
npm run start
```

This runs the built frontend and serves it through the Express production server.

---

## 🧪 Useful commands

```bash
npm run dev      # start local development server
npm run build    # create the production bundle
npm run start    # run the production build
npm run lint     # TypeScript check
```

---

## 💬 Example prompts

Try prompts like:

- 🏔️ "Plan a 4-day trip to Goa starting from Mumbai. Budget is ₹20,000. I love beaches, seafood, and sunset viewpoints."
- 🏕️ "I want to spend 5 days in Manali, starting from Delhi. My budget is ₹15,000. I love photography, nature and cafes. I prefer relaxed trips and hate waking up early."
- 🏯 "Plan a 5-day cultural trip to Kyoto starting from Tokyo. Budget $1,800. Interested in temples, ramen and traditional gardens."
- 🌊 "Plan 4 days on the Amalfi Coast starting from Rome. Budget €1,500. Scenic drives, beaches and Italian dining."

---

## 🔌 API endpoints

The app exposes a few lightweight endpoints for status and planning:

```text
GET  /api/status
GET  /api/maps-key
POST /api/plan
POST /api/plan/stream
```

The streaming endpoint returns SSE events so the frontend can show live progress while the trip is being generated.

---

## ⚠️ Disclaimer

TripBuddy is an AI-assisted travel planner. It can provide helpful recommendations, but prices, opening hours, availability, and route details may change without notice.

Always verify critical information directly with airlines, hotels, local providers, and official sources before booking or traveling.

---

## 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Open a pull request

---

## 👨‍💻 Built with curiosity

Built to make travel planning feel less like admin work and more like having a helpful local friend in your pocket. ☕✈️

**TripBuddy** — *your friend who actually plans the trip.*