PYTHON ?= $(shell command -v python3.11 2>/dev/null || command -v python3)

.PHONY: help setup backend-setup frontend-setup dev test lint benchmark demo-reset backup clean

help:
	@echo "HarnessOps"
	@echo ""
	@echo "  make setup      Install backend + frontend dependencies"
	@echo "  make dev        Run API and Studio (auto-selects a free backend port)"
	@echo "  make test       Run backend tests and syntax checks"
	@echo "  make lint       Run frontend lint"
	@echo "  make benchmark  Run the 14-question benchmark against a running API"
	@echo "  make demo-reset Restore the clean demo state"
	@echo "  make backup     Snapshot the harness, database, and results"
	@echo "  make clean      Remove build caches"

setup: backend-setup frontend-setup

backend-setup:
	cd backend && $(PYTHON) -m venv .venv && .venv/bin/pip install --upgrade pip -q
	cd backend && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

frontend-setup:
	cd frontend && npm install

dev:
	./scripts/dev.sh

test:
	cd backend && .venv/bin/python -m py_compile app/*.py
	cd backend && .venv/bin/python -m pytest tests -q

lint:
	cd frontend && npm run lint

benchmark:
	curl -s -X POST http://localhost:$${BACKEND_PORT:-8000}/api/evals/run | python3 -m json.tool

demo-reset:
	./scripts/demo-reset.sh

backup:
	./scripts/backup.sh

clean:
	rm -rf frontend/.next frontend/out
	find backend -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache
