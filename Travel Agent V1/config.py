"""Configuration for the travel planning agent."""

import os
from typing import Optional
from langchain_openai import ChatOpenAI


# Default model via OpenRouter (free tier)
DEFAULT_MODEL = "openai/gpt-oss-20b"

# Available models on OpenRouter (free models prioritized)
AVAILABLE_MODELS = {
    # Free models (recommended)
    "gpt-oss-20b (Free)": "openai/gpt-oss-20b",
    "nemotron-3-ultra (Free)": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nemotron-3.5-lightning (Free)": "nvidia/nemotron-3.5-lightning:free",
    "gemma-4-31b (Free)": "google/gemma-4-31b-it:free",
    "glm-5.2 (Free)": "z-ai/glm-5.2:free",
    "free-auto (Auto-select)": "openrouter/free",
    # Paid models (backup)
    "gemini-flash": "google/gemini-2.0-flash-001",
    "gpt-4o": "openai/gpt-4o",
    "claude-sonnet": "anthropic/claude-sonnet-4",
}


def get_llm(model: Optional[str] = None, temperature: float = 0.7) -> ChatOpenAI:
    """Get an LLM instance configured to use OpenRouter.
    
    Args:
        model: Model identifier (key from AVAILABLE_MODELS or full OpenRouter ID).
        temperature: Sampling temperature.
        
    Returns:
        Configured ChatOpenAI instance routed through OpenRouter.
    """
    # Resolve model alias
    resolved_model = AVAILABLE_MODELS.get(model, model) or DEFAULT_MODEL
    
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError(
            "OPENROUTER_API_KEY not found in environment. "
            "Please add it to your .env file."
        )
    
    return ChatOpenAI(
        model=resolved_model,
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
        temperature=temperature,
        default_headers={
            "HTTP-Referer": "https://github.com/travel-planner-agent",
            "X-Title": "AI Travel Planning Agent",
        },
    )
