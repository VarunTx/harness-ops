from pathlib import Path
from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine, select
from app.models import EscalationTicket

DB_PATH = Path(__file__).resolve().parents[1] / "harness_ops.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
)


def _migrate_eval_dataset_column() -> None:
    """Add the dataset column to pre-existing evalrun tables (SQLite)."""
    inspector = inspect(engine)
    if "evalrun" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("evalrun")}
    if "dataset" in columns:
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE evalrun ADD COLUMN dataset VARCHAR NOT NULL DEFAULT 'dev'"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_evalrun_dataset ON evalrun (dataset)")
        )


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_eval_dataset_column()
    with Session(engine) as session:
        existing = session.exec(select(EscalationTicket)).first()
        if not existing:
            # Pre-seed 4 baseline tickets so the next live escalation becomes Ticket #5
            seed_tickets = [
                EscalationTicket(
                    user_id="alex",
                    question="Can Archon deploy directly to AWS Lambda without GitHub Actions?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="AWS Lambda direct deployment is not documented in skills.",
                    status="PENDING",
                ),
                EscalationTicket(
                    user_id="omar",
                    question="Does Archon support GitLab self-hosted runners on Free tier?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="GitLab self-hosted tier limits are undocumented.",
                    status="PENDING",
                ),
                EscalationTicket(
                    user_id="nina",
                    question="Why does `archon worktree prune` fail after a Ctrl+C interrupt?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="Worktree lock recovery flags are missing from skills.",
                    status="PENDING",
                ),
                EscalationTicket(
                    user_id="alex",
                    question="Why is my exported STRIPE_TEST_KEY missing inside the workflow step?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="Environment variable sandbox isolation is undocumented.",
                    status="PENDING",
                ),
            ]
            for t in seed_tickets:
                session.add(t)
            session.commit()


def create_escalation_ticket(
    user_id: str, question: str, tentative_answer: str, uncertainty_reason: str
) -> int:
    with Session(engine) as session:
        ticket = EscalationTicket(
            user_id=user_id,
            question=question,
            tentative_answer=tentative_answer,
            uncertainty_reason=uncertainty_reason,
            status="PENDING",
        )
        session.add(ticket)
        session.commit()
        session.refresh(ticket)
        return ticket.id or 0
