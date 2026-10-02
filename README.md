<a id="top"></a>
# AI Travel Planning Agent — V1 (LangGraph)

> Multi-agent travel planner that turns a single natural language request into a complete trip plan with flights, hotels, and a day-by-day itinerary — powered by LangGraph + OpenRouter.

## Demo

![Demo](assets/demo.png)

## Overview

The AI Travel Planning Agent **V1** uses a **LangGraph `StateGraph`** to orchestrate three specialist sub-agents: a Flight Agent, a Hotel Agent, and an Itinerary Agent. Each sub-agent independently searches the web in real time via Tavily, and a synthesizer node combines their results into one cohesive travel plan. The system is routed through **OpenRouter**, giving you access to multiple free and paid LLMs (Gemini, GPT, Claude, Nemotron, Gemma, and more) from a single API key.

### Architecture

```
User Input
    │
    ▼
┌─────────────────┐
│   Orchestrator   │  Parses destination, duration, budget, interests
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Flight Agent    │  Tavily search → flight options
│  Hotel Agent     │  Tavily search → accommodations
│  Itinerary Agent │  Tavily + Nominatim → day-by-day plan
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Synthesizer    │  Combines into final Markdown plan
└─────────────────┘
```

## Features

- **LangGraph workflow** — explicit state graph with sequential specialist agents
- **OpenRouter multi-model** — switch between free and paid models from the UI
- **Natural language planning** — "Plan a 5-day trip to Sydney, budget $2000, I love art"
- **Real-time web search** via Tavily on every query
- **Geocoding** via OpenStreetMap/Nominatim (no extra key)
- **Streamlit UI** with live per-node progress indicators
- **TDD test suite** — 11 pytest tests covering parsing and workflow wiring

## Tech Stack

| Layer | Technology |
|---|---|
| Agent framework | LangGraph (`langgraph`) + LangChain (`langchain`) |
| LLM routing | OpenRouter (`langchain-openai` base URL) |
| Web search | Tavily Search API |
| Location data | geopy + Nominatim (OpenStreetMap) |
| UI | Streamlit |

## Prerequisites

- Python 3.10 or higher
- An [OpenRouter](https://openrouter.ai/keys) API key
- A [Tavily](https://tavily.com) API key

## Installation

**1. Clone the repository**

```bash
git clone https://github.com/StarterMonk/Travel_Planner_Agent.git
cd Travel_Planner_Agent
```

**2. Create and activate a virtual environment**

```bash
python -m venv venv
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows
```

**3. Install dependencies**

```bash
pip install -r requirements.txt
```

**4. Configure environment variables**

```bash
cp .env.example .env
```

Open `.env` and fill in your API keys (see [Environment Variables](#environment-variables)).

## Usage

```bash
cd "Travel Agent V1"
streamlit run app.py
```

Open the URL shown in your terminal (usually `http://localhost:8501`).

**Example request:**

> *Plan a 5-day trip to Sydney in June, budget $2000, I love art and food*

**What you get back:**

- Suggested outbound and return flights with estimated prices
- Hotel recommendations near key attractions with nightly rates
- A day-by-day itinerary with activities, restaurants, and travel tips

After the plan is generated, you can refine it conversationally.

## Environment Variables

Create a `.env` file in the `Travel Agent V1/` directory with the following keys:

| Variable | Description | Where to get it |
|---|---|---|
| `OPENROUTER_API_KEY` | Routes LLM calls through OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `TAVILY_API_KEY` | Enables real-time web search | [tavily.com](https://tavily.com) |
| `DEFAULT_MODEL` | Optional default model override | OpenRouter model IDs |

```env
OPENROUTER_API_KEY=your_openrouter_key_here
TAVILY_API_KEY=your_tavily_key_here
DEFAULT_MODEL=openai/gpt-oss-20b:free
```

## Project Structure

```text
Travel_Planner_Agent/
├── Travel Agent V1/              # LangGraph implementation (main)
│   ├── app.py                    # Streamlit UI
│   ├── config.py                 # OpenRouter model configuration
│   ├── requirements.txt          # V1 dependencies
│   ├── .env.example              # Env template
│   └── graph/
│       ├── __init__.py
│       ├── state.py              # TravelPlanState definition
│       ├── nodes.py              # Orchestrator + 3 specialist agents
│       ├── tools.py              # Tavily + Nominatim tools
│       └── workflow.py           # StateGraph construction
├── tests/                        # TDD pytest suite
│   ├── test_orchestrator.py
│   └── test_workflow.py
├── requirements.txt              # Root dependencies (mirrors V1)
├── .env.example                  # Root env template
├── README.md
└── assets/
    └── demo.png
```

## Running Tests

```bash
pip install pytest
python -m pytest tests/ -v
```

## License

MIT — see [LICENSE](LICENSE).

[Back to top](#top)
