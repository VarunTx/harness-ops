"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCode2,
  FlaskConical,
  GitCommitHorizontal,
  Play,
  RefreshCw,
  ScanSearch,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  api,
  type EvalDetail,
  type EvalRun,
  type EvolutionProposal,
} from "@/lib/api";
import {
  cn,
  EmptyState,
  ErrorNote,
  Pill,
  Spinner,
  Toast,
} from "@/components/Ui";
import { DiffView } from "@/components/DiffView";
import { formatDateTime, timeAgo } from "@/lib/format";

function parseDetails(run: EvalRun): EvalDetail[] {
  try {
    const parsed: unknown = JSON.parse(run.details_json);
    return Array.isArray(parsed) ? (parsed as EvalDetail[]) : [];
  } catch {
    return [];
  }
}

function accuracyTone(accuracy: number): "emerald" | "amber" | "rose" {
  if (accuracy >= 90) return "emerald";
  if (accuracy >= 60) return "amber";
  return "rose";
}

function ProposalStatus({ status }: { status: EvolutionProposal["status"] }) {
  const tone =
    status === "APPLIED" ? "emerald" : status === "REJECTED" ? "rose" : "amber";
  return (
    <Pill tone={tone}>
      {status === "APPLIED" ? (
        <CheckCircle2 size={9} />
      ) : status === "REJECTED" ? (
        <XCircle size={9} />
      ) : (
        <Clock3 size={9} />
      )}
      {status}
    </Pill>
  );
}

