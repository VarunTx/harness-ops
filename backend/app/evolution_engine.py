from pydantic import BaseModel, Field
from sqlmodel import Session, select
from app.database import engine
from app.models import EscalationTicket, EvolutionProposal
from app.llm import invoke_structured
from app.git_hub import HARNESS_ROOT, compute_unified_diff, commit_changes


class HarnessPatchOutput(BaseModel):
    target_file: str = Field(
        description="Relative file path inside ./harness to update, e.g. 'skills/archon-workflow-runner/SKILL.md' or 'INSTRUCTIONS.md'"
    )
    failure_diagnosis: str = Field(
        description="Detailed explanation of what was missing in the harness that caused the agent to struggle or escalate"
    )
    proposed_full_content: str = Field(
        description="The complete updated Markdown content for target_file with concise, high-signal additions"
    )


def analyze_traces_and_propose() -> EvolutionProposal:
    with Session(engine) as session:
        tickets = session.exec(select(EscalationTicket)).all()
        trace_lines = [
            f"- Ticket #{t.id} ({t.status}): Q='{t.question}' | Reason='{t.uncertainty_reason}' | Fix='{t.human_fix or 'Unresolved'}'"
            for t in tickets[-8:]
        ]
        trace_summary = "\n".join(trace_lines)

        instructions_text = (HARNESS_ROOT / "INSTRUCTIONS.md").read_text(encoding="utf-8")
        runner_skill_path = "skills/archon-workflow-runner/SKILL.md"
        runner_skill_text = (HARNESS_ROOT / runner_skill_path).read_text(encoding="utf-8")

        patch = invoke_structured(
            system_prompt=(
                "You are the Loop 2 Harness Evolution Engine (like LangSmith Insights Engine). "
                "Survey recent production escalations/traces and propose a clean, concise update to "
                "either 'skills/archon-workflow-runner/SKILL.md' or 'INSTRUCTIONS.md' so the agent "
                "natively handles worktree origin/main behavior, .archon/.env sandbox isolation, "
                "--workspace-root in monorepos, and `archon worktree prune --force` without needing to escalate."
            ),
            user_prompt=(
                f"## Recent Production Escalation Traces\n{trace_summary}\n\n"
                f"## Current INSTRUCTIONS.md\n{instructions_text}\n\n"
                f"## Current {runner_skill_path}\n{runner_skill_text}\n"
            ),
            schema=HarnessPatchOutput,
        )

        target_clean = patch.target_file.lstrip("/")
        target_full = HARNESS_ROOT / target_clean
        if not target_full.exists():
            target_clean = runner_skill_path
            target_full = HARNESS_ROOT / target_clean

        original_text = target_full.read_text(encoding="utf-8")
        diff_text = compute_unified_diff(
            target_clean, original_text, patch.proposed_full_content
        )

        proposal = EvolutionProposal(
            trace_summary=trace_summary,
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

        target_full = HARNESS_ROOT / proposal.target_file.lstrip("/")
        target_full.parent.mkdir(parents=True, exist_ok=True)
        target_full.write_text(proposal.proposed_content, encoding="utf-8")

        sha = commit_changes(
            f"Loop 2 Evolution: Updated {proposal.target_file} (Proposal #{proposal.id})"
        )
        proposal.status = "APPLIED"
        proposal.git_commit_sha = sha
        session.add(proposal)
        session.commit()

        return {
            "status": "APPLIED",
            "proposal_id": proposal.id,
            "target_file": proposal.target_file,
            "git_commit_sha": sha,
        }
