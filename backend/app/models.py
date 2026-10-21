from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ChatMessageRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    thread_id: str = Field(index=True)
    user_id: str = Field(index=True)
    role: str
    content: str
    tool_steps_json: str = Field(default="[]")
    escalated: bool = Field(default=False)
    langsmith_run_id: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class EscalationTicket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str
    question: str
    tentative_answer: str
    uncertainty_reason: str
    status: str = Field(default="PENDING")  # PENDING or RESOLVED
    human_fix: Optional[str] = Field(default=None)
    created_case_path: Optional[str] = Field(default=None)
    git_commit_sha: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    resolved_at: Optional[datetime] = Field(default=None)


class EvolutionProposal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    trace_summary: str
    failure_diagnosis: str
    target_file: str
    original_content: str
    proposed_content: str
    unified_diff: str
    status: str = Field(default="PROPOSED")  # PROPOSED, APPLIED, REJECTED
    git_commit_sha: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class EvalRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    git_commit_sha: str
    total_questions: int = Field(default=14)
    passed_count: int
    accuracy_pct: float
    details_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=utc_now)
