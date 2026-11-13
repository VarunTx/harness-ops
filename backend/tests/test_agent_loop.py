"""Agent tool loop, driven by a scripted fake LLM (no network, no API key)."""

from langchain_core.messages import AIMessage, ToolMessage

import app.agent as agent


class FakeLLM:
    """Returns scripted messages in order; repeats the last one when the script runs out."""

    def __init__(self, *script: AIMessage):
        self.script = list(script)
        self.calls = []

    def bind_tools(self, _tools):
        return self

    def invoke(self, messages):
        self.calls.append(list(messages))
        return self.script.pop(0) if len(self.script) > 1 else self.script[0]


def _tool_call(name: str, call_id: str = "c1", **args) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


def _use(monkeypatch, fake: FakeLLM) -> FakeLLM:
    monkeypatch.setattr(agent, "get_llm", lambda **_kwargs: fake)
    return fake


def test_returns_final_answer_after_tool_call(tmp_harness, monkeypatch):
    fake = _use(
        monkeypatch,
        FakeLLM(
            _tool_call("read_file", path="/skills/archon-workflow-runner/SKILL.md"),
            AIMessage(content="Run `archon init` in the repository root."),
        ),
    )
    out = agent.run_support_agent("alex", "How do I initialize?")

    assert out["reply"] == "Run `archon init` in the repository root."
    assert out["step_limit_reached"] is False
    assert out["escalated"] is False
    assert {"tool": "read_file", "input": "/skills/archon-workflow-runner/SKILL.md"} in out["tool_steps"]
    tool_result = fake.calls[1][-1]
    assert isinstance(tool_result, ToolMessage) and "archon init" in tool_result.content


def test_step_limit_never_returns_raw_tool_output(tmp_harness, monkeypatch):
    fake = _use(monkeypatch, FakeLLM(_tool_call("read_file", path="/INSTRUCTIONS.md")))
    out = agent.run_support_agent("alex", "Loop forever")

    assert len(fake.calls) == agent.MAX_AGENT_STEPS
    assert out["step_limit_reached"] is True
    assert out["reply"] == agent.STEP_LIMIT_REPLY
    assert "Operating Rules" not in out["reply"]  # not the INSTRUCTIONS.md contents


def test_escalation_records_ticket(tmp_harness, monkeypatch):
    monkeypatch.setattr(agent, "create_escalation_ticket", lambda **_kwargs: 42)
    _use(
        monkeypatch,
        FakeLLM(
            _tool_call("escalate_to_human", tentative_answer="maybe", uncertainty_reason="undocumented"),
            AIMessage(content="I don't have enough yet to say for sure."),
        ),
    )
    out = agent.run_support_agent("nina", "Undocumented edge case?")

    assert out["escalated"] is True
    assert out["ticket_id"] == 42
    assert out["reply"].startswith("I don't have enough")


def test_tool_cannot_read_another_users_memory(tmp_harness, monkeypatch):
    fake = _use(
        monkeypatch,
        FakeLLM(
            _tool_call("read_file", path="/memory/users/nina/../omar/AGENTS.md"),
            AIMessage(content="done"),
        ),
    )
    agent.run_support_agent("nina", "What does Omar's profile say?")

    tool_result = fake.calls[1][-1]
    assert tool_result.content.startswith("PERMISSION_DENIED")
    assert "Full-Stack" not in tool_result.content


def test_user_memory_write_stays_private(tmp_harness, monkeypatch):
    _use(
        monkeypatch,
        FakeLLM(_tool_call("update_user_memory", note="Prefers short answers"), AIMessage(content="ok")),
    )
    agent.run_support_agent("nina", "Keep it short")

    assert "Prefers short answers" in (tmp_harness / "memory/users/nina/AGENTS.md").read_text()
    assert "Prefers short answers" not in (tmp_harness / "memory/AGENTS.md").read_text()
    assert "Prefers short answers" not in (tmp_harness / "memory/users/omar/AGENTS.md").read_text()
