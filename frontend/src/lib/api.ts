export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = 20000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : text;
      throw new ApiError(
        detail || `Request failed with status ${response.status}`,
        response.status,
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw new ApiError(
      error instanceof Error ? error.message : "Network request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ToolStep = {
  tool: string;
  input: string;
};

export type ChatResponse = {
  reply: string;
  escalated: boolean;
  ticket_id: number | null;
  tool_steps: ToolStep[];
};

export type HistoryMessage = {
  id: number;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  tool_steps_json: string;
  escalated: boolean;
  created_at: string;
};

export type Ticket = {
  id: number;
  user_id: string;
  question: string;
  tentative_answer: string;
  uncertainty_reason: string;
  status: "PENDING" | "RESOLVED";
  human_fix: string | null;
  created_case_path: string | null;
  git_commit_sha: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type InboxResponse = {
  pending_count: number;
  tickets: Ticket[];
};

export type ResolveResponse = {
  status: string;
  ticket_id: number;
  created_case_path: string;
  global_rule_added: string;
  updated_files: string[];
  git_commit_sha: string;
};

export type HarnessFile = {
  path: string;
  size: number;
  last_modified: number;
  content: string;
};

export type HarnessCommit = {
  sha: string;
  full_sha: string;
  message: string;
  author: string;
  timestamp: string;
  diff: string;
};

export type EvolutionProposal = {
  id: number;
  trace_summary: string;
  failure_diagnosis: string;
  target_file: string;
  original_content: string;
  proposed_content: string;
  unified_diff: string;
  status: "PROPOSED" | "APPLIED" | "REJECTED";
  git_commit_sha: string | null;
  created_at: string;
};

export type ApplyProposalResponse = {
  status: string;
  proposal_id: number;
  target_file: string;
  git_commit_sha: string;
};

export type RollbackResponse = {
  status: string;
  active_sha: string;
};

export type EvalDetail = {
  id: number;
  category: string;
  user_id: string;
  question: string;
  agent_answer: string;
  escalated: boolean;
  passed: boolean;
  rationale: string;
};

export type EvalRun = {
  id: number;
  git_commit_sha: string;
  dataset: "dev" | "holdout";
  total_questions: number;
  passed_count: number;
  accuracy_pct: number;
  details_json: string;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Endpoints                                                          */
/* ------------------------------------------------------------------ */

export const api = {
  chat(userId: string, message: string, threadId: string) {
    return request<ChatResponse>("/api/chat", {
      method: "POST",
      timeoutMs: 180000,
      body: JSON.stringify({
        user_id: userId,
        thread_id: threadId,
        message,
      }),
    });
  },

  chatHistory(userId: string, threadId: string) {
    const params = new URLSearchParams({ user_id: userId, thread_id: threadId });
    return request<{ messages: HistoryMessage[] }>(
      `/api/chat/history?${params.toString()}`,
    );
  },

  clearChatHistory(userId: string, threadId: string) {
    const params = new URLSearchParams({ user_id: userId, thread_id: threadId });
    return request<{ deleted: number }>(
      `/api/chat/history?${params.toString()}`,
      { method: "DELETE", timeoutMs: 15000 },
    );
  },

  inbox() {
    return request<InboxResponse>("/api/inbox");
  },

  resolveTicket(ticketId: number, humanFix: string) {
    return request<ResolveResponse>(`/api/inbox/${ticketId}/resolve`, {
      method: "POST",
      timeoutMs: 180000,
      body: JSON.stringify({ human_fix: humanFix }),
    });
  },

  files() {
    return request<{ files: HarnessFile[] }>("/api/harness/files");
  },

  commits() {
    return request<{ commits: HarnessCommit[] }>("/api/harness/commits");
  },

  rollback(commitSha: string) {
    return request<RollbackResponse>(`/api/harness/rollback/${commitSha}`, {
      method: "POST",
      timeoutMs: 60000,
    });
  },

  proposals() {
    return request<{ proposals: EvolutionProposal[] }>(
      "/api/evolution/proposals",
    );
  },

  analyze() {
    return request<EvolutionProposal>("/api/evolution/analyze", {
      method: "POST",
      timeoutMs: 240000,
    });
  },

  applyProposal(proposalId: number) {
    return request<ApplyProposalResponse>(
      `/api/evolution/apply/${proposalId}`,
      { method: "POST", timeoutMs: 60000 },
    );
  },

  evalRuns() {
    return request<{ runs: EvalRun[] }>("/api/evals/runs");
  },

  runEvals() {
    return request<EvalRun>("/api/evals/run", {
      method: "POST",
      timeoutMs: 1800000,
    });
  },
};
