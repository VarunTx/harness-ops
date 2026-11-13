"""Loop 2: turn failure traces into a reviewable harness diff.

The engine is deliberately domain-agnostic. Its prompt names no product
facts, commands, or failure areas; everything it may write must come from
the evidence it is shown:

- escalation tickets (resolved ones carry a human-verified fix),
- resolved case files written by Loop 1,
- failed items from the latest *dev* eval run (question, agent answer, judge
  rationale -- never the ground truth, and never the holdout set),
- the current editable harness files.

`tests/test_evolution.py` fails if any eval ground-truth fact leaks into the
prompt, so this guarantee is checked in CI rather than asserted in prose.
"""

import json
import posixpath
import re
from typing import List

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.database import engine
from app.git_hub import HARNESS_ROOT, commit_changes, compute_unified_diff
from app.llm import invoke_structured
from app.models import EscalationTicket, EvalRun, EvolutionProposal

MAX_TICKETS = 8
MAX_EVAL_FAILURES = 8

# Loop 2 may edit shared behavior, but never private user memory or the
# case files Loop 1 owns.
_NEW_SKILL_RE = re.compile(r"^skills/[a-z0-9][a-z0-9-]*/SKILL\.md$")

LOOP2_SYSTEM_PROMPT = """You are a harness evolution engine for a support agent.

The agent's behavior is defined by Markdown files: INSTRUCTIONS.md (operating rules),
skills/*/SKILL.md (domain procedures, loaded on demand), and memory/AGENTS.md (global rules).
You are given evidence of recent failures and the current editable files.

Your job:
1. Diagnose why the agent failed or escalated: missing knowledge, knowledge stored in the
   wrong place (e.g. only in a case file), or a behavioral rule problem.
2. Propose ONE minimal, high-signal edit to exactly one editable file (or a new
   skills/<name>/SKILL.md) that would let the agent handle these situations next time.

Hard rules:
- Use ONLY facts that appear verbatim or near-verbatim in human-verified fixes, resolved
  case files, or the current harness. Never invent commands, flags, file paths, or behavior.
- If a failure has no verified fix in the evidence, do not guess a fix. Mention it in
  failure_diagnosis as needing a human answer, and leave it out of the edit.
- A behavioral fix (how the agent should answer) belongs in INSTRUCTIONS.md; product
  knowledge belongs in a skill.
- Keep everything that is already in the target file unless it is wrong.
- target_file must be one of the editable files listed, or a new skills/<name>/SKILL.md path."""


class HarnessPatchOutput(BaseModel):
    target_file: str = Field(
        description="Relative path of the single file to edit, chosen from the editable files listed (or a new skills/<name>/SKILL.md)"
    )
    failure_diagnosis: str = Field(
        description="What was missing or wrong in the harness, which evidence supports the edit, and which failures still need a human-verified fix"
    )
    proposed_full_content: str = Field(
        description="The complete updated Markdown content for target_file"
    )


def editable_harness_files() -> List[str]:
    """Shared harness files Loop 2 is allowed to rewrite (relative paths)."""
    files = []
    if (HARNESS_ROOT / "INSTRUCTIONS.md").is_file():
        files.append("INSTRUCTIONS.md")
    if (HARNESS_ROOT / "memory" / "AGENTS.md").is_file():
        files.append("memory/AGENTS.md")
    skills_dir = HARNESS_ROOT / "skills"
    if skills_dir.is_dir():
        files.extend(
            p.relative_to(HARNESS_ROOT).as_posix()
            for p in sorted(skills_dir.glob("*/SKILL.md"))
        )
    return files


def validate_target_file(target: str) -> str:
    """Normalize a proposed target and reject anything outside Loop 2's write scope."""
    raw = (target or "").strip().lstrip("/")
    norm = posixpath.normpath(raw) if raw else ""
    if not norm or norm.startswith("..") or norm != raw.rstrip("/"):
        raise ValueError(f"Loop 2 target '{target}' is not a clean relative path.")
    if norm in editable_harness_files() or _NEW_SKILL_RE.match(norm):
        return norm
    raise ValueError(
        f"Loop 2 may not edit '{target}'. Allowed: INSTRUCTIONS.md, memory/AGENTS.md, "
        "or skills/<name>/SKILL.md."
    )


