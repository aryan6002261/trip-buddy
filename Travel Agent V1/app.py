"""TripBuddy - personalized travel planning agent.

Built for a friend who loves travelling but hates planning.
"""

import os
import uuid

from dotenv import load_dotenv
load_dotenv()

import streamlit as st

# Import graph components
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from graph.workflow import create_travel_workflow
import config


# ---------------------------------------------------------------------------
# Page configuration
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="TripBuddy ✈️",
    page_icon="✈️",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

def init_session_state():

    if "messages" not in st.session_state:
        st.session_state.messages = []

    if "thread_id" not in st.session_state:
        st.session_state.thread_id = str(uuid.uuid4())

    if "graph" not in st.session_state:
        st.session_state.graph = create_travel_workflow(
            use_checkpointer=True
        )

    if "current_model" not in st.session_state:
        st.session_state.current_model = "gemma-4-31b (Free)"


init_session_state()


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

with st.sidebar:

    st.title("✈️ TripBuddy")
    st.caption("Travel planning for people who hate planning.")

    st.markdown("---")

    st.markdown("### 🤝 Built for a friend")

    st.markdown(
        """
        TripBuddy doesn't just ask where you want to go.

        It learns **how you like to travel** and builds the trip around you.
        """
    )

    st.markdown("---")

    # Model selection
    st.markdown("### 🤖 AI Model")

    model_options = {
        "🆓 Gemma (Open Weight)": "gemma-4-31b (Free)",
        "🆓 GPT-OSS": "gpt-oss-20b (Free)",
        "🆓 Auto-select": "free-auto (Auto-select)",
    }

    selected_model = st.selectbox(
        "Choose model",
        options=list(model_options.keys()),
        index=0,
    )

    st.session_state.current_model = model_options[selected_model]

    st.caption(
        "TripBuddy uses an open-weight model as its planning brain."
    )

    st.markdown("---")

    # API status
    st.markdown("### 🔌 Services")

    openrouter_ok = bool(os.getenv("OPENROUTER_API_KEY"))
    tavily_ok = bool(os.getenv("TAVILY_API_KEY"))

    st.markdown(
        f"{'✅' if openrouter_ok else '❌'} AI Model\n\n"
        f"{'✅' if tavily_ok else '❌'} Web Search"
    )

    if not openrouter_ok or not tavily_ok:
        st.warning(
            "Add your API keys to `.env` before running the planner."
        )

    st.markdown("---")

    if st.button(
        "🗑️ Clear Trip",
        use_container_width=True
    ):
        st.session_state.messages = []
        st.session_state.thread_id = str(uuid.uuid4())
        st.rerun()


# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------

def run_travel_agent_streaming(
    user_input: str,
    status_container
):
    """Run the travel planning workflow."""

    graph = st.session_state.graph

    thread_id = st.session_state.thread_id

    workflow_config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    # Initial state
    initial_state = {
        "user_request": user_input,

        "destination": "",
        "duration": 5,
        "budget": 15000.0,
        "interests": [],
        "origin": "Delhi",

        # Friend-specific information
        "travel_style": "balanced",
        "dislikes": [],
        "special_preferences": "",

        # Agent outputs
        "flight_info": "",
        "hotel_info": "",
        "itinerary_info": "",

        # Final output
        "final_plan": "",

        # Metadata
        "errors": [],
        "current_node": "",
        "nodes_completed": [],
    }

    completed_nodes = set()

    node_names = {
        "orchestrator":
            "🧠 Understanding your travel style...",

        "flight_agent":
            "🚆 Finding the best way to get there...",

        "hotel_agent":
            "🏨 Finding places that fit your style...",

        "itinerary_agent":
            "🗺️ Building your personalized itinerary...",

        "synthesizer":
            "✨ Putting your trip together...",
    }

    try:

        for event in graph.stream(
            initial_state,
            workflow_config,
            stream_mode="updates"
        ):

            for node_name in event:

                if node_name not in completed_nodes:

                    completed_nodes.add(node_name)

                    status_text = node_names.get(
                        node_name,
                        f"Running {node_name}..."
                    )

                    status_container.info(status_text)

        final_state = graph.get_state(
            workflow_config
        )

        return final_state.values.get(
            "final_plan",
            "Unable to generate travel plan."
        )

    except Exception as e:

        return (
            "Something went wrong while planning the trip.\n\n"
            f"`{str(e)}`"
        )


# ---------------------------------------------------------------------------
# Main UI
# ---------------------------------------------------------------------------

st.title("✈️ TripBuddy")

st.subheader(
    "Your friend who actually plans the trip."
)

st.markdown(
    """
Tell me where you want to go, how much you want to spend,
and **how you like to travel**.

I'll handle the annoying planning part.
"""
)


# ---------------------------------------------------------------------------
# Welcome
# ---------------------------------------------------------------------------

if not st.session_state.messages:

    with st.chat_message("assistant"):

        st.markdown(
            """
### 👋 Let's plan a trip.

Try something like:

> **I want to spend 5 days in Manali, starting from Delhi.
> My budget is ₹15,000. I love photography, nature and cafes.
> I prefer relaxed trips and absolutely hate waking up early.**

You don't need to know exactly what you want.

**Just tell me what kind of trip you want.**
"""
        )


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------

for msg in st.session_state.messages:

    with st.chat_message(msg["role"]):

        st.markdown(msg["content"])


# ---------------------------------------------------------------------------
# Chat input
# ---------------------------------------------------------------------------

prompt = st.chat_input(
    "Tell TripBuddy about your trip..."
)

if prompt:

    # Store user message
    st.session_state.messages.append(
        {
            "role": "user",
            "content": prompt
        }
    )

    with st.chat_message("user"):
        st.markdown(prompt)

    # Run planner
    with st.chat_message("assistant"):

        status_container = st.empty()

        status_container.info(
            "🚀 TripBuddy is planning..."
        )

        response = run_travel_agent_streaming(
            prompt,
            status_container
        )

        status_container.empty()

        st.markdown(response)

    # Store response
    st.session_state.messages.append(
        {
            "role": "assistant",
            "content": response
        }
    )