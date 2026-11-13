import json
import os
import re
from typing import Literal, Type, TypeVar
from dotenv import load_dotenv
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

T = TypeVar("T", bound=BaseModel)
Role = Literal["agent", "judge"]


def _agent_config() -> dict:
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if deepseek_key:
        return {
            "model": os.getenv("LLM_MODEL", "deepseek-chat"),
            "api_key": deepseek_key,
            "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        }
    if openai_key:
        return {
            "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
            "api_key": openai_key,
            "base_url": None,
        }
    raise RuntimeError(
        "Missing API key! Set DEEPSEEK_API_KEY in backend/.env before running."
    )


def _judge_config() -> dict:
    """
    The grader should not be the model it grades. Set JUDGE_MODEL (and
    JUDGE_API_KEY / JUDGE_BASE_URL for any OpenAI-compatible endpoint) to use a
    separate judge. Without JUDGE_MODEL, the agent model grades itself and the
    eval run records that, so the scoreboard never hides it.
    """
    judge_model = os.getenv("JUDGE_MODEL", "").strip()
    if not judge_model:
        return _agent_config()
    api_key = (
        os.getenv("JUDGE_API_KEY", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
    )
    if not api_key:
        raise RuntimeError("JUDGE_MODEL is set but JUDGE_API_KEY/OPENAI_API_KEY is empty.")
    return {
        "model": judge_model,
        "api_key": api_key,
        "base_url": os.getenv("JUDGE_BASE_URL", "").strip() or None,
    }


def _config(role: Role) -> dict:
    return _judge_config() if role == "judge" else _agent_config()


def describe_model(role: Role = "agent") -> str:
    """Model identity recorded on every eval run, e.g. 'deepseek-chat'."""
    return _config(role)["model"]


def judge_is_independent() -> bool:
    return describe_model("judge") != describe_model("agent")


def get_llm(temperature: float = 0.0, role: Role = "agent") -> ChatOpenAI:
    """Returns a ChatOpenAI client for the agent (DeepSeek or OpenAI) or the judge."""
    cfg = _config(role)
    kwargs = {"model": cfg["model"], "api_key": cfg["api_key"], "temperature": temperature}
    if cfg["base_url"]:
        kwargs["base_url"] = cfg["base_url"]
    return ChatOpenAI(**kwargs)


def invoke_structured(
    system_prompt: str, user_prompt: str, schema: Type[T], role: Role = "agent"
) -> T:
    """
    Bulletproof JSON-mode structured output for DeepSeek.
    Avoids OpenAI-proprietary strict schema errors while guaranteeing Pydantic validation.
    """
    llm = get_llm(temperature=0.0, role=role).bind(response_format={"type": "json_object"})
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
