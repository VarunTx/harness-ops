"""Judge configuration and the judge-vs-human agreement math."""

import pytest

import app.llm as llm
from judge_agreement import agreement_stats, parse_label


@pytest.fixture
def agent_env(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")
    for var in ("JUDGE_MODEL", "JUDGE_API_KEY", "JUDGE_BASE_URL", "OPENAI_API_KEY"):
        monkeypatch.delenv(var, raising=False)


def test_judge_defaults_to_agent_model_and_says_so(agent_env):
    assert llm.describe_model("judge") == "deepseek-chat"
    assert llm.judge_is_independent() is False


def test_separate_judge_model(agent_env, monkeypatch):
    monkeypatch.setenv("JUDGE_MODEL", "gpt-4.1-mini")
    monkeypatch.setenv("JUDGE_API_KEY", "judge-key")
    assert llm.describe_model("agent") == "deepseek-chat"
    assert llm.describe_model("judge") == "gpt-4.1-mini"
    assert llm.judge_is_independent() is True


def test_judge_model_without_key_fails_loudly(agent_env, monkeypatch):
    monkeypatch.setenv("JUDGE_MODEL", "gpt-4.1-mini")
    with pytest.raises(RuntimeError):
        llm.describe_model("judge")


def test_cohens_kappa_matches_hand_calculation():
    # tp=20, fp=5, fn=10, tn=15 -> po=0.70, pe=0.50, kappa=0.40
    pairs = [(True, True)] * 20 + [(True, False)] * 5 + [(False, True)] * 10 + [(False, False)] * 15
    stats = agreement_stats(pairs)
    assert stats["n"] == 50
    assert stats["agreement"] == pytest.approx(0.70)
    assert stats["kappa"] == pytest.approx(0.40)
    assert (stats["tp"], stats["fp"], stats["fn"], stats["tn"]) == (20, 5, 10, 15)


def test_perfect_agreement_is_kappa_one():
    assert agreement_stats([(True, True), (False, False)])["kappa"] == pytest.approx(1.0)
    assert agreement_stats([(True, True), (True, True)])["kappa"] == pytest.approx(1.0)


@pytest.mark.parametrize("raw, expected", [("1", True), ("pass", True), ("0", False), ("N", False), ("", None), ("?", None)])
def test_parse_label(raw, expected):
    assert parse_label(raw) is expected
