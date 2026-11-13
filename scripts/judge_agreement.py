#!/usr/bin/env python3
"""Measure how far the LLM judge can be trusted, against your own labels.

Step 1 -- export every graded answer to a CSV with an empty `human_passed` column:

    python scripts/judge_agreement.py export            # -> benchmark/judge_labels.csv

Step 2 -- open the CSV and fill `human_passed` with 1 (correct) or 0 (wrong) for
each row, judging the agent answer against `ground_truth` *without* looking at
`judge_passed`. Leave a cell empty to skip that row.

Step 3 -- score agreement:

    python scripts/judge_agreement.py score             # reads benchmark/judge_labels.csv

Reports raw agreement, Cohen's kappa, the confusion matrix, and every
disagreement so you can read why the judge and you differed.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS_GLOB = str(ROOT / "benchmark" / "results" / "*.json")
DEFAULT_CSV = ROOT / "benchmark" / "judge_labels.csv"
DATASETS = {
    "dev": ROOT / "backend" / "eval_dataset.json",
    "holdout": ROOT / "backend" / "holdout_dataset.json",
}
FIELDS = [
    "sample_id",
    "dataset",
    "harness_sha",
    "question_id",
    "question",
    "ground_truth",
    "agent_answer",
    "escalated",
    "judge_passed",
    "human_passed",
    "notes",
]
TRUE_VALUES = {"1", "true", "t", "yes", "y", "pass", "passed"}
FALSE_VALUES = {"0", "false", "f", "no", "n", "fail", "failed"}


def _eval_runs(paths: list[str]) -> list[tuple[str, dict]]:
    runs = []
    for path in sorted(paths):
        with open(path, encoding="utf-8") as handle:
            run = json.load(handle)
        if "details_json" not in run:  # loop1/loop2 responses, not eval runs
            continue
        runs.append((path, run))
    return runs


def _ground_truths() -> dict[tuple[str, int], str]:
    truths = {}
    for name, path in DATASETS.items():
        for item in json.loads(path.read_text(encoding="utf-8")):
            truths[(name, item["id"])] = item["ground_truth"]
    return truths


def export(paths: list[str], out: Path, force: bool) -> int:
    if out.exists() and not force:
        print(f"{out} exists; it may hold your labels. Use --force to overwrite.", file=sys.stderr)
        return 1
    truths = _ground_truths()
    rows = []
    for path, run in _eval_runs(paths):
        label = os.path.splitext(os.path.basename(path))[0]
        dataset = run.get("dataset") or ("holdout" if label.startswith("holdout") else "dev")
        details = run["details_json"]
        details = json.loads(details) if isinstance(details, str) else details
        for item in details:
            qid = item.get("id")
            rows.append(
                {
                    "sample_id": f"{label}:q{qid}",
                    "dataset": dataset,
                    "harness_sha": run.get("git_commit_sha", ""),
                    "question_id": qid,
                    "question": item.get("question", ""),
                    "ground_truth": item.get("ground_truth") or truths.get((dataset, qid), ""),
                    "agent_answer": item.get("agent_answer", ""),
                    "escalated": int(bool(item.get("escalated"))),
                    "judge_passed": int(bool(item.get("passed"))),
                    "human_passed": "",
                    "notes": "",
                }
            )
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out}. Fill in `human_passed` (1/0), then run `score`.")
    return 0


def parse_label(value: str) -> bool | None:
    value = (value or "").strip().lower()
    if value in TRUE_VALUES:
        return True
    if value in FALSE_VALUES:
        return False
    return None


def agreement_stats(pairs: list[tuple[bool, bool]]) -> dict:
    """pairs are (judge, human). Returns agreement, Cohen's kappa, and the confusion matrix."""
    n = len(pairs)
    tp = sum(1 for j, h in pairs if j and h)
    tn = sum(1 for j, h in pairs if not j and not h)
    fp = sum(1 for j, h in pairs if j and not h)  # judge passed a wrong answer
    fn = sum(1 for j, h in pairs if not j and h)  # judge failed a right answer
    if n == 0:
        return {"n": 0, "agreement": None, "kappa": None, "tp": 0, "tn": 0, "fp": 0, "fn": 0}
    po = (tp + tn) / n
    judge_pos, human_pos = (tp + fp) / n, (tp + fn) / n
    pe = judge_pos * human_pos + (1 - judge_pos) * (1 - human_pos)
    kappa = 1.0 if pe == 1 else (po - pe) / (1 - pe)
    return {"n": n, "agreement": po, "kappa": kappa, "tp": tp, "tn": tn, "fp": fp, "fn": fn}


def score(path: Path) -> int:
    if not path.exists():
        print(f"{path} not found. Run `export` first.", file=sys.stderr)
        return 1
    with open(path, newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    labeled = []
    for row in rows:
        human = parse_label(row.get("human_passed", ""))
        if human is not None:
            labeled.append((row, parse_label(row["judge_passed"]) is True, human))
    if not labeled:
        print("No rows have a `human_passed` label yet.", file=sys.stderr)
        return 1

    stats = agreement_stats([(judge, human) for _, judge, human in labeled])
    print(f"Labeled rows: {stats['n']} of {len(rows)}")
    print(f"Agreement:    {stats['agreement']:.1%}")
    print(f"Cohen's κ:    {stats['kappa']:.2f}")
    print()
    print("                 human pass   human fail")
    print(f"judge pass       {stats['tp']:>10}   {stats['fp']:>10}")
    print(f"judge fail       {stats['fn']:>10}   {stats['tn']:>10}")

    disagreements = [(row, judge, human) for row, judge, human in labeled if judge != human]
    if disagreements:
        print("\nDisagreements:")
        for row, judge, human in disagreements:
            verdict = "judge PASS / human FAIL" if judge else "judge FAIL / human PASS"
            note = f" -- {row['notes']}" if row.get("notes") else ""
            print(f"- {row['sample_id']}: {verdict}{note}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p_export = sub.add_parser("export", help="write graded answers to a CSV for labeling")
    p_export.add_argument("results", nargs="*", help="EvalRun JSON files (default: benchmark/results/*.json)")
    p_export.add_argument("--out", type=Path, default=DEFAULT_CSV)
    p_export.add_argument("--force", action="store_true", help="overwrite an existing CSV")
    p_score = sub.add_parser("score", help="compare judge verdicts to your labels")
    p_score.add_argument("csv", nargs="?", type=Path, default=DEFAULT_CSV)
    args = parser.parse_args()

    if args.command == "export":
        return export(args.results or glob.glob(RESULTS_GLOB), args.out, args.force)
    return score(args.csv)


if __name__ == "__main__":
    sys.exit(main())
