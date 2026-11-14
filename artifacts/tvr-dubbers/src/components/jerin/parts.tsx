import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Film,
  Globe,
  Loader2,
  Mic,
  RefreshCw,
  Square,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE, authHeaders, type ActionState, type Source, type UiAttachment } from "./api";
import { Markdown } from "./markdown";

export interface ChatMsg {
  key: string;
  id?: number;
  role: "user" | "model";
  text: string;
  attachments?: UiAttachment[];
  action?: ActionState;
  sources?: Source[];
  thoughts?: string;
  streaming?: boolean;
  toolLabel?: string;
  error?: string;
  notice?: string;
}

// Shared keyframes for the shimmer text and typing caret.
export function JerinStyles() {
  return (
    <style>{`
      @keyframes jerin-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      .jerin-shimmer { background: linear-gradient(90deg,#64748b 0%,#67e8f9 25%,#e2e8f0 50%,#67e8f9 75%,#64748b 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: jerin-shimmer 2.4s linear infinite; }
      @keyframes jerin-caret { 0%,100% { opacity: 1 } 50% { opacity: 0.15 } }
      .jerin-caret { display:inline-block; width:7px; height:1.05em; margin-left:2px; vertical-align:text-bottom; border-radius:2px; background:#22d3ee; animation: jerin-caret 0.9s ease-in-out infinite; }
      .jerin-scroll::-webkit-scrollbar { width: 8px; } .jerin-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,.25); border-radius: 8px; } .jerin-scroll::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  );
}

export function Orb({ active, size = 30 }: { active?: boolean; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {active && <div className="absolute -inset-1 rounded-full bg-cyan-400/40 blur-md" />}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-300 via-sky-500 to-purple-500"
        animate={active ? { scale: [1, 1.14, 1], rotate: [0, 12, 0] } : { scale: 1, rotate: 0 }}
        transition={active ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.25 }}
      />
      <span className="relative flex h-full w-full items-center justify-center text-[11px] font-black text-black/80">J</span>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-cyan-400"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function ThoughtsPanel({ thoughts, live }: { thoughts: string; live: boolean }) {
  const [open, setOpen] = useState(live);
  useEffect(() => {
    if (!live) setOpen(false);
  }, [live]);
  return (
    <div className="mb-2 rounded-xl border border-purple-500/20 bg-purple-500/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-purple-300/90"
      >
        <Brain className="h-3.5 w-3.5" />
        <span>{live ? "Thinking…" : "Thought process"}</span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="jerin-scroll max-h-40 overflow-y-auto border-t border-purple-500/15 px-3 py-2 text-xs italic leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {thoughts}
        </div>
      )}
    </div>
  );
}

// Generated images are stored in the database and need the admin token to fetch.
const mediaCache = new Map<string, string>();

function GeneratedImage({ att }: { att: UiAttachment }) {
  const [src, setSrc] = useState<string | undefined>(att.mediaId ? mediaCache.get(att.mediaId) : undefined);
  useEffect(() => {
    if (src || !att.mediaId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/rocky/media/${att.mediaId}`, { headers: authHeaders(false) })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("media"))))
      .then((b) => {
        const url = URL.createObjectURL(b);
        mediaCache.set(att.mediaId as string, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [att.mediaId, src]);

  if (!src) return <div className="h-48 w-48 animate-pulse rounded-2xl bg-white/5" />;
  return (
    <div className="group relative inline-block">
      <img src={src} alt={att.name} className="max-h-80 max-w-full rounded-2xl border border-white/10" />
      <a
        href={src}
        download={att.name}
        className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Download image"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}

export function AttachmentView({ att }: { att: UiAttachment }) {
  if (att.generated && att.mediaId) return <GeneratedImage att={att} />;
  const visual = att.preview || att.thumb;
  if (att.kind === "image" && visual) {
    return (
      <img
        src={visual}
        alt={att.name}
        onClick={() => att.preview && window.open(att.preview, "_blank")}
        className={cn("max-h-52 max-w-full rounded-2xl border border-white/10 object-cover", att.preview && "cursor-zoom-in")}
      />
    );
  }
  if (att.kind === "video") {
    if (att.preview) {
      return <video src={att.preview} controls playsInline className="max-h-56 max-w-full rounded-2xl border border-white/10" />;
    }
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10">
        {att.thumb ? (
          <img src={att.thumb} alt={att.name} className="max-h-44 object-cover" />
        ) : (
          <div className="h-28 w-44 bg-white/5" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <Film className="h-7 w-7 text-white/90" />
        </div>
        <div className="absolute bottom-0 w-full truncate bg-black/60 px-2 py-1 text-[10px] text-white/80">{att.name}</div>
      </div>
    );
  }
  const Icon = att.kind === "audio" ? Mic : att.kind === "image" ? Film : FileText;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
      <Icon className="h-4 w-4 text-cyan-400" />
      <span className="max-w-[180px] truncate">{att.kind === "audio" ? "Voice message" : att.name}</span>
    </div>
  );
}

function actionLabel(a: ActionState): string {
  const x = a.args;
  if (a.name === "create_episode") return `Create episode #${x.episodeNumber}: "${x.title}"${x.genre ? ` (${x.genre})` : ""}`;
  if (a.name === "update_episode") {
    const parts: string[] = [];
    if (x.primaryServerUrl) parts.push(`Server 1 → ${x.primaryServerUrl}`);
    if (x.backupServerUrl) parts.push(`Server 2 → ${x.backupServerUrl}`);
    if (x.title) parts.push(`title → "${x.title}"`);
    if (x.genre) parts.push(`genre → ${x.genre}`);
    if (x.thumbnailUrl) parts.push(`thumbnail → ${x.thumbnailUrl}`);
    return `Update${x.season ? ` S${x.season}` : ""} EP${x.episodeNumber}: ${parts.join(", ")}`;
  }
  if (a.name === "schedule_social_post") return `Schedule post on ${x.platformIds?.length || 0} platform(s): "${x.content}"`;
  return a.name;
}

function ActionCard({ action, onConfirm, onCancel }: { action: ActionState; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
      <p className="break-words text-xs font-semibold text-cyan-300">⚡ {actionLabel(action)}</p>
      {action.status === "pending" && (
        <div className="mt-2.5 flex gap-2">
          <button onClick={onConfirm} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-cyan-400">
            Confirm
          </button>
          <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-white/10">
            Cancel
          </button>
        </div>
      )}
      {action.status === "confirmed" && !action.result && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Running…
        </p>
      )}
      {action.status === "cancelled" && <p className="mt-2 text-xs text-muted-foreground">Cancelled.</p>}
      {action.result && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{action.result}</p>}
    </div>
  );
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-cyan-300"
    >
      {children}
    </button>
  );
}

export function MessageView({
  msg,
  isLast,
  speaking,
  busy,
  onSpeak,
  onStopSpeak,
  onRegenerate,
  onConfirm,
  onCancel,
}: {
  msg: ChatMsg;
  isLast: boolean;
  speaking: boolean;
  busy: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
  onRegenerate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (msg.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col items-end gap-1.5">
        {!!msg.attachments?.length && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {msg.attachments.map((a, i) => (
              <AttachmentView key={i} att={a} />
            ))}
          </div>
        )}
        {msg.text && (
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-cyan-400/20 bg-gradient-to-br from-cyan-500/25 to-blue-600/20 px-4 py-2.5 text-[15px] leading-relaxed">
            {msg.text}
          </div>
        )}
      </motion.div>
    );
  }

  const thinking = !!msg.streaming && !msg.text;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex gap-3">
      <div className="pt-0.5">
        <Orb active={!!msg.streaming} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-400/80">Jerin</div>

        {msg.thoughts && <ThoughtsPanel thoughts={msg.thoughts} live={thinking} />}

        {thinking && (
          <div className="flex items-center gap-3 py-1">
            <TypingDots />
            <span className="jerin-shimmer text-sm font-medium">{msg.toolLabel ? `${msg.toolLabel}…` : "Jerin is thinking…"}</span>
          </div>
        )}

        {msg.streaming && msg.text && msg.toolLabel && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            {msg.toolLabel}…
          </div>
        )}

        {msg.text && (
          <div>
            <Markdown>{msg.text}</Markdown>
            {msg.streaming && <span className="jerin-caret" />}
          </div>
        )}

        {!!msg.attachments?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.attachments.map((a, i) => (
              <AttachmentView key={i} att={a} />
            ))}
          </div>
        )}

        {msg.action && <ActionCard action={msg.action} onConfirm={onConfirm} onCancel={onCancel} />}

        {!!msg.sources?.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {msg.sources.map((s) => (
              <a
                key={s.uri}
                href={s.uri}
                target="_blank"
                rel="noreferrer noopener"
                className="flex max-w-[220px] items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-cyan-500/40 hover:text-cyan-300"
              >
                <Globe className="h-3 w-3 shrink-0" />
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        )}

        {msg.notice && <p className="mt-2 text-xs text-yellow-400/90">{msg.notice}</p>}
        {msg.error && (
          <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{msg.error}</div>
        )}

        {!msg.streaming && (msg.text || msg.error) && (
          <div className="mt-1.5 flex items-center gap-0.5 -ml-1.5">
            {msg.text && (
              <IconButton onClick={copy} label="Copy">
                {copied ? <Check className="h-4 w-4 text-cyan-400" /> : <Copy className="h-4 w-4" />}
              </IconButton>
            )}
            {msg.text &&
              (speaking ? (
                <IconButton onClick={onStopSpeak} label="Stop voice">
                  <Square className="h-4 w-4 text-red-400" />
                </IconButton>
              ) : (
                <IconButton onClick={onSpeak} label="Read aloud">
                  <Volume2 className="h-4 w-4" />
                </IconButton>
              ))}
            {isLast && !busy && (
              <IconButton onClick={onRegenerate} label="Regenerate">
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
