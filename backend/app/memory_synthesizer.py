from datetime import datetime, timezone
from pydantic import BaseModel, Field
from sqlmodel import Session
from app.database import engine
from app.models import EscalationTicket
from app.llm import invoke_structured
from app.git_hub import HARNESS_ROOT, commit_changes


class LearnedLessonOutput(BaseModel):
    case_slug: str = Field(
        description="Lowercase hyphenated slug, max 35 chars, e.g. archon-worktree-origin-main"
    )
    case_title: str = Field(description="Short descriptive title of the case")
    root_cause: str = Field(description="Clear explanation of the technical root cause")
    global_rule_bullet: str = Field(
        description="Concise 1-2 sentence reusable rule to append to /memory/AGENTS.md so the agent solves similar questions for any user"
    )
    user_memory_note: str = Field(
        description="Short note about this user's issue/setup for their private AGENTS.md"
    )


def resolve_ticket_and_learn(ticket_id: int, human_fix: str) -> dict:
    with Session(engine) as session:
        ticket = session.get(EscalationTicket, ticket_id)
        if not ticket:
            raise ValueError(f"Ticket #{ticket_id} not found")

        lesson = invoke_structured(
            system_prompt=(
                "You are a Harness Engineering Memory Synthesizer. "
                "Convert a human engineer's confirmed support fix into a reusable case study, "
                "a global rule for /memory/AGENTS.md, and a private user note."
            ),
            user_prompt=(
                f"User ID: {ticket.user_id}\n"
                f"User Question: {ticket.question}\n"
                f"Agent Tentative Answer: {ticket.tentative_answer}\n"
                f"Human Confirmed Fix: {human_fix}\n"
            ),
            schema=LearnedLessonOutput,
        )

        iso_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        case_filename = f"case-{ticket_id:03d}-{lesson.case_slug}.md"
        case_rel_path = f"/memory/cases/{case_filename}"
        case_full_path = HARNESS_ROOT / "memory" / "cases" / case_filename

        case_md = (
            f"# Case #{ticket_id}: {lesson.case_title}\n"
            f"- **Date:** {iso_date}\n"
            f"- **Reported By:** `{ticket.user_id}`\n"
            f"- **Symptom:** {ticket.question}\n"
            f"- **Root Cause:** {lesson.root_cause}\n"
            f"- **Verified Resolution:** {human_fix}\n"
        )
        case_full_path.parent.mkdir(parents=True, exist_ok=True)
        case_full_path.write_text(case_md, encoding="utf-8")

        # Update Global /memory/AGENTS.md
        global_agents_path = HARNESS_ROOT / "memory" / "AGENTS.md"
        global_text = global_agents_path.read_text(encoding="utf-8")
        new_bullet = f"- **[{lesson.case_title}]({case_rel_path}):** {lesson.global_rule_bullet}"
        if new_bullet not in global_text:
            global_agents_path.write_text(
                global_text.rstrip() + f"\n{new_bullet}\n", encoding="utf-8"
            )

        # Update Private /memory/users/{user_id}/AGENTS.md
        user_agents_path = HARNESS_ROOT / "memory" / "users" / ticket.user_id / "AGENTS.md"
        user_agents_path.parent.mkdir(parents=True, exist_ok=True)
        user_text = user_agents_path.read_text(encoding="utf-8") if user_agents_path.exists() else f"# User Profile: {ticket.user_id}\n"
        user_agents_path.write_text(
            user_text.rstrip() + f"\n- {lesson.user_memory_note}\n", encoding="utf-8"
        )

        sha = commit_changes(f"Loop 1: Learned case #{ticket_id} ({lesson.case_slug})")

        ticket.status = "RESOLVED"
        ticket.human_fix = human_fix
        ticket.created_case_path = case_rel_path
        ticket.git_commit_sha = sha
        ticket.resolved_at = datetime.now(timezone.utc)
        session.add(ticket)
        session.commit()

        return {
            "status": "RESOLVED",
            "ticket_id": ticket_id,
            "created_case_path": case_rel_path,
            "global_rule_added": lesson.global_rule_bullet,
            "updated_files": [
                case_rel_path,
                "/memory/AGENTS.md",
                f"/memory/users/{ticket.user_id}/AGENTS.md",
            ],
            "git_commit_sha": sha,
        }
