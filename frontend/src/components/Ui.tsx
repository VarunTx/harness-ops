import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type Tone = "neutral" | "sky" | "violet" | "amber" | "emerald" | "rose";

const TONE_STYLES: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-zinc-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE_STYLES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function ErrorNote({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-rose-400/30 px-2 py-0.5 font-medium text-rose-200 transition hover:bg-rose-500/20"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl border border-emerald-500/30 bg-[#0f1a15] px-4 py-2.5 text-xs font-medium text-emerald-200 shadow-2xl shadow-black/50">
      {message}
    </div>
  );
}
