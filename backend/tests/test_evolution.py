"""Loop 2 must learn from evidence, not from answers baked into its prompt."""

import json
import re
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.evolution_engine import (
    LOOP2_SYSTEM_PROMPT,
    build_loop2_user_prompt,
    build_trace_evidence,
    validate_target_file,
)
from app.models import EscalationTicket, EvalRun

BACKEND = Path(__file__).resolve().parents[1]
DATASETS = [BACKEND / "eval_dataset.json", BACKEND / "holdout_dataset.json"]


def _ground_truth_facts() -> set[str]:
    facts = {"archon"}  # the product name itself is domain knowledge
    for path in DATASETS:
        for item in json.loads(path.read_text(encoding="utf-8")):
            facts.update(re.findall(r"`([^`]+)`", item["ground_truth"]))
    return facts


def test_loop2_prompt_contains_no_benchmark_answers():
    prompt = LOOP2_SYSTEM_PROMPT.lower()
    leaked = sorted(f for f in _ground_truth_facts() if f.lower() in prompt)
    assert not leaked, f"Loop 2 system prompt leaks eval answers: {leaked}"


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _eval_run(dataset: str, question: str, ground_truth: str, passed: bool = False) -> EvalRun:
    details = [
        {
            "id": 1,
            "user_id": "nina",
            "question": question,
            "ground_truth": ground_truth,
            "agent_answer": "I'm not sure.",
            "escalated": True,
            "passed": passed,
            "rationale": "Missing the fix.",
        }
    ]
    return EvalRun(
        git_commit_sha="abc1234",
        dataset=dataset,
        total_questions=1,
        passed_count=int(passed),
        accuracy_pct=100.0 if passed else 0.0,
        details_json=json.dumps(details),
    )


def test_trace_evidence_hides_ground_truth_and_holdout(session):
    session.add(_eval_run("dev", "DEV_QUESTION", "SECRET_DEV_GROUND_TRUTH"))
    session.add(_eval_run("holdout", "HOLDOUT_QUESTION", "SECRET_HOLDOUT_GROUND_TRUTH"))
    session.add(
        EscalationTicket(
            user_id="omar",
            question="Why?",
            tentative_answer="?",
            uncertainty_reason="undocumented",
            status="RESOLVED",
            human_fix="VERIFIED_HUMAN_FIX",
        )
    )
    session.commit()

    evidence = build_trace_evidence(session)

    assert "DEV_QUESTION" in evidence
    assert "VERIFIED_HUMAN_FIX" in evidence  # human-verified fixes are legitimate evidence
    assert "SECRET_DEV_GROUND_TRUTH" not in evidence
    assert "HOLDOUT_QUESTION" not in evidence
    assert "SECRET_HOLDOUT_GROUND_TRUTH" not in evidence


def test_user_prompt_shows_shared_files_but_not_private_memory(tmp_harness):
    prompt = build_loop2_user_prompt("(evidence)")

    assert "### INSTRUCTIONS.md" in prompt
    assert "### skills/workflow-debugging/SKILL.md" in prompt
    assert "Senior Backend Engineer" not in prompt  # nina's private profile


@pytest.mark.parametrize(
    "target, expected",
    [
        ("INSTRUCTIONS.md", "INSTRUCTIONS.md"),
        ("/INSTRUCTIONS.md", "INSTRUCTIONS.md"),
        ("memory/AGENTS.md", "memory/AGENTS.md"),
        ("skills/workflow-debugging/SKILL.md", "skills/workflow-debugging/SKILL.md"),
        ("skills/new-skill/SKILL.md", "skills/new-skill/SKILL.md"),
    ],
)
def test_loop2_may_edit_shared_harness_files(tmp_harness, target, expected):
    assert validate_target_file(target) == expected


@pytest.mark.parametrize(
    "target",
    [
        "",
        "memory/users/nina/AGENTS.md",
        "memory/cases/case-005.md",
        "skills/../memory/users/omar/AGENTS.md",
        "../outside.md",
        "skills/a/b/SKILL.md",
        "skills/Bad_Name/SKILL.md",
        "notes.txt",
    ],
)
def test_loop2_cannot_edit_private_or_unknown_files(tmp_harness, target):
    with pytest.raises(ValueError):
        validate_target_file(target)
