"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  GitCommitHorizontal,
  Inbox,
  RefreshCw,
  Sparkles,
  User,
} from "lucide-react";
import { api, type ResolveResponse, type Ticket } from "@/lib/api";
import { cn, EmptyState, ErrorNote, Pill, Spinner } from "@/components/Ui";
import { timeAgo, userColor, userInitials, userName } from "@/lib/format";

export function TeamInboxTab({
  tickets,
  pendingCount,
  loading,
  error,
  onRefresh,
}: {
  tickets: Ticket[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fallback =
    tickets.find((ticket) => ticket.status === "PENDING") ?? tickets[0] ?? null;
  const selected =
    tickets.find((ticket) => ticket.id === selectedId) ?? fallback;

  return (
    <div className="grid h-[calc(100vh-13.5rem)] min-h-[600px] gap-4 lg:grid-cols-[minmax(280px,390px)_minmax(0,1fr)]">
      {/* Queue */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
          <div className="flex items-center gap-2">
            <Inbox size={15} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Escalation queue
            </h2>
            <Pill tone={pendingCount > 0 ? "amber" : "neutral"}>
              {pendingCount} pending
            </Pill>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
            title="Refresh inbox"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error ? (
            <ErrorNote message={error} onRetry={onRefresh} className="m-2" />
          ) : null}

          {loading && !tickets.length ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
              <Spinner /> Loading tickets…
            </div>
          ) : null}

          {!loading && !tickets.length && !error ? (
            <EmptyState
              icon={<Inbox size={18} />}
              title="Inbox is empty"
              description="Escalations from the support agent will appear here."
            />
          ) : null}

          <div className="space-y-1.5">
            {tickets.map((ticket) => {
              const active = ticket.id === selected?.id;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-sky-500/40 bg-sky-500/10"
                      : "border-transparent hover:border-white/10 hover:bg-white/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br text-[9px] font-bold text-black/80",
                        userColor(ticket.user_id),
                      )}
                    >
                      {userInitials(ticket.user_id)}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-300">
                      {userName(ticket.user_id)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-zinc-600">
                      #{ticket.id}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 line-clamp-2 text-[12px] leading-snug",
                      active ? "text-zinc-100" : "text-zinc-400",
                    )}
                  >
                    {ticket.question}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Pill
                      tone={ticket.status === "PENDING" ? "amber" : "emerald"}
                    >
                      {ticket.status === "PENDING" ? (
                        <Clock3 size={9} />
                      ) : (
                        <CheckCircle2 size={9} />
                      )}
                      {ticket.status}
                    </Pill>
                    <span className="ml-auto text-[10px] text-zinc-600">
                      {timeAgo(ticket.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
        {!selected ? (
          <EmptyState
            icon={<Inbox size={18} />}
            title="Select a ticket"
            description="Pick an escalation on the left to inspect the agent's uncertainty and submit a verified fix."
          />
        ) : (
          <TicketDetail
            key={selected.id}
            ticket={selected}
            onResolved={(resolvedId) => {
              setSelectedId(resolvedId);
              return onRefresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function TicketDetail({
  ticket,
  onResolved,
}: {
  ticket: Ticket;
  onResolved: (ticketId: number) => void | Promise<void>;
}) {
  const [humanFix, setHumanFix] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveResponse | null>(null);

  async function submitFix() {
    if (!humanFix.trim() || submitting) return;
    setSubmitting(true);
    setResolveError(null);
    try {
      const response = await api.resolveTicket(ticket.id, humanFix.trim());
      setResult(response);
      setHumanFix("");
      await onResolved(ticket.id);
    } catch (err) {
      setResolveError(
        err instanceof Error ? err.message : "Failed to synthesize the lesson.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">
            Ticket #{ticket.id}
          </span>
          <Pill tone={ticket.status === "PENDING" ? "amber" : "emerald"}>
            {ticket.status === "PENDING" ? (
              <Clock3 size={9} />
            ) : (
              <CheckCircle2 size={9} />
            )}
            {ticket.status}
          </Pill>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br text-[9px] font-bold text-black/80",
              userColor(ticket.user_id),
            )}
          >
            {userInitials(ticket.user_id)}
          </span>
          {userName(ticket.user_id)}
          <span className="text-zinc-700">·</span>
          {timeAgo(ticket.created_at)}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <User size={11} />
            User question
          </h3>
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm leading-relaxed text-zinc-200">
            {ticket.question}
          </p>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Agent tentative answer
            </h3>
            <p className="text-xs leading-relaxed text-zinc-400">
              {ticket.tentative_answer}
            </p>
          </section>
          <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-3">
            <h3 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
              <AlertTriangle size={10} />
              Why it escalated
            </h3>
            <p className="text-xs leading-relaxed text-amber-100/70">
              {ticket.uncertainty_reason}
            </p>
          </section>
        </div>

        {ticket.status === "RESOLVED" ? (
          <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              <CheckCircle2 size={11} />
              Verified resolution
            </h3>
            <p className="text-xs leading-relaxed text-emerald-50/80">
              {ticket.human_fix ?? "—"}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ticket.created_case_path ? (
                <Pill tone="violet">
                  <FileText size={9} />
                  {ticket.created_case_path}
                </Pill>
              ) : null}
              {ticket.git_commit_sha ? (
                <Pill tone="neutral">
                  <GitCommitHorizontal size={9} />
                  {ticket.git_commit_sha}
                </Pill>
              ) : null}
            </div>
          </section>
        ) : null}

        {result ? (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <CheckCircle2 size={13} />
              Lesson committed to the harness
            </div>
            <p className="mt-1 font-mono text-[10px] text-emerald-200/70">
              {result.created_case_path} · commit {result.git_commit_sha}
            </p>
            <ul className="mt-2 space-y-1">
              {result.updated_files.map((file) => (
                <li
                  key={file}
                  className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-200/70"
                >
                  <FileText size={10} />
                  {file}
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-emerald-500/20 pt-2 text-[11px] leading-relaxed text-emerald-100/70">
              <span className="font-semibold text-emerald-300">
                New global rule:
              </span>{" "}
              {result.global_rule_added}
            </p>
          </section>
        ) : null}

        {ticket.status === "PENDING" ? (
          <section className="rounded-xl border border-white/10 bg-[#0a0b0f] px-3.5 py-3">
            <label
              htmlFor="human-fix"
              className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
            >
              <Sparkles size={11} className="text-sky-400" />
              Confirmed fix / ground truth
            </label>
            <textarea
              id="human-fix"
              rows={5}
              value={humanFix}
              onChange={(event) => setHumanFix(event.target.value)}
              placeholder="e.g. Archon creates its execution worktrees from origin/main, not local unpushed commits. The user must run `git push` and re-run `archon workflow run`."
              className="w-full resize-y rounded-xl border border-white/10 bg-[#111318] px-3 py-2.5 text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/10"
            />

            {resolveError ? (
              <ErrorNote message={resolveError} className="mt-2" />
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submitFix()}
                disabled={submitting || humanFix.trim().length < 5}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-[#06120c] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
              >
                {submitting ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles size={13} />
                )}
                {submitting
                  ? "Synthesizing lesson…"
                  : "Confirm Fix & Teach Agent"}
              </button>
              <span className="text-[10px] text-zinc-600">
                Runs Loop 1 · writes case + memory + Git commit
              </span>
            </div>

            <div className="mt-3 grid gap-1.5 border-t border-white/5 pt-3 text-[10px] text-zinc-500 sm:grid-cols-3">
              <span>
                <span className="font-mono text-violet-300">1.</span> Case file
                in <span className="font-mono">/memory/cases/</span>
              </span>
              <span>
                <span className="font-mono text-violet-300">2.</span> Global rule
                in <span className="font-mono">/memory/AGENTS.md</span>
              </span>
              <span>
                <span className="font-mono text-violet-300">3.</span> Private user
                memory note
              </span>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
