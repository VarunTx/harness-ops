function lineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "text-zinc-500";
  }
  if (line.startsWith("@@")) return "text-violet-300";
  if (line.startsWith("+")) return "bg-emerald-500/10 text-emerald-300";
  if (line.startsWith("-")) return "bg-rose-500/10 text-rose-300";
  return "text-zinc-400";
}

export function DiffView({
  diff,
  className,
  emptyLabel = "No changes in this diff.",
}: {
  diff: string;
  className?: string;
  emptyLabel?: string;
}) {
  if (!diff.trim()) {
    return (
      <div className="grid h-full min-h-[140px] place-items-center rounded-xl border border-white/10 bg-black/30 px-4 py-6 text-center text-xs text-zinc-500">
        {emptyLabel}
      </div>
    );
  }

  const lines = diff.replace(/\r\n/g, "\n").split("\n");

  return (
    <div
      className={`overflow-auto rounded-xl border border-white/10 bg-[#08090c] ${className ?? ""}`}
    >
      <pre className="min-w-full font-mono text-[11.5px] leading-[1.55]">
        <code>
          {lines.map((line, index) => (
            <div
              key={index}
              className={`whitespace-pre px-3 ${lineClass(line)}`}
            >
              {line || " "}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
