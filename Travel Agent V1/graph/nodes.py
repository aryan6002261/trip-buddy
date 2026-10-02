"""Agent node implementations for the travel planning workflow.

Each node is a function that takes the current state and returns
state updates. The nodes use LLM with tools to perform their tasks.
"""

import re
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from .state import TravelPlanState
from .tools import tavily_search, find_nearby_places
import config


# ---------------------------------------------------------------------------
# Prompt templates for each specialist agent
# ---------------------------------------------------------------------------

FLIGHT_AGENT_SYSTEM_PROMPT = """You are TripBuddy's transport planning specialist.

Your job is to help a real person plan a practical trip.

Prioritize:
- realistic travel time
- affordability
- convenient departure/arrival times
- minimizing unnecessary transfers
- the traveler's personal preferences

Never invent exact live prices. When searching, clearly label prices as approximate.

The traveler may be using buses, trains, cars, or flights. Choose the most sensible transport rather than assuming flights are always best.
"""


HOTEL_AGENT_SYSTEM_PROMPT = """You are TripBuddy's accommodation specialist.

Find accommodation that matches the traveler's actual personality and budget.

Consider:
- total trip budget
- preferred travel style
- location relative to planned activities
- cafes, food, nightlife, nature, or other stated interests
- whether the traveler wants a quiet or social area
- avoiding unnecessary commuting

Prefer practical recommendations over luxury for its own sake.

Never invent exact prices or availability. Clearly label estimates and tell the user to verify before booking.
"""


ITINERARY_AGENT_SYSTEM_PROMPT = """You are TripBuddy's personal travel planner.

You are NOT creating a generic tourist itinerary.

You are planning a trip for ONE specific person.

Use:
- destination
- duration
- budget
- interests
- origin
- travel style
- things they dislike
- special preferences

The itinerary should feel like it was made specifically for this person.

Important rules:

1. Respect the person's dislikes.
   If they hate early mornings, don't schedule 6 AM activities.

2. Respect their travel style.
   A relaxed traveler should NOT receive an exhausting schedule.

3. Keep the trip realistic.
   Avoid placing attractions that are far apart on the same day.

4. Balance activities with free time.

5. Explain WHY important recommendations fit the traveler.

6. Keep the overall plan within the stated budget.

7. Use web search when current information is needed.

8. Never invent exact opening hours, prices, availability, or transport schedules.
   If uncertain, say that the traveler should verify them.

For every day provide:
- Morning
- Afternoon
- Evening
- Food/cafe suggestion
- Transport considerations
- Approximate spending
- Why this day fits the traveler

End with:
- estimated total budget
- things to book in advance
- things to verify
- personalized travel tips
"""

# ---------------------------------------------------------------------------
# Helper function to create a tool-calling agent
# ---------------------------------------------------------------------------

