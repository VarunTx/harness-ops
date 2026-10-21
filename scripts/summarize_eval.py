#!/usr/bin/env python3
"""Turn raw EvalRun JSON files into a Markdown scoreboard.

Usage:
    python scripts/summarize_eval.py                        # all runs
    python scripts/summarize_eval.py v0.json l1.json l2.json
    python scripts/summarize_eval.py --out benchmark/results.md
"""
from __future__ import annotations

import argparse
import glob
import json
import os
from collections import defaultdict


def load_run(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        run = json.load(handle)
    details = run.get("details_json", "[]")
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except json.JSONDecodeError:
            details = []
    run["_details"] = details
    run["_label"] = os.path.splitext(os.path.basename(path))[0]
    return run


def summarize(paths: list[str]) -> str:
    runs = [load_run(path) for path in paths]
    runs.sort(key=lambda run: run.get("id", 0))

    lines: list[str] = []
    lines.append("| Run | Harness commit | Passed | Accuracy | Escalations | Failed questions |")
    lines.append("|---|---|---|---|---|---|")
    for run in runs:
        details = run["_details"]
        escalated = sum(1 for item in details if item.get("escalated"))
        failed = [str(item.get("id")) for item in details if not item.get("passed")]
        lines.append(
            "| {label} | `{sha}` | {passed}/{total} | {accuracy}% | {esc} | {failed} |".format(
                label=run["_label"],
                sha=run.get("git_commit_sha", "?"),
                passed=run.get("passed_count", 0),
                total=run.get("total_questions", len(details)),
                accuracy=run.get("accuracy_pct", 0.0),
                esc=escalated,
                failed=", ".join(failed) if failed else "—",
            )
        )

    lines.append("")
    lines.append("### Per-category (passed / total)")
    lines.append("")

    def short_label(label: str) -> str:
        return label.split("-20")[0] if "-20" in label else label

    per_run: dict[str, dict[str, list[int]]] = {}
    categories: set[str] = set()
    for run in runs:
        buckets: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for item in run["_details"]:
            category = item.get("category", "unknown")
            buckets[category][1] += 1
            if item.get("passed"):
                buckets[category][0] += 1
            categories.add(category)
        per_run[run["_label"]] = buckets

    labels = [short_label(run["_label"]) for run in runs]
    lines.append("| Category | " + " | ".join(labels) + " |")
    lines.append("|---|" + "|".join(["---"] * len(labels)) + "|")
    for category in sorted(categories):
        cells = []
        for run in runs:
            bucket = per_run[run["_label"]].get(category)
            cells.append(f"{bucket[0]}/{bucket[1]}" if bucket else "—")
        lines.append(f"| {category} | " + " | ".join(cells) + " |")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    paths = args.files or sorted(glob.glob("benchmark/results/*.json"))
    if not paths:
        raise SystemExit("No eval result files found in benchmark/results/")

    report = summarize(paths)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(report)
        print(f"wrote {args.out}")
    else:
        print(report)


if __name__ == "__main__":
    main()
