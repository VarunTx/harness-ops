import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-sky-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (
      token.startsWith("**") &&
      token.endsWith("**") &&
      token.length > 4
    ) {
      return (
        <strong key={index} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

/**
 * Tiny Markdown renderer for agent replies: headings, bullets, code fences,
 * bold and inline code. No external markdown dependency.
 */
export function MarkdownLite({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 space-y-1 pl-4">
        {list.map((item, itemIndex) => (
          <li
            key={itemIndex}
            className="list-disc leading-relaxed marker:text-zinc-600"
          >
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[12px] leading-relaxed text-zinc-300"
        >
          <code>{buffer.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      index += 1;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^\s*\d+\.\s+/, ""));
      index += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();
      flushList();
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#{1,6}\s+/, "");
      const size =
        level <= 1
          ? "text-base"
          : level === 2
            ? "text-sm"
            : "text-[13px]";
      blocks.push(
        <p
          key={`h-${blocks.length}`}
          className={`mt-2 font-semibold text-zinc-100 ${size}`}
        >
          {renderInline(text)}
        </p>,
      );
      index += 1;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph();
  flushList();

  return <div className="space-y-1.5 text-sm text-zinc-300">{blocks}</div>;
}