def _create_agent(system_prompt: str, tools: list) -> create_react_agent:
    """Create a ReAct agent with the given prompt and tools."""
    llm = config.get_llm()
    return create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
    )


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def orchestrator_node(state: TravelPlanState) -> dict:
    """Parse the user's trip request and extract useful preferences."""

    request = state["user_request"]
    request_lower = request.lower()

    # ---------------------------------------------------------
    # Duration
    # ---------------------------------------------------------

    duration = 5

    day_match = re.search(
        r'(\d+)[\s-]*(?:day|days)',
        request_lower
    )

    if day_match:
        duration = int(day_match.group(1))

    elif "week" in request_lower:
        duration = 7

    elif "weekend" in request_lower:
        duration = 2

    # ---------------------------------------------------------
    # Budget
    # ---------------------------------------------------------

    budget = 15000.0

    # ₹15000 / Rs 15000 / INR 15000
    budget_match = re.search(
        r'(?:₹|rs\.?|inr)\s*([\d,]+)',
        request_lower
    )

    if budget_match:
        budget = float(
            budget_match.group(1).replace(",", "")
        )

    # ---------------------------------------------------------
    # Interests
    # ---------------------------------------------------------

    interest_keywords = [
        "food",
        "cafe",
        "cafes",
        "nature",
        "mountain",
        "beach",
        "nightlife",
        "shopping",
        "culture",
        "adventure",
        "hiking",
        "photography",
        "history",
        "museum",
        "music",
        "sports",
        "coffee",
        "architecture",
        "wildlife"
    ]

    interests = [
        keyword
        for keyword in interest_keywords
        if keyword in request_lower
    ]

    if not interests:
        interests = ["general travel"]

    # ---------------------------------------------------------
    # Travel style
    # ---------------------------------------------------------

    travel_style = "balanced"

    if "relaxed" in request_lower:
        travel_style = "relaxed"

    elif "adventure" in request_lower:
        travel_style = "adventure"

    elif "budget" in request_lower:
        travel_style = "budget"

    elif "luxury" in request_lower:
        travel_style = "luxury"

    # ---------------------------------------------------------
    # Dislikes
    # ---------------------------------------------------------

    dislikes = []

    dislike_patterns = [
        "hate",
        "don't like",
        "do not like",
        "avoid",
        "can't stand",
        "cannot stand"
    ]

    for phrase in dislike_patterns:

        match = re.search(
            rf"{phrase}\s+([^.!?]+)",
            request_lower
        )

        if match:
            dislikes.append(
                match.group(1).strip()
            )

    # ---------------------------------------------------------
    # Origin
    # ---------------------------------------------------------

    origin = "Delhi"

    origin_match = re.search(
        r'from\s+([A-Za-z\s]+?)(?:\s+to\s+|\s*[,.])',
        request,
        re.IGNORECASE
    )

    if origin_match:
        origin = origin_match.group(1).strip()

    # ---------------------------------------------------------
    # Destination
    # ---------------------------------------------------------

    destination = ""

    patterns = [
        r'trip\s+to\s+([A-Za-z\s]+?)(?:\s*,|\s+for|\s+in|\s+from|\s*$)',
        r'to\s+([A-Za-z\s]+?)(?:\s*,|\s+for|\s+in|\s+from|\s*$)',
        r'(\d+)\s+days?\s+in\s+([A-Za-z\s]+?)(?:\s*,|\s+for|\s*$)'
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            request,
            re.IGNORECASE
        )

        if match:

            # Pattern 3 has destination in group 2
            if len(match.groups()) >= 2 and match.group(2):
                destination = match.group(2).strip()
            else:
                destination = match.group(1).strip()

            break

    if not destination:
        destination = "Unknown destination"

    # ---------------------------------------------------------
    # Special preferences
    # ---------------------------------------------------------

    special_preferences = request

    return {
        "destination": destination,
        "duration": duration,
        "budget": budget,
        "interests": interests,
        "origin": origin,
        "travel_style": travel_style,
        "dislikes": dislikes,
        "special_preferences": special_preferences,
        "current_node": "orchestrator",
        "nodes_completed": ["orchestrator"],
    }


def flight_agent_node(state: TravelPlanState) -> dict:
    """Search for flight options using the flight specialist agent."""
    agent = _create_agent(FLIGHT_AGENT_SYSTEM_PROMPT, [tavily_search])
    
    query = (
        f"Find practical transport options from "
        f"{state['origin']} to {state['destination']} "
        f"for a {state['duration']}-day trip.\n\n"

        f"Total budget: ₹{state['budget']:,.0f}\n"
        f"Travel style: {state.get('travel_style', 'balanced')}\n"
        f"Preferences: {state.get('special_preferences', '')}\n\n"

        "Compare flights, trains, buses, and other sensible options "
        "where relevant. Prioritize value and convenience."
    )
    
    try:
        result = agent.invoke({"messages": [HumanMessage(content=query)]})
        # Extract the final AI response
        flight_info = result["messages"][-1].content
    except Exception as e:
        flight_info = f"Unable to retrieve flight information: {str(e)}"
        state.setdefault("errors", []).append(f"Flight agent error: {str(e)}")
    
    return {
        "flight_info": flight_info,
        "current_node": "flight_agent",
        "nodes_completed": state.get("nodes_completed", []) + ["flight_agent"],
    }


