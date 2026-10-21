"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Brain,
  FileText,
  FolderSearch,
  Lock,
  PenLine,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import { api, type HistoryMessage, type ToolStep } from "@/lib/api";
import { cn, Spinner } from "@/components/Ui";
import { MarkdownLite } from "@/components/MarkdownLite";
import { userColor, userInitials, userName } from "@/lib/format";

type IconType = ComponentType<{ className?: string; size?: number | string }>;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolSteps?: ToolStep[];
  escalated?: boolean;
  ticketId?: number | null;
  createdAt: number;
};

const USERS = [
  { id: "nina", role: "Senior Backend Engineer" },
  { id: "omar", role: "Full-Stack Developer" },
  { id: "alex", role: "DevOps Engineer" },
] as const;

const QUICK_PROMPTS = [
  {
    label: "Nina · plan.md ran stale",
    user: "nina",
    text: "Hi, I'm Nina. I committed a fix to my plan.md command locally and I ran the Archon workflow, but the run used my old command text.",
  },
  {
    label: "Nina · worktree lock after Ctrl+C",
    user: "nina",
    text: "I cancelled an Archon run mid-flight with Ctrl+C and now new runs refuse to start with a worktree lock error. How do I reset it?",
  },
  {
    label: "Omar · PR missing 3 commits",
    user: "omar",
    text: "I'm Omar. My Archon run finished green and opened a PR, but the diff is missing three commits I made this morning. Is this a bug or what?",
  },
  {
    label: "Alex · STRIPE_TEST_KEY undefined",
    user: "alex",
    text: "My workflow fails saying `STRIPE_TEST_KEY` is undefined even though I exported it in my terminal right before running `archon workflow run`.",
  },
  {
    label: "Alex · archon init",
    user: "alex",
    text: "How do I initialize Archon in a brand new repository?",
  },
];

