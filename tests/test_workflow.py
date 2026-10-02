"""Tests for workflow sequential execution.

TDD RED phase: These tests must FAIL before implementing the fix.
"""
import sys
import os

# Add the Travel Agent V1 directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Travel Agent V1"))

from graph.workflow import create_travel_workflow


def test_workflow_has_all_nodes():
    """Test: Workflow should have orchestrator, flight, hotel, itinerary, synthesizer nodes."""
    workflow = create_travel_workflow(use_checkpointer=False)
    node_names = set(workflow.get_graph().nodes.keys())
    expected = {"orchestrator", "flight_agent", "hotel_agent", "itinerary_agent", "synthesizer", "__start__", "__end__"}
    assert expected.issubset(node_names), f"Missing nodes: {expected - node_names}"


def test_workflow_has_edge_from_orchestrator_to_flight():
    """Test: orchestrator should have edge to flight_agent."""
    workflow = create_travel_workflow(use_checkpointer=False)
    graph = workflow.get_graph()
    # Get edges from orchestrator
    edges_from_orchestrator = [
        (e.source, e.target) for e in graph.edges
        if e.source == "orchestrator"
    ]
    assert any(target == "flight_agent" for _, target in edges_from_orchestrator), \
        f"No edge from orchestrator to flight_agent. Edges: {edges_from_orchestrator}"


def test_workflow_has_edge_from_flight_to_hotel():
    """Test: flight_agent should have edge to hotel_agent."""
    workflow = create_travel_workflow(use_checkpointer=False)
    graph = workflow.get_graph()
    edges_from_flight = [
        (e.source, e.target) for e in graph.edges
        if e.source == "flight_agent"
    ]
    assert any(target == "hotel_agent" for _, target in edges_from_flight), \
        f"No edge from flight_agent to hotel_agent. Edges: {edges_from_flight}"


def test_workflow_has_edge_from_hotel_to_itinerary():
    """Test: hotel_agent should have edge to itinerary_agent."""
    workflow = create_travel_workflow(use_checkpointer=False)
    graph = workflow.get_graph()
    edges_from_hotel = [
        (e.source, e.target) for e in graph.edges
        if e.source == "hotel_agent"
    ]
    assert any(target == "itinerary_agent" for _, target in edges_from_hotel), \
        f"No edge from hotel_agent to itinerary_agent. Edges: {edges_from_hotel}"


def test_workflow_has_edge_from_itinerary_to_synthesizer():
    """Test: itinerary_agent should have edge to synthesizer."""
    workflow = create_travel_workflow(use_checkpointer=False)
    graph = workflow.get_graph()
    edges_from_itinerary = [
        (e.source, e.target) for e in graph.edges
        if e.source == "itinerary_agent"
    ]
    assert any(target == "synthesizer" for _, target in edges_from_itinerary), \
        f"No edge from itinerary_agent to synthesizer. Edges: {edges_from_itinerary}"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
