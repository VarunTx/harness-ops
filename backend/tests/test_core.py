import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.agent import _check_permission  # noqa: E402
from app.git_hub import INITIAL_FILES, compute_unified_diff  # noqa: E402

DATASET = ROOT / "backend" / "eval_dataset.json"


def test_user_can_read_and_write_own_memory():
    assert _check_permission("nina", "/memory/users/nina/AGENTS.md", "read")
    assert _check_permission("nina", "/memory/users/nina/AGENTS.md", "write")


def test_user_cannot_read_or_write_another_users_memory():
    assert not _check_permission("nina", "/memory/users/omar/AGENTS.md", "read")
    assert not _check_permission("nina", "/memory/users/omar/AGENTS.md", "write")
    assert not _check_permission("omar", "/memory/users/nina/AGENTS.md", "read")


def test_dotdot_segments_cannot_bypass_isolation():
    assert not _check_permission(
        "nina", "/memory/users/nina/../omar/AGENTS.md", "read"
    )
    assert not _check_permission(
        "nina", "//memory/users/./nina/../../omar/AGENTS.md", "read"
    )
    assert not _check_permission("nina", "/../etc/passwd", "read")
    assert not _check_permission("nina", "/memory/omar/AGENTS.md", "read")
    assert not _check_permission("nina", "/unknown/file.md", "read")


def test_shared_context_is_read_only():
    assert _check_permission("nina", "/skills/workflow-debugging/SKILL.md", "read")
    assert _check_permission("nina", "/memory/AGENTS.md", "read")
    assert _check_permission("nina", "/INSTRUCTIONS.md", "read")
    assert _check_permission("nina", "/memory/cases/case-005-x.md", "read")
    assert not _check_permission("nina", "/skills/workflow-debugging/SKILL.md", "write")
    assert not _check_permission("nina", "/INSTRUCTIONS.md", "write")


def test_eval_dataset_is_valid_and_balanced():
    items = json.loads(DATASET.read_text(encoding="utf-8"))
    assert len(items) == 14
    assert len({item["id"] for item in items}) == 14
    required = {"id", "category", "user_id", "question", "ground_truth"}
    for item in items:
        assert required <= item.keys()
        assert item["user_id"] in {"nina", "omar", "alex"}
    categories = {item["category"] for item in items}
    assert categories == {
        "v0-baseline",
        "worktree-origin-main",
        "env-isolation",
        "monorepo-cwd",
        "pr-draft-lock",
    }


def test_initial_harness_seed_has_required_files():
    assert "INSTRUCTIONS.md" in INITIAL_FILES
    assert "memory/AGENTS.md" in INITIAL_FILES
    assert "skills/archon-workflow-runner/SKILL.md" in INITIAL_FILES
    for user in ("nina", "omar", "alex"):
        assert f"memory/users/{user}/AGENTS.md" in INITIAL_FILES


def test_unified_diff_marks_additions_and_removals():
    diff = compute_unified_diff("INSTRUCTIONS.md", "one\ntwo\n", "one\nthree\n")
    assert "--- a/INSTRUCTIONS.md" in diff
    assert "+++ b/INSTRUCTIONS.md" in diff
    assert "-two" in diff
    assert "+three" in diff
