import json
import os
import re
from typing import Type, TypeVar
from dotenv import load_dotenv
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

T = TypeVar("T", bound=BaseModel)


def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    """Returns a ChatOpenAI instance pointed at DeepSeek (or OpenAI fallback)."""
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    if deepseek_key:
        return ChatOpenAI(
            model=os.getenv("LLM_MODEL", "deepseek-chat"),
            api_key=deepseek_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            temperature=temperature,
        )
    if openai_key:
        return ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            api_key=openai_key,
            temperature=temperature,
        )
    raise RuntimeError(
        "Missing API key! Set DEEPSEEK_API_KEY in backend/.env before running."
    )


def invoke_structured(system_prompt: str, user_prompt: str, schema: Type[T]) -> T:
    """
    Bulletproof JSON-mode structured output for DeepSeek.
    Avoids OpenAI-proprietary strict schema errors while guaranteeing Pydantic validation.
    """
    llm = get_llm(temperature=0.0).bind(response_format={"type": "json_object"})
    schema_json = json.dumps(schema.model_json_schema(), indent=2)

    full_system = (
        f"{system_prompt}\n\n"
        f"You MUST respond with valid JSON only, matching this exact JSON schema:\n"
        f"{schema_json}"
    )

    response = llm.invoke(
        [SystemMessage(content=full_system), HumanMessage(content=user_prompt)]
    )
    raw = response.content if isinstance(response.content, str) else str(response.content)
    # Strip markdown fences if present
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)
    return schema.model_validate_json(cleaned)
