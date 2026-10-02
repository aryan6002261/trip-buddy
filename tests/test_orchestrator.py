"""Tests for orchestrator_node destination extraction.

TDD RED phase: These tests must FAIL before implementing the fix.
"""
import sys
import os

# Add the Travel Agent V1 directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Travel Agent V1"))

from graph.nodes import orchestrator_node


def test_extracts_destination_from_to_pattern():
    """Test: 'trip to Sydney' should extract 'Sydney'."""
    state = {"user_request": "Plan a 5-day trip to Sydney in June, budget $2000, I love art and food"}
    result = orchestrator_node(state)
    assert result["destination"] == "Sydney", f"Expected 'Sydney', got '{result['destination']}'"


def test_extracts_destination_from_trip_to():
    """Test: 'trip to Tokyo' should extract 'Tokyo'."""
    state = {"user_request": "Weekend getaway trip to Tokyo, budget $1500"}
    result = orchestrator_node(state)
    assert result["destination"] == "Tokyo", f"Expected 'Tokyo', got '{result['destination']}'"


def test_extracts_destination_from_visiting():
    """Test: 'visiting Rome' should extract 'Rome'."""
    state = {"user_request": "10 days visiting Rome and Florence, $3000"}
    result = orchestrator_node(state)
    assert result["destination"] == "Rome", f"Expected 'Rome', got '{result['destination']}'"


def test_extracts_destination_from_days_in():
    """Test: '5 days in Paris' should extract 'Paris'."""
    state = {"user_request": "5 days in Paris, budget $2000"}
    result = orchestrator_node(state)
    assert result["destination"] == "Paris", f"Expected 'Paris', got '{result['destination']}'"


def test_extracts_destination_from_lowercase_to():
    """Test: 'to paris' (lowercase) should still extract 'paris'."""
    state = {"user_request": "I want to go to paris for 3 days"}
    result = orchestrator_node(state)
    assert result["destination"] != "", f"Expected a destination, got empty string"


def test_extracts_multiple_params():
    """Test: All params extracted correctly together."""
    state = {"user_request": "Plan a 7-day trip to Barcelona in August, budget $2500, love architecture and food"}
    result = orchestrator_node(state)
    assert result["destination"] == "Barcelona", f"Expected 'Barcelona', got '{result['destination']}'"
    assert result["duration"] == 7, f"Expected 7, got {result['duration']}"
    assert result["budget"] == 2500.0, f"Expected 2500, got {result['budget']}"
    assert "architecture" in result["interests"]
    assert "food" in result["interests"]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
