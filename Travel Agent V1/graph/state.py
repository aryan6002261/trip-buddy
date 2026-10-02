"""State definition for the personalized travel planning workflow."""

from typing import TypedDict, List


class TravelPlanState(TypedDict):
    """Shared state for the TripBuddy LangGraph workflow."""

    # Original user request
    user_request: str

    # Parsed trip details
    destination: str
    duration: int
    budget: float
    interests: List[str]
    origin: str

    # Friend-specific preferences
    travel_style: str
    dislikes: List[str]
    special_preferences: str

    # Agent outputs
    flight_info: str
    hotel_info: str
    itinerary_info: str

    # Final output
    final_plan: str

    # Metadata
    errors: List[str]
    current_node: str
    nodes_completed: List[str]