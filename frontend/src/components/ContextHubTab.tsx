"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Code2,
  Eye,
  FileText,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  Layers,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  api,
  type HarnessCommit,
  type HarnessFile,
} from "@/lib/api";
import { cn, ErrorNote, Pill, Spinner, Toast } from "@/components/Ui";
import { DiffView } from "@/components/DiffView";
import { MarkdownLite } from "@/components/MarkdownLite";
import {
  basename,
  dirname,
  formatBytes,
  formatDateTime,
  timeAgo,
} from "@/lib/format";

function FileRow({
  file,
  active,
  onSelect,
  hint,
}: {
  file: HarnessFile;
  active: boolean;
  onSelect: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition",
        active
          ? "bg-sky-500/10 text-sky-200"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <FileText
        size={13}
        className={active ? "text-sky-400" : "text-zinc-600"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11.5px]">
          {basename(file.path)}
        </span>
        {hint ? (
          <span className="block truncate text-[10px] text-zinc-600">
            {hint}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[9px] text-zinc-700">
        {formatBytes(file.size)}
      </span>
    </button>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-1 mt-3 flex items-center gap-1.5 px-2 text-[9px] font-semibold uppercase tracking-widest text-zinc-600 first:mt-0">
      {icon}
      {children}
    </div>
  );
}

export function ContextHubTab() {
  const [files, setFiles] = useState<HarnessFile[]>([]);
  const [commits, setCommits] = useState<HarnessCommit[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [fileResponse, commitResponse] = await Promise.all([
        api.files(),
        api.commits(),
      ]);
      setFiles(fileResponse.files);
      setCommits(commitResponse.commits);
      setError(null);
      setSelectedPath((prev) =>
        prev && fileResponse.files.some((file) => file.path === prev)
          ? prev
          : (fileResponse.files.find((file) => file.path === "/INSTRUCTIONS.md")
              ?.path ??
            fileResponse.files[0]?.path ??
            null),
      );
      setSelectedSha((prev) =>
        prev && commitResponse.commits.some((commit) => commit.sha === prev)
          ? prev
          : (commitResponse.commits[0]?.sha ?? null),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the harness.",
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
    // Initial harness fetch; all state updates happen after awaited responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;
  const selectedCommit =
    commits.find((commit) => commit.sha === selectedSha) ?? null;

  const rootFiles = files.filter((file) => dirname(file.path) === "");
  const skillFiles = files.filter((file) => file.path.startsWith("/skills/"));
  const caseFiles = files.filter((file) => file.path.startsWith("/memory/cases/"));
  const userFiles = files.filter((file) => file.path.startsWith("/memory/users/"));
  const globalMemory = files.filter((file) => file.path === "/memory/AGENTS.md");

  async function rollback(commit: HarnessCommit) {
    const confirmed = window.confirm(
      `Roll back the harness to ${commit.sha}?\n\n"${commit.message}"\n\nThis hard-resets the harness Git repo and discards any later commits.`,
    );
    if (!confirmed) return;
    setRollingBack(commit.sha);
    setError(null);
    try {
      const response = await api.rollback(commit.sha);
      await load();
      setToast(`Rolled back harness to ${response.active_sha}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed.");
    } finally {
      setRollingBack(null);
    }
  }

  return (
    <div className="space-y-4">
      <Toast message={toast} />

      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}

      {/* Explorer */}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Harness files</h2>
              <Pill>{files.length}</Pill>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-white/10 p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
              title="Reload files & commits"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="max-h-[430px] overflow-y-auto p-2">
            {loading && !files.length ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
                <Spinner /> Reading harness…
              </div>
            ) : null}

            {!loading && !files.length ? (
              <p className="px-3 py-8 text-center text-xs text-zinc-500">
                Harness is empty. Start the backend to auto-seed it.
              </p>
            ) : null}

            {rootFiles.length ? (
              <>
                <SectionLabel icon={<ShieldCheck size={10} />}>
                  Root
                </SectionLabel>
                {rootFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    active={file.path === selectedPath}
                    onSelect={() => setSelectedPath(file.path)}
                  />
                ))}
              </>
            ) : null}

            {skillFiles.length ? (
              <>
                <SectionLabel icon={<Folder size={10} />}>Skills</SectionLabel>
                {skillFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    hint={dirname(file.path).replace("/skills/", "")}
                    active={file.path === selectedPath}
                    onSelect={() => setSelectedPath(file.path)}
                  />
                ))}
              </>
            ) : null}

            <SectionLabel icon={<FileText size={10} />}>Memory</SectionLabel>
            {globalMemory.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                hint="global learned rules"
                active={file.path === selectedPath}
                onSelect={() => setSelectedPath(file.path)}
              />
            ))}
            {caseFiles.length ? (
              <div className="mt-1 border-l border-white/5 pl-1">
                <p className="px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-700">
                  Cases · {caseFiles.length}
                </p>
                {caseFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    active={file.path === selectedPath}
                    onSelect={() => setSelectedPath(file.path)}
                  />
                ))}
              </div>
            ) : (
              <p className="px-2 py-1 text-[10px] italic text-zinc-600">
                No resolved cases yet — confirm a fix in Team Inbox.
              </p>
            )}
            {userFiles.length ? (
              <div className="mt-1 border-l border-white/5 pl-1">
                <p className="flex items-center gap-1 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-700">
                  <Users size={9} /> Users
                </p>
                {userFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    hint={dirname(file.path).replace("/memory/users/", "")}
                    active={file.path === selectedPath}
                    onSelect={() => setSelectedPath(file.path)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Viewer */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-zinc-200">
                {selectedFile?.path ?? "No file selected"}
              </p>
              {selectedFile ? (
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {formatBytes(selectedFile.size)} · modified{" "}
                  {formatDateTime(
                    new Date(selectedFile.last_modified * 1000).toISOString(),
                  )}
                </p>
              ) : null}
            </div>
            <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              <button
                type="button"
                onClick={() => setMode("rendered")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition",
                  mode === "rendered"
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <Eye size={11} />
                Rendered
              </button>
              <button
                type="button"
                onClick={() => setMode("raw")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition",
                  mode === "raw"
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <Code2 size={11} />
                Raw
              </button>
            </div>
          </div>

          <div className="max-h-[430px] min-h-[280px] flex-1 overflow-auto p-4">
            {selectedFile ? (
              mode === "rendered" ? (
                <div className="max-w-3xl">
                  <MarkdownLite content={selectedFile.content} />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-zinc-300">
                  {selectedFile.content}
                </pre>
              )
            ) : (
              <div className="grid h-full place-items-center text-xs text-zinc-600">
                Select a Markdown file from the tree.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Git history */}
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
            <div className="flex items-center gap-2">
              <History size={15} className="text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-100">
                Git timeline
              </h2>
            </div>
            <span className="font-mono text-[10px] text-zinc-600">
              {commits[0]?.sha ?? "—"}
            </span>
          </div>

          <div className="max-h-[380px] overflow-y-auto p-2">
            {!commits.length ? (
              <p className="px-3 py-8 text-center text-xs text-zinc-500">
                No commits yet.
              </p>
            ) : null}

            {commits.map((commit, index) => {
              const active = commit.sha === selectedSha;
              const isHead = index === 0;
              return (
                <div
                  key={commit.full_sha}
                  className={cn(
                    "group flex items-start gap-2 rounded-xl border px-2 py-2 transition",
                    active
                      ? "border-white/10 bg-white/[0.05]"
                      : "border-transparent hover:bg-white/[0.03]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedSha(commit.sha)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <div className="relative mt-0.5 flex flex-col items-center">
                      <span
                        className={cn(
                          "grid h-5 w-5 place-items-center rounded-full border",
                          isHead
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : "border-white/10 bg-white/5 text-zinc-500",
                        )}
                      >
                        <GitCommitHorizontal size={11} />
                      </span>
                      {index < commits.length - 1 ? (
                        <span className="mt-1 h-6 w-px bg-white/10" />
                      ) : null}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-sky-300">
                          {commit.sha}
                        </span>
                        {isHead ? (
                          <span className="rounded bg-emerald-500/15 px-1 text-[8px] font-semibold uppercase tracking-wide text-emerald-300">
                            head
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-zinc-300">
                        {commit.message}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-zinc-600">
                        {commit.author} · {timeAgo(commit.timestamp)}
                      </span>
                    </span>
                  </button>

                  {!isHead ? (
                    <button
                      type="button"
                      onClick={() => void rollback(commit)}
                      disabled={rollingBack !== null}
                      title={`Rollback to ${commit.sha}`}
                      className="mt-0.5 rounded-md border border-white/10 p-1 text-zinc-500 opacity-0 transition hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-300 group-hover:opacity-100 disabled:opacity-40"
                    >
                      {rollingBack === commit.sha ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <RotateCcw size={11} />
                      )}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Diff */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GitBranch size={14} className="text-zinc-400" />
                <span className="font-mono text-xs text-zinc-200">
                  {selectedCommit?.sha ?? "—"}
                </span>
                {selectedCommit ? (
                  <Pill tone="emerald">
                    <CheckCircle2 size={9} />
                    committed
                  </Pill>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-zinc-600">
                {selectedCommit
                  ? `${selectedCommit.message} · ${formatDateTime(selectedCommit.timestamp)}`
                  : "Select a commit to inspect its diff."}
              </p>
            </div>

            {selectedCommit && selectedCommit.sha !== commits[0]?.sha ? (
              <button
                type="button"
                onClick={() => void rollback(selectedCommit)}
                disabled={rollingBack !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                {rollingBack === selectedCommit.sha ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Rollback to {selectedCommit.sha}
              </button>
            ) : null}
          </div>

          <div className="max-h-[380px] min-h-[220px] overflow-auto p-3">
            <DiffView
              diff={selectedCommit?.diff ?? ""}
              className="max-h-[340px]"
              emptyLabel={
                selectedCommit
                  ? "Initial commit — this is the root snapshot of the harness."
                  : "Select a commit to view its diff."
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
