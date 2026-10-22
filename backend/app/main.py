import json
import os
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import ChatMessageRecord, EscalationTicket, EvolutionProposal, EvalRun
from app.git_hub import (
    ensure_harness_initialized,
    get_current_sha,
    list_harness_files,
    list_commits,
    rollback_to_commit,
)
from app.agent import run_support_agent
from app.memory_synthesizer import resolve_ticket_and_learn
from app.evolution_engine import analyze_traces_and_propose, apply_evolution_proposal
from app.eval_runner import run_eval_benchmark

@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_harness_initialized()
    init_db()
    yield


app = FastAPI(title="HarnessOps API", version="1.0.0", lifespan=lifespan)

_allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=_allowed_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    database_ok = True
    try:
        with Session(engine) as session:
            session.exec(select(EscalationTicket)).first()
    except Exception:
        database_ok = False
    try:
        harness_sha = get_current_sha()
    except Exception:
        harness_sha = None
    return {
        "status": "ok" if database_ok else "degraded",
        "version": app.version,
        "database": database_ok,
        "harness_sha": harness_sha,
    }


class ChatRequest(BaseModel):
    user_id: str = "nina"
    thread_id: Optional[str] = "default"
    message: str


class ResolveRequest(BaseModel):
    human_fix: str


@app.get("/api/chat/history")
def get_chat_history(
    user_id: str = "nina", thread_id: Optional[str] = None, limit: int = 50
):
    with Session(engine) as session:
        statement = select(ChatMessageRecord).where(
            ChatMessageRecord.user_id == user_id
        )
        if thread_id:
            statement = statement.where(ChatMessageRecord.thread_id == thread_id)
        rows = session.exec(
            statement.order_by(ChatMessageRecord.id.desc()).limit(max(1, min(limit, 200)))
        ).all()
        rows.reverse()
        return {"messages": rows}


@app.delete("/api/chat/history")
def clear_chat_history(user_id: str, thread_id: str):
    with Session(engine) as session:
        rows = session.exec(
            select(ChatMessageRecord).where(
                ChatMessageRecord.user_id == user_id,
                ChatMessageRecord.thread_id == thread_id,
            )
        ).all()
        for row in rows:
            session.delete(row)
        session.commit()
        return {"deleted": len(rows)}


@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    result = run_support_agent(user_id=req.user_id, question=req.message)
    with Session(engine) as session:
        session.add(
            ChatMessageRecord(
                thread_id=req.thread_id or f"thread-{req.user_id}",
                user_id=req.user_id,
                role="user",
                content=req.message,
            )
        )
        session.add(
            ChatMessageRecord(
                thread_id=req.thread_id or f"thread-{req.user_id}",
                user_id=req.user_id,
                role="assistant",
                content=result["reply"],
                tool_steps_json=json.dumps(result["tool_steps"]),
                escalated=result["escalated"],
            )
        )
        session.commit()
    return result


@app.get("/api/inbox")
def get_inbox():
    with Session(engine) as session:
        tickets = session.exec(
            select(EscalationTicket).order_by(EscalationTicket.id.desc())
        ).all()
        pending_count = sum(1 for t in tickets if t.status == "PENDING")
        return {"pending_count": pending_count, "tickets": tickets}


@app.post("/api/inbox/{ticket_id}/resolve")
def resolve_inbox_ticket(ticket_id: int, req: ResolveRequest):
    try:
        return resolve_ticket_and_learn(ticket_id=ticket_id, human_fix=req.human_fix)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/harness/files")
def get_harness_files():
    return {"files": list_harness_files()}


@app.get("/api/harness/commits")
def get_harness_commits():
    return {"commits": list_commits()}


@app.post("/api/harness/rollback/{commit_sha}")
def rollback_harness(commit_sha: str):
    new_sha = rollback_to_commit(commit_sha)
    return {"status": "ROLLED_BACK", "active_sha": new_sha}


@app.get("/api/evolution/proposals")
def get_proposals():
    with Session(engine) as session:
        proposals = session.exec(
            select(EvolutionProposal).order_by(EvolutionProposal.id.desc())
        ).all()
        return {"proposals": proposals}


@app.post("/api/evolution/analyze")
def trigger_evolution_analysis():
    proposal = analyze_traces_and_propose()
    return proposal


@app.post("/api/evolution/apply/{proposal_id}")
def apply_proposal(proposal_id: int):
    try:
        return apply_evolution_proposal(proposal_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/evals/runs")
def get_eval_runs():
    with Session(engine) as session:
        runs = session.exec(select(EvalRun).order_by(EvalRun.id.asc())).all()
        return {"runs": runs}


@app.post("/api/evals/run")
def trigger_eval_run(dataset: str = "dev"):
    try:
        run_record = run_eval_benchmark(dataset=dataset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return run_record