def hotel_agent_node(state: TravelPlanState) -> dict:
    """Search for hotel options using the hotel specialist agent."""
    agent = _create_agent(HOTEL_AGENT_SYSTEM_PROMPT, [tavily_search])
    
    query = (
        f"Find accommodation options in {state['destination']} for "
        f"{state['duration']} days. "

        f"Total trip budget: ₹{state['budget']:,.0f}. "

        f"Interests: {', '.join(state['interests'])}. "

        f"Travel style: {state.get('travel_style', 'balanced')}. "

        f"Preferences: {state.get('special_preferences', '')}. "

        "Prioritize accommodation that makes the itinerary convenient."
    )

    
    try:
        result = agent.invoke({"messages": [HumanMessage(content=query)]})
        hotel_info = result["messages"][-1].content
    except Exception as e:
        hotel_info = f"Unable to retrieve hotel information: {str(e)}"
        state.setdefault("errors", []).append(f"Hotel agent error: {str(e)}")
    
    return {
        "hotel_info": hotel_info,
        "current_node": "hotel_agent",
        "nodes_completed": state.get("nodes_completed", []) + ["hotel_agent"],
    }


def itinerary_agent_node(state: TravelPlanState) -> dict:
    """Create detailed itinerary using the itinerary specialist agent."""
    agent = _create_agent(ITINERARY_AGENT_SYSTEM_PROMPT, [tavily_search, find_nearby_places])
    
    query = (
        f"Create a personalized {state['duration']}-day itinerary "
        f"for {state['destination']}.\n\n"

        f"Starting point: {state['origin']}\n"
        f"Budget: ₹{state['budget']:,.0f}\n"
        f"Interests: {', '.join(state['interests'])}\n"
        f"Travel style: {state.get('travel_style', 'balanced')}\n"
        f"Things the traveler dislikes: "
        f"{', '.join(state.get('dislikes', [])) or 'None specified'}\n"
        f"Special preferences: "
        f"{state.get('special_preferences', '')}\n\n"

        "Build a realistic itinerary that feels personally designed "
        "for this traveler. Avoid unnecessary travel and respect their "
        "budget and preferences."
    )

    
    try:
        result = agent.invoke({"messages": [HumanMessage(content=query)]})
        itinerary_info = result["messages"][-1].content
    except Exception as e:
        itinerary_info = f"Unable to retrieve itinerary information: {str(e)}"
        state.setdefault("errors", []).append(f"Itinerary agent error: {str(e)}")
    
    return {
        "itinerary_info": itinerary_info,
        "current_node": "itinerary_agent",
        "nodes_completed": state.get("nodes_completed", []) + ["itinerary_agent"],
    }


def synthesizer_node(state: TravelPlanState) -> dict:
    """Combine all agent responses into a comprehensive travel plan."""
    destination = state.get("destination", "your destination")
    duration = state.get("duration", 5)
    budget = state.get("budget", 2000)
    interests = state.get("interests", ["general travel"])
    
    final_plan = f"""# Your Complete Travel Plan: {destination}

**Trip Duration:** {duration} days  
**Budget:** ₹{budget:,.0f}  
**Travel Style:** {state.get('travel_style', 'balanced')}  
**Interests:** {', '.join(interests)}  
**Avoid:** {', '.join(state.get('dislikes', [])) or 'Nothing specified'}

---

## FLIGHTS

{state.get('flight_info', 'Flight information not available.')}

---

## HOTELS & ACCOMMODATION

{state.get('hotel_info', 'Hotel information not available.')}

---

## DAY-BY-DAY ITINERARY

{state.get('itinerary_info', 'Itinerary information not available.')}

---

## BUDGET SUMMARY

| Category | Estimated Cost |
|----------|----------------|
| Flights (round trip) | Check flight section |
| Accommodation ({duration} nights) | Check hotel section |
| Daily activities & food | Check itinerary |
| Local transport | Check itinerary |

---

## WHY THIS TRIP FITS YOU

This itinerary was personalized using your:

- budget
- interests
- travel style
- dislikes
- starting location

The goal is not to maximize the number of attractions. It is to create a trip that fits how you actually like to travel.

## QUICK TRAVEL TIPS

- Book flights and hotels 2-3 months in advance for best prices
- Download offline maps and translation apps before your trip
- Keep copies of important documents (passport, IDs, bookings)
- Check visa requirements for your destination
- Research local transportation options and consider travel passes

---

*This plan was generated by AI Travel Planning Agent. Prices and availability may vary - always verify before booking.*
"""
    
    return {
        "final_plan": final_plan,
        "current_node": "synthesizer",
        "nodes_completed": state.get("nodes_completed", []) + ["synthesizer"],
    }