export function EvolutionEvalTab() {
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(
    null,
  );
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [runningEvals, setRunningEvals] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [proposalResponse, evalResponse] = await Promise.all([
        api.proposals(),
        api.evalRuns(),
      ]);
      setProposals(proposalResponse.proposals);
      setRuns(evalResponse.runs);
      setLoadError(null);
      setSelectedProposalId((prev) =>
        prev && proposalResponse.proposals.some((p) => p.id === prev)
          ? prev
          : (proposalResponse.proposals[0]?.id ?? null),
      );
      setSelectedRunId((prev) =>
        prev && evalResponse.runs.some((run) => run.id === prev)
          ? prev
          : (evalResponse.runs[evalResponse.runs.length - 1]?.id ?? null),
      );
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load evolution data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    // Initial proposals/runs fetch; state updates happen after awaited responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!runningEvals) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [runningEvals]);

  const selectedProposal =
    proposals.find((proposal) => proposal.id === selectedProposalId) ?? null;
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedDetails = useMemo(
    () => (selectedRun ? parseDetails(selectedRun) : []),
    [selectedRun],
  );
  const latestRun = runs.length ? runs[runs.length - 1] : null;

  async function analyze() {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const proposal = await api.analyze();
      setProposals((prev) => [
        proposal,
        ...prev.filter((item) => item.id !== proposal.id),
      ]);
      setSelectedProposalId(proposal.id);
      setToast(`Proposal #${proposal.id} generated for ${proposal.target_file}`);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Trace analysis failed.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function apply(proposal: EvolutionProposal) {
    if (applyingId !== null) return;
    const confirmed = window.confirm(
      `Apply Proposal #${proposal.id} to ${proposal.target_file}?\n\nThis writes the file and creates a Git commit in ./harness.`,
    );
    if (!confirmed) return;
    setApplyingId(proposal.id);
    setApplyError(null);
    try {
      const response = await api.applyProposal(proposal.id);
      setProposals((prev) =>
        prev.map((item) =>
          item.id === proposal.id
            ? {
                ...item,
                status: "APPLIED",
                git_commit_sha: response.git_commit_sha,
              }
            : item,
        ),
      );
      setToast(
        `Applied to ${response.target_file} · commit ${response.git_commit_sha}`,
      );
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : "Failed to apply proposal.",
      );
    } finally {
      setApplyingId(null);
    }
  }

  async function runBenchmark() {
    if (runningEvals) return;
    const confirmed = window.confirm(
      "Run all 14 benchmark questions?\n\nThis makes ~28 LLM calls and can take 2–5 minutes. Results are stored against the current harness commit.",
    );
    if (!confirmed) return;
    setElapsed(0);
    setRunningEvals(true);
    setEvalError(null);
    try {
      const run = await api.runEvals();
      setRuns((prev) => [...prev, run]);
      setSelectedRunId(run.id);
      setToast(
        `Benchmark #${run.id}: ${run.passed_count}/${run.total_questions} (${run.accuracy_pct}%)`,
      );
    } catch (err) {
      setEvalError(
        err instanceof Error ? err.message : "Benchmark run failed.",
      );
    } finally {
      setRunningEvals(false);
    }
  }

  return (
    <div className="space-y-4">
      <Toast message={toast} />

      {loadError ? <ErrorNote message={loadError} onRetry={refresh} /> : null}

      {/* Loop 2 */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
          <div className="flex items-center gap-2">
            <ScanSearch size={15} className="text-violet-300" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Loop 2 · Harness evolution
            </h2>
            <Pill tone="violet">trace-driven</Pill>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-white/10 p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
              title="Refresh proposals"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-[#0d0716] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
            >
              {analyzing ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Sparkles size={13} />
              )}
              {analyzing ? "Analyzing traces…" : "Analyze Failure Traces"}
            </button>
          </div>
        </div>

        <p className="border-b border-white/5 px-4 py-2 text-[11px] leading-relaxed text-zinc-500">
          Reviews recent escalations and proposes a concise Markdown patch to{" "}
          <span className="font-mono text-zinc-400">INSTRUCTIONS.md</span> or{" "}
          <span className="font-mono text-zinc-400">skills/</span>. Nothing is
          written until you approve it.
        </p>

        {analyzeError ? (
          <div className="p-3">
            <ErrorNote message={analyzeError} />
          </div>
        ) : null}

        <div className="grid gap-4 p-4 lg:grid-cols-[330px_minmax(0,1fr)]">
          {/* Proposal list */}
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {loading && !proposals.length ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
                <Spinner /> Loading proposals…
              </div>
            ) : null}

            {!loading && !proposals.length ? (
              <EmptyState
                icon={<ScanSearch size={18} />}
                title="No proposals yet"
                description="Run Analyze Failure Traces after resolving one or two inbox tickets."
              />
            ) : null}

            {proposals.map((proposal) => {
              const active = proposal.id === selectedProposalId;
              return (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => setSelectedProposalId(proposal.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-violet-500/40 bg-violet-500/10"
                      : "border-transparent hover:border-white/10 hover:bg-white/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">
                      #{proposal.id}
                    </span>
                    <ProposalStatus status={proposal.status} />
                    <span className="ml-auto text-[10px] text-zinc-600">
                      {timeAgo(proposal.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 truncate font-mono text-[11px] text-violet-200">
                    <FileCode2 size={11} />
                    {proposal.target_file}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-400">
                    {proposal.failure_diagnosis}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Proposal detail */}
          <div className="min-w-0 rounded-xl border border-white/10 bg-[#090a0e]">
            {!selectedProposal ? (
              <EmptyState
                icon={<GitCommitHorizontal size={18} />}
                title="Select a proposal"
                description="Inspect the diagnosed gap and the exact Markdown diff before applying."
              />
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-mono text-xs text-zinc-200">
                      <FileCode2 size={12} className="text-violet-300" />
                      {selectedProposal.target_file}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {formatDateTime(selectedProposal.created_at)}
                      {selectedProposal.git_commit_sha
                        ? ` · ${selectedProposal.git_commit_sha}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposalStatus status={selectedProposal.status} />
                    {selectedProposal.status === "PROPOSED" ? (
                      <button
                        type="button"
                        onClick={() => void apply(selectedProposal)}
                        disabled={applyingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-[#06120c] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
                      >
                        {applyingId === selectedProposal.id ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        Approve &amp; Apply
                      </button>
                    ) : (
                      <Pill tone="emerald">
                        <CheckCircle2 size={9} />
                        In production
                      </Pill>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-3.5">
                  <section>
                    <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                      <AlertTriangle size={11} />
                      Failure diagnosis
                    </h3>
                    <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-amber-50/80">
                      {selectedProposal.failure_diagnosis}
                    </p>
                  </section>

                  <details className="group rounded-lg border border-white/10 bg-white/[0.02]">
                    <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Trace evidence · {selectedProposal.trace_summary.split("\n").length}{" "}
                      tickets
                    </summary>
                    <pre className="max-h-40 overflow-auto border-t border-white/5 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-zinc-400">
                      {selectedProposal.trace_summary}
                    </pre>
                  </details>

                  {applyError ? <ErrorNote message={applyError} /> : null}

                  <section>
                    <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      <GitCommitHorizontal size={11} />
                      Proposed Markdown diff
                    </h3>
                    <DiffView
                      diff={selectedProposal.unified_diff}
                      className="max-h-[340px]"
                      emptyLabel="The proposal is identical to the current file."
                    />
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Evals */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
          <div className="flex items-center gap-2">
            <FlaskConical size={15} className="text-sky-300" />
            <h2 className="text-sm font-semibold text-zinc-100">
              14-Question Eval Runner
            </h2>
            {latestRun ? (
              <Pill tone={accuracyTone(latestRun.accuracy_pct)}>
                <TrendingUp size={9} />
                {latestRun.accuracy_pct}% latest
              </Pill>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void runBenchmark()}
            disabled={runningEvals}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-[#061018] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            {runningEvals ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Play size={13} />
            )}
            {runningEvals
              ? `Running benchmark… ${elapsed}s`
              : "Run 14-Question Benchmark"}
          </button>
        </div>

        <p className="border-b border-white/5 px-4 py-2 text-[11px] text-zinc-500">
          Grades the live harness against{" "}
          <span className="font-mono text-zinc-400">eval_dataset.json</span> with
          an LLM judge · ~28 calls · results pinned to the harness commit SHA.
        </p>

        {runningEvals ? (
          <div className="flex items-center gap-2 border-b border-sky-500/20 bg-sky-500/[0.07] px-4 py-2.5 text-[11px] text-sky-200">
            <Spinner className="h-3.5 w-3.5" />
            Running 14 questions sequentially — keep this tab open. This can take
            a few minutes.
          </div>
        ) : null}

        {evalError ? (
          <div className="p-3">
            <ErrorNote message={evalError} />
          </div>
        ) : null}

        <div className="p-4">
          {!runs.length ? (
            <EmptyState
              icon={<FlaskConical size={18} />}
              title="No benchmark runs yet"
              description="Run the suite to establish the v0 baseline (expect ~4/14 ≈ 28.6%)."
              action={
                <button
                  type="button"
                  onClick={() => void runBenchmark()}
                  disabled={runningEvals}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  <Play size={11} />
                  Run baseline
                </button>
              }
            />
          ) : (
            <div className="space-y-4">
              {/* Trend chart */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <TrendingUp size={11} />
                  Accuracy over harness versions
                </div>
                <div className="flex items-end gap-3 overflow-x-auto rounded-xl border border-white/10 bg-black/25 px-4 pb-3 pt-4">
                  {runs.map((run) => {
                    const active = run.id === selectedRunId;
                    const tone = accuracyTone(run.accuracy_pct);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                        className="group flex w-16 shrink-0 flex-col items-center gap-1.5"
                        title={`Run #${run.id} · ${run.passed_count}/${run.total_questions} · ${run.git_commit_sha}`}
                      >
                        <span
                          className={cn(
                            "text-[10px] font-semibold",
                            active ? "text-zinc-100" : "text-zinc-500",
                          )}
                        >
                          {run.accuracy_pct}%
                        </span>
                        <div
                          className={cn(
                            "flex h-24 w-9 items-end overflow-hidden rounded-md border bg-white/[0.03] transition",
                            active
                              ? "border-sky-500/40"
                              : "border-white/10 group-hover:border-white/20",
                          )}
                        >
                          <div
                            style={{
                              height: `${Math.max(4, Math.min(100, run.accuracy_pct))}%`,
                            }}
                            className={cn(
                              "w-full rounded-sm bg-gradient-to-t",
                              tone === "emerald"
                                ? "from-emerald-600 to-emerald-300"
                                : tone === "amber"
                                  ? "from-amber-600 to-amber-300"
                                  : "from-rose-600 to-rose-300",
                            )}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-[9px]",
                            active ? "text-zinc-300" : "text-zinc-600",
                          )}
                        >
                          Run #{run.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedRun ? (
                <div className="rounded-xl border border-white/10 bg-[#090a0e]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-100">
                        Run #{selectedRun.id}
                      </span>
                      <Pill tone={accuracyTone(selectedRun.accuracy_pct)}>
                        {selectedRun.passed_count}/{selectedRun.total_questions}{" "}
                        passed · {selectedRun.accuracy_pct}%
                      </Pill>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                        <GitCommitHorizontal size={10} />
                        {selectedRun.git_commit_sha}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {formatDateTime(selectedRun.created_at)}
                    </span>
                  </div>

                  <div className="divide-y divide-white/5">
                    {selectedDetails.map((detail) => (
                      <details key={detail.id} className="group">
                        <summary className="flex cursor-pointer list-none items-start gap-2 px-3.5 py-2 transition hover:bg-white/[0.02]">
                          {detail.passed ? (
                            <CheckCircle2
                              size={13}
                              className="mt-0.5 shrink-0 text-emerald-400"
                            />
                          ) : (
                            <XCircle
                              size={13}
                              className="mt-0.5 shrink-0 text-rose-400"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[9px] text-zinc-600">
                                Q{detail.id}
                              </span>
                              <span className="rounded bg-white/5 px-1 py-0.5 text-[9px] text-zinc-500">
                                {detail.category}
                              </span>
                              <span className="text-[9px] text-zinc-600">
                                {detail.user_id}
                              </span>
                              {detail.escalated ? (
                                <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-300">
                                  escalated
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-zinc-300">
                              {detail.question}
                            </span>
                          </span>
                          <ArrowRight
                            size={11}
                            className="mt-1 shrink-0 text-zinc-700 transition group-open:rotate-90"
                          />
                        </summary>
                        <div className="space-y-2 border-t border-white/5 bg-black/20 px-3.5 py-2.5 text-[11px] leading-relaxed">
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                              Agent answer
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-zinc-400">
                              {detail.agent_answer}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                              Grader rationale
                            </p>
                            <p className="mt-1 text-zinc-400">
                              {detail.rationale}
                            </p>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
