"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  FlaskConical,
  FolderGit2,
  Inbox,
  MessageSquare,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api, API_BASE, type InboxResponse } from "@/lib/api";
import { cn } from "@/components/Ui";
import { SupportChatTab } from "@/components/SupportChatTab";
import { TeamInboxTab } from "@/components/TeamInboxTab";
import { ContextHubTab } from "@/components/ContextHubTab";
import { EvolutionEvalTab } from "@/components/EvolutionEvalTab";

type TabId = "chat" | "inbox" | "context" | "evolution";

const TABS: Array<{
  id: TabId;
  label: string;
  shortLabel: string;
  icon: typeof MessageSquare;
}> = [
  { id: "chat", label: "Support Chat", shortLabel: "Chat", icon: MessageSquare },
  { id: "inbox", label: "Team Inbox", shortLabel: "Inbox", icon: Inbox },
  {
    id: "context",
    label: "Context Hub",
    shortLabel: "Context",
    icon: FolderGit2,
  },
  {
    id: "evolution",
    label: "Evolution & Evals",
    shortLabel: "Evolution",
    icon: FlaskConical,
  },
];

export default function Home() {
  const [tab, setTab] = useState<TabId>("chat");
  const [inbox, setInbox] = useState<InboxResponse>({
    pending_count: 0,
    tickets: [],
  });
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const fetchInbox = useCallback(async () => {
    try {
      const data = await api.inbox();
      setInbox(data);
      setOnline(true);
      setInboxError(null);
    } catch (err) {
      setOnline(false);
      setInboxError(
        err instanceof Error ? err.message : "Unable to reach the HarnessOps API.",
      );
    } finally {
      setInboxLoading(false);
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    setInboxLoading(true);
    await fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    // Initial inbox fetch plus polling. State lands in .then/finally callbacks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInbox();
    const timer = setInterval(() => void fetchInbox(), 20000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#08090b]/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-[#07080a] shadow-lg shadow-sky-500/20">
                <Terminal size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-zinc-50">
                  HarnessOps <span className="text-zinc-500">Studio</span>
                </h1>
                <p className="truncate text-[10.5px] text-zinc-500">
                  Self-improving production support · Archon Help Desk
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium",
                  online === null
                    ? "border-white/10 bg-white/5 text-zinc-400"
                    : online
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300",
                )}
                title={API_BASE}
              >
                {online === null ? (
                  <Activity size={11} className="animate-pulse" />
                ) : online ? (
                  <Wifi size={11} />
                ) : (
                  <WifiOff size={11} />
                )}
                {online === null
                  ? "Connecting"
                  : online
                    ? "API online"
                    : "API offline"}
              </span>
              <a
                href={`${API_BASE}/docs`}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[10.5px] text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 sm:inline-flex"
              >
                <BookOpen size={11} />
                API docs
              </a>
            </div>
          </div>

          <nav className="-mb-px flex gap-1 overflow-x-auto pb-0">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    if (item.id === "inbox") void refreshInbox();
                  }}
                  className={cn(
                    "group relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition",
                    active
                      ? "border-sky-400 text-zinc-50"
                      : "border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-300",
                  )}
                >
                  <Icon
                    size={14}
                    className={active ? "text-sky-400" : "text-zinc-600"}
                  />
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                  {item.id === "inbox" && inbox.pending_count > 0 ? (
                    <span className="ml-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-400 px-1 text-[9.5px] font-bold text-[#1a1206]">
                      {inbox.pending_count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-8 pt-4 sm:px-6">
        {inboxError ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] text-amber-200">
            <WifiOff size={13} className="shrink-0" />
            <span className="flex-1">
              Cannot reach the backend at{" "}
              <span className="font-mono">{API_BASE}</span>. Start FastAPI (or set{" "}
              <span className="font-mono">NEXT_PUBLIC_API_BASE</span> in{" "}
              <span className="font-mono">frontend/.env.local</span>).
            </span>
            <button
              type="button"
              onClick={() => void refreshInbox()}
              className="rounded-md border border-amber-400/30 px-2 py-0.5 font-medium transition hover:bg-amber-500/20"
            >
              Retry
            </button>
          </div>
        ) : null}

        <section className={tab === "chat" ? "block" : "hidden"}>
          <SupportChatTab
            onOpenInbox={() => {
              setTab("inbox");
              void refreshInbox();
            }}
            onTicketCreated={() => void refreshInbox()}
          />
        </section>

        <section className={tab === "inbox" ? "block" : "hidden"}>
          <TeamInboxTab
            tickets={inbox.tickets}
            pendingCount={inbox.pending_count}
            loading={inboxLoading}
            error={inboxError}
            onRefresh={refreshInbox}
          />
        </section>

        <section className={tab === "context" ? "block" : "hidden"}>
          <ContextHubTab />
        </section>

        <section className={tab === "evolution" ? "block" : "hidden"}>
          <EvolutionEvalTab />
        </section>
      </main>

      <footer className="border-t border-white/5 bg-[#08090b]/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-3 text-[10px] text-zinc-600 sm:px-6">
          <span>
            HarnessOps · Markdown harness in{" "}
            <span className="font-mono text-zinc-500">./harness</span> · commit
            history via Git
          </span>
          <span className="flex items-center gap-3">
            <span className="font-mono">{API_BASE}</span>
            <span className="hidden text-zinc-700 sm:inline">|</span>
            <span className="hidden sm:inline">
              Loop 1 memory · Loop 2 evolution
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
