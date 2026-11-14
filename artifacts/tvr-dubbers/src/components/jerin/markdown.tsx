import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const child = Children.toArray(children)[0];
  let code = "";
  let lang = "";
  if (isValidElement(child)) {
    const props = (child as ReactElement<{ className?: string; children?: ReactNode }>).props;
    code = String(props.children ?? "").replace(/\n$/, "");
    lang = /language-(\w+)/.exec(props.className ?? "")?.[1] ?? "";
  } else {
    code = String(child ?? "");
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black/50">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wide">{lang || "code"}</span>
        <button onClick={copy} className="flex items-center gap-1 transition-colors hover:text-cyan-300">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-foreground/95 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 whitespace-pre-wrap break-words">{children}</p>,
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold text-cyan-300">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold text-cyan-300">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-base font-semibold text-cyan-200">{children}</h3>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-cyan-500">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-cyan-500">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-300">
              {children}
            </a>
          ),
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-cyan-500/60 pl-3 italic text-muted-foreground">{children}</blockquote>,
          hr: () => <hr className="my-4 border-white/10" />,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ children }) => <code className="rounded bg-white/10 px-1.5 py-0.5 text-[0.85em] text-cyan-200">{children}</code>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
          th: ({ children }) => <th className="border-b border-white/10 px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-white/5 px-3 py-2 align-top">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