def _ticket_evidence(session: Session) -> str:
    tickets = session.exec(
        select(EscalationTicket).order_by(EscalationTicket.id.desc()).limit(MAX_TICKETS)
    ).all()
    lines = []
    for t in reversed(tickets):
        fix = t.human_fix or "UNRESOLVED (no verified fix yet)"
        lines.append(
            f"- Ticket #{t.id} [{t.status}] user={t.user_id}\n"
            f"  Question: {t.question}\n"
            f"  Agent's uncertainty: {t.uncertainty_reason}\n"
            f"  Human-verified fix: {fix}"
        )
    return "\n".join(lines) or "(none)"


def _eval_failure_evidence(session: Session) -> str:
    """Failed dev-set items: symptoms only. Ground truth is never included."""
    run = session.exec(
        select(EvalRun).where(EvalRun.dataset == "dev").order_by(EvalRun.id.desc())
    ).first()
    if not run:
        return "(no dev eval run yet)"
    failures = [d for d in json.loads(run.details_json or "[]") if not d.get("passed")]
    lines = [
        f"- Q{d.get('id')} user={d.get('user_id')} escalated={d.get('escalated')}\n"
        f"  Question: {d.get('question')}\n"
        f"  Agent answer: {str(d.get('agent_answer', ''))[:600]}\n"
        f"  Judge rationale: {d.get('rationale')}"
        for d in failures[:MAX_EVAL_FAILURES]
    ]
    header = f"Latest dev run at harness {run.git_commit_sha}: {run.passed_count}/{run.total_questions} passed."
    return header + ("\n" + "\n".join(lines) if lines else "\nNo failures.")


def _case_evidence() -> str:
    cases_dir = HARNESS_ROOT / "memory" / "cases"
    if not cases_dir.is_dir():
        return "(none)"
    parts = [
        f"### /{p.relative_to(HARNESS_ROOT).as_posix()}\n{p.read_text(encoding='utf-8')}"
        for p in sorted(cases_dir.glob("*.md"))
    ]
    return "\n\n".join(parts) or "(none)"


def build_trace_evidence(session: Session) -> str:
    """Tickets and failed eval items; stored on the proposal for review."""
    return (
        f"## Escalation tickets (most recent {MAX_TICKETS})\n{_ticket_evidence(session)}\n\n"
        f"## Failed eval items (symptoms only)\n{_eval_failure_evidence(session)}"
    )


def build_loop2_user_prompt(trace_evidence: str) -> str:
    files = "\n\n".join(
        f"### {rel}\n{(HARNESS_ROOT / rel).read_text(encoding='utf-8')}"
        for rel in editable_harness_files()
    )
    return (
        f"{trace_evidence}\n\n"
        f"## Resolved case files (read-only, written by Loop 1)\n{_case_evidence()}\n\n"
        f"## Editable harness files\n{files}\n"
    )


def analyze_traces_and_propose() -> EvolutionProposal:
    with Session(engine) as session:
        trace_evidence = build_trace_evidence(session)
        user_prompt = build_loop2_user_prompt(trace_evidence)
        patch = invoke_structured(
            system_prompt=LOOP2_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            schema=HarnessPatchOutput,
        )

        target_clean = validate_target_file(patch.target_file)
        target_full = HARNESS_ROOT / target_clean
        original_text = (
            target_full.read_text(encoding="utf-8") if target_full.exists() else ""
        )
        diff_text = compute_unified_diff(
            target_clean, original_text, patch.proposed_full_content
        )

        proposal = EvolutionProposal(
            trace_summary=trace_evidence,
            failure_diagnosis=patch.failure_diagnosis,
            target_file=target_clean,
            original_content=original_text,
            proposed_content=patch.proposed_full_content,
            unified_diff=diff_text,
            status="PROPOSED",
        )
        session.add(proposal)
        session.commit()
        session.refresh(proposal)
        return proposal


def apply_evolution_proposal(proposal_id: int) -> dict:
    with Session(engine) as session:
        proposal = session.get(EvolutionProposal, proposal_id)
        if not proposal:
            raise ValueError(f"Proposal #{proposal_id} not found")

        target_clean = validate_target_file(proposal.target_file)
        target_full = HARNESS_ROOT / target_clean
        target_full.parent.mkdir(parents=True, exist_ok=True)
        target_full.write_text(proposal.proposed_content, encoding="utf-8")

        sha = commit_changes(
            f"Loop 2 Evolution: Updated {target_clean} (Proposal #{proposal.id})"
        )
        proposal.status = "APPLIED"
        proposal.git_commit_sha = sha
        session.add(proposal)
        session.commit()

        return {
            "status": "APPLIED",
            "proposal_id": proposal.id,
            "target_file": target_clean,
            "git_commit_sha": sha,
        }
