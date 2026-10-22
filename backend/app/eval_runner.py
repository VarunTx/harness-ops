import json
from pathlib import Path
from pydantic import BaseModel, Field
from sqlmodel import Session
from app.database import engine
from app.models import EvalRun
from app.agent import run_support_agent
from app.llm import invoke_structured
from app.git_hub import get_current_sha

DATASETS = {
    "dev": Path(__file__).resolve().parents[1] / "eval_dataset.json",
    "holdout": Path(__file__).resolve().parents[1] / "holdout_dataset.json",
}


class GradeResult(BaseModel):
    passed: bool = Field(
        description="True ONLY if the agent's answer provides the specific technical solution in ground_truth without saying it lacks context."
    )
    rationale: str = Field(description="1-sentence explanation of why it passed or failed")


def run_eval_benchmark(dataset: str = "dev") -> EvalRun:
    if dataset not in DATASETS:
        raise ValueError(
            f"Unknown dataset '{dataset}'. Choose one of: {', '.join(DATASETS)}"
        )
    questions = json.loads(DATASETS[dataset].read_text(encoding="utf-8"))
    details = []
    passed_count = 0

    for item in questions:
        agent_out = run_support_agent(
            user_id=item["user_id"], question=item["question"]
        )
        grade = invoke_structured(
            system_prompt=(
                "You are a strict technical evaluator grading an AI support agent against a ground-truth answer. "
                "If the agent says it doesn't have enough context or escalates without giving the exact fix, mark passed=false."
            ),
            user_prompt=(
                f"Question: {item['question']}\n"
                f"Ground Truth Fix: {item['ground_truth']}\n"
                f"Agent Answer: {agent_out['reply']}\n"
                f"Agent Escalated: {agent_out['escalated']}\n"
            ),
            schema=GradeResult,
        )
        if grade.passed:
            passed_count += 1
        details.append(
            {
                "id": item["id"],
                "category": item["category"],
                "user_id": item["user_id"],
                "question": item["question"],
                "agent_answer": agent_out["reply"],
                "escalated": agent_out["escalated"],
                "passed": grade.passed,
                "rationale": grade.rationale,
            }
        )

    total = len(questions)
    accuracy = round((passed_count / total) * 100, 1) if total else 0.0

    with Session(engine) as session:
        run_record = EvalRun(
            git_commit_sha=get_current_sha(),
            dataset=dataset,
            total_questions=total,
            passed_count=passed_count,
            accuracy_pct=accuracy,
            details_json=json.dumps(details),
        )
        session.add(run_record)
        session.commit()
        session.refresh(run_record)
        return run_record
