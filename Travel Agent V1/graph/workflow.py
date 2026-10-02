"""LangGraph workflow definition for the travel planning agent.

This module builds and compiles the StateGraph that orchestrates
the travel planning workflow with parallel agent execution.
"""

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .state import TravelPlanState
from .nodes import (
    orchestrator_node,
    flight_agent_node,
    hotel_agent_node,
    itinerary_agent_node,
    synthesizer_node,
)


def create_travel_workflow(use_checkpointer: bool = True):
    """Create and compile the LangGraph travel planning workflow.
    
    The workflow follows this pattern:
        1. Orchestrator: Parse user input
        2. Parallel: Flight, Hotel, Itinerary agents run concurrently
        3. Synthesizer: Combine all results into final plan
    
    Args:
        use_checkpointer: Whether to use MemorySaver for state persistence.
    
    Returns:
        Compiled StateGraph ready for invocation.
    """
    # Build the graph
    workflow = StateGraph(TravelPlanState)
    
    # Add nodes
    workflow.add_node("orchestrator", orchestrator_node)
    workflow.add_node("flight_agent", flight_agent_node)
    workflow.add_node("hotel_agent", hotel_agent_node)
    workflow.add_node("itinerary_agent", itinerary_agent_node)
    workflow.add_node("synthesizer", synthesizer_node)
    
    # Set entry point
    workflow.set_entry_point("orchestrator")
    
    # Sequential execution: orchestrator -> flight -> hotel -> itinerary -> synthesizer
    workflow.add_edge("orchestrator", "flight_agent")
    workflow.add_edge("flight_agent", "hotel_agent")
    workflow.add_edge("hotel_agent", "itinerary_agent")
    workflow.add_edge("itinerary_agent", "synthesizer")
    
    # Synthesizer is the final node
    workflow.add_edge("synthesizer", END)
    
    # Compile with optional checkpointer
    if use_checkpointer:
        memory = MemorySaver()
        app = workflow.compile(checkpointer=memory)
    else:
        app = workflow.compile()
    
    return app


def create_travel_workflow_sequential(use_checkpointer: bool = True):
    """Create a sequential version of the workflow (for debugging).
    
    This runs agents one at a time instead of in parallel,
    which can be useful for debugging and testing.
    """
    workflow = StateGraph(TravelPlanState)
    
    workflow.add_node("orchestrator", orchestrator_node)
    workflow.add_node("flight_agent", flight_agent_node)
    workflow.add_node("hotel_agent", hotel_agent_node)
    workflow.add_node("itinerary_agent", itinerary_agent_node)
    workflow.add_node("synthesizer", synthesizer_node)
    
    workflow.set_entry_point("orchestrator")
    
    # Sequential edges
    workflow.add_edge("orchestrator", "flight_agent")
    workflow.add_edge("flight_agent", "hotel_agent")
    workflow.add_edge("hotel_agent", "itinerary_agent")
    workflow.add_edge("itinerary_agent", "synthesizer")
    workflow.add_edge("synthesizer", END)
    
    if use_checkpointer:
        memory = MemorySaver()
        app = workflow.compile(checkpointer=memory)
    else:
        app = workflow.compile()
    
    return app


# Default: parallel execution workflow
travel_workflow = create_travel_workflow(use_checkpointer=True)
