import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))


@pytest.fixture
def tmp_harness(tmp_path, monkeypatch):
    """A fresh baseline harness (with its own Git repo) in a temp directory."""
    import app.agent
    import app.evolution_engine
    import app.git_hub

    root = tmp_path / "harness"
    for module in (app.git_hub, app.agent, app.evolution_engine):
        monkeypatch.setattr(module, "HARNESS_ROOT", root)
    app.git_hub.ensure_harness_initialized()
    return root
