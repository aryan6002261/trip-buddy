"""Tool definitions for the travel planning agents.

These tools are used by the LangGraph agent nodes to fetch real-time
travel information from the web and geographic data.
"""

import os
from langchain_core.tools import tool
from tavily import TavilyClient
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable


@tool
def tavily_search(query: str) -> str:
    """Search the web for current travel information using Tavily.
    
    Use this tool to find flights, hotels, attractions, restaurants,
    and any travel-related information. Returns summarized search
    results with titles, URLs, and content snippets.
    
    Args:
        query: The search query for travel information.
               Example: "flights from New York to Paris in June 2026"
        
    Returns:
        Formatted string with search results including summaries and sources.
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return "Error: TAVILY_API_KEY not configured. Please add it to your .env file."
    
    try:
        client = TavilyClient(api_key=api_key)
        response = client.search(
            query=query,
            search_depth="advanced",
            max_results=5,
            include_answer=True,
        )
        
        parts = []
        
        # Include AI-generated summary if available
        if response.get("answer"):
            parts.append(f"Summary: {response['answer']}\n")
        
        # Include individual results
        for r in response.get("results", []):
            snippet = r.get("content", "")[:600].strip()
            parts.append(f"**{r['title']}**\nURL: {r['url']}\n{snippet}")
        
        return "\n\n---\n\n".join(parts) if parts else "No results found for this query."
        
    except Exception as e:
        return f"Search error: {str(e)}. Please try a different query."


@tool
def find_nearby_places(location: str, category: str = "tourist attractions") -> str:
    """Find geographic information and nearby places using OpenStreetMap/Nominatim.
    
    Use this tool to get geographic context for destinations including
    coordinates, addresses, and regional information for trip planning.
    
    Args:
        location: City, landmark, or address to look up.
                  Example: "Paris, France" or "Colosseum, Rome"
        category: Type of places to mention (for context).
                  Example: "museums", "restaurants", "beaches"
        
    Returns:
        Geographic details including coordinates, address, country, and region.
    """
    geolocator = Nominatim(user_agent="ai-travel-planning-agent/1.0", timeout=10)
    
    try:
        geo = geolocator.geocode(location, addressdetails=True)
        if not geo:
            return f"Could not find geographic data for: {location}. Try a more specific location name."
        
        address = geo.raw.get("address", {})
        details = {
            "Location": location,
            "Full Address": geo.address,
            "Latitude": f"{geo.latitude:.5f}",
            "Longitude": f"{geo.longitude:.5f}",
            "Country": address.get("country", "N/A"),
            "State/Region": address.get("state", address.get("county", "N/A")),
            "Category Searched": category,
        }
        
        lines = [f"{k}: {v}" for k, v in details.items()]
        return "\n".join(lines)
        
    except GeocoderTimedOut:
        return f"Geocoding timed out for: {location}. Try a more specific location name."
    except GeocoderUnavailable:
        return "Nominatim service temporarily unavailable. Please retry."
    except Exception as e:
        return f"Location lookup error: {str(e)}"


# Export tools for easy importing
travel_tools = [tavily_search, find_nearby_places]