const TOOL_META: Record<string, { icon: IconType; tone: string }> = {
  read_file: {
    icon: FileText,
    tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  glob: {
    icon: FolderSearch,
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
  memory_load: {
    icon: Brain,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  write_file: {
    icon: PenLine,
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  escalate_to_human: {
    icon: AlertTriangle,
    tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
};

const FALLBACK_TOOL = {
  icon: Wrench,
  tone: "border-white/10 bg-white/5 text-zinc-300",
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseToolSteps(raw: string): ToolStep[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ToolStep[]) : [];
  } catch {
    return [];
  }
}

function mapHistoryMessage(row: HistoryMessage): ChatMessage {
  const toolSteps =
    row.role === "assistant" ? parseToolSteps(row.tool_steps_json) : undefined;
  const escalation = toolSteps?.find(
    (step) => step.tool === "escalate_to_human",
  );
  const ticketMatch = escalation?.input.match(/Ticket #(\d+)/);
  return {
    id: `db-${row.id}`,
    role: row.role,
    content: row.content,
    toolSteps,
    escalated: row.escalated,
    ticketId: ticketMatch ? Number(ticketMatch[1]) : null,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function ToolBadge({ step }: { step: ToolStep }) {
  const meta = TOOL_META[step.tool] ?? FALLBACK_TOOL;
  const Icon = meta.icon;
  return (
    <span
      title={step.input}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px]",
        meta.tone,
      )}
    >
      <Icon size={12} />
      <span className="shrink-0">{step.tool}</span>
      <span className="max-w-[220px] truncate font-sans text-zinc-400">
        {step.input}
      </span>
    </span>
  );
}

export function SupportChatTab({
  onOpenInbox,
  onTicketCreated,
}: {
  onOpenInbox: () => void;
  onTicketCreated: () => void;
}) {
  const [user, setUser] = useState<string>("nina");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesUser, setMessagesUser] = useState<string>("nina");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadId = `thread-${user}`;

  function selectUser(nextUser: string) {
    if (nextUser === user || loading) return;
    setUser(nextUser);
  }

  useEffect(() => {
    let active = true;
    api
      .chatHistory(user, threadId)
      .then(({ messages: rows }) => {
        if (!active) return;
        setMessages(rows.map(mapHistoryMessage));
        setMessagesUser(user);
        setHistoryLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setMessages([]);
        setMessagesUser(user);
        setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, historyLoading]);

  async function clearChat() {
    try {
      await api.clearChatHistory(user, threadId);
    } catch {
      // Clearing the local view is still useful if the request fails.
    }
    setMessages([]);
    setMessagesUser(user);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || isSyncing) return;

    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await api.chat(user, text, threadId);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: response.reply,
          toolSteps: response.tool_steps,
          escalated: response.escalated,
          ticketId: response.ticket_id,
          createdAt: Date.now(),
        },
      ]);
      if (response.escalated) onTicketCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reach the support agent.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const activeUser = USERS.find((u) => u.id === user) ?? USERS[0];
  const visibleMessages = messagesUser === user ? messages : [];
  const isSyncing = messagesUser !== user || historyLoading;

  return (
    <div className="flex h-[calc(100vh-13.5rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12] shadow-2xl shadow-black/30">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0a0b0f] px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {USERS.map((candidate) => {
            const active = candidate.id === user;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectUser(candidate.id)}
                className={cn(
                  "group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition",
                  active
                    ? "border-sky-500/40 bg-sky-500/10"
                    : "border-transparent hover:border-white/10 hover:bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br text-[10px] font-bold text-black/80",
                    userColor(candidate.id),
                  )}
                >
                  {userInitials(candidate.id)}
                </span>
                <span className="hidden sm:block">
                  <span
                    className={cn(
                      "block text-xs font-semibold",
                      active ? "text-sky-200" : "text-zinc-300",
                    )}
                  >
                    {userName(candidate.id)}
                  </span>
                  <span className="block text-[10px] text-zinc-500">
                    {candidate.role}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <Lock size={10} />
            Private memory isolated
          </span>
          <button
            type="button"
            onClick={() => void clearChat()}
            disabled={isSyncing || !visibleMessages.length || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Quick prompts */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-white/5 bg-[#0a0b0f]/60 px-3 py-2">
        <span className="flex shrink-0 items-center gap-1 pr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
          <Sparkles size={11} />
          Try
        </span>
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            onClick={() => {
              selectUser(prompt.user);
              setInput(prompt.text);
            }}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-200"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isSyncing ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500">
            <Spinner /> Loading conversation…
          </div>
        ) : null}

        {!isSyncing && visibleMessages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/20 to-violet-500/10 text-sky-300">
              <Bot size={26} />
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-100">
                Archon Developer Help Desk
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-zinc-500">
                The agent loads <span className="font-mono text-zinc-400">INSTRUCTIONS.md</span>,{" "}
                progressive skills, and {userName(activeUser.id)}&apos;s private memory —
                then escalates when it cannot verify an answer.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 text-[11px] text-zinc-600">
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono">
                {threadId}
              </span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono">
                /memory/users/{user}/AGENTS.md
              </span>
            </div>
          </div>
        ) : null}

        {visibleMessages.map((message) =>
          message.role === "user" ? (
            <div
              key={message.id}
              className="flex animate-fade-up justify-end gap-2"
            >
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-sky-500/20 bg-sky-500/10 px-3.5 py-2.5 text-sm leading-relaxed text-sky-50">
                {message.content}
              </div>
              <span
                className={cn(
                  "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[10px] font-bold text-black/80",
                  userColor(user),
                )}
              >
                {userInitials(user)}
              </span>
            </div>
          ) : (
            <div
              key={message.id}
              className="flex animate-fade-up gap-2"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-300">
                <Bot size={15} />
              </span>
              <div className="max-w-[88%] space-y-2">
                <div className="rounded-2xl rounded-tl-md border border-white/10 bg-[#12141a] px-3.5 py-2.5">
                  <MarkdownLite content={message.content} />
                </div>

                {message.toolSteps && message.toolSteps.length > 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      <Bot size={11} />
                      Tool trace · {message.toolSteps.length} steps
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {message.toolSteps.map((step, index) => (
                        <ToolBadge key={`${message.id}-${index}`} step={step} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {message.escalated ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    <AlertTriangle size={13} />
                    <span className="flex-1">
                      Escalated to Team Inbox · Ticket #{message.ticketId ?? "?"}
                    </span>
                    <button
                      type="button"
                      onClick={onOpenInbox}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 px-2 py-0.5 font-medium transition hover:bg-amber-500/20"
                    >
                      View ticket
                      <ArrowUpRight size={11} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}

        {loading ? (
          <div className="flex animate-fade-up gap-2">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-300">
              <Bot size={15} />
            </span>
            <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-white/10 bg-[#12141a] px-3.5 py-3 text-xs text-zinc-400">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" />
              </span>
              Consulting the harness · reading skills &amp; memory
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 bg-[#0a0b0f] p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#111318] p-2 transition focus-within:border-sky-500/40 focus-within:ring-2 focus-within:ring-sky-500/10">
          <User size={15} className="mb-2 ml-1 shrink-0 text-zinc-600" />
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={loading || isSyncing}
            placeholder={`Message the Archon help desk as ${userName(activeUser.id)}…`}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || isSyncing || !input.trim()}
            className="mb-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-[#061018] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            <Send size={13} />
            Send
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-zinc-600">
          Enter to send · Shift+Enter for newline · thread{" "}
          <span className="font-mono text-zinc-500">{threadId}</span>
        </p>
      </div>
    </div>
  );
}
