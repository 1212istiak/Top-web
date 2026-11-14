import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  Check,
  Film,
  FileText,
  Globe,
  Loader2,
  Menu,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Pencil,
  Search,
  Square,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  API_BASE,
  MAX_UPLOAD_BYTES,
  apiJson,
  authHeaders,
  blobToWavBase64,
  formatBytes,
  kindOf,
  makeThumb,
  streamChat,
  uid,
  uploadFile,
  type ActionState,
  type AttKind,
  type Attachment,
  type ServerMessage,
  type SessionRow,
  type StreamEvent,
  type UiAttachment,
} from "./api";
import { JerinStyles, MessageView, Orb, type ChatMsg } from "./parts";
import { VoiceStreamer, speakMessage, stopVoice, unlockAudio, useSpeakingOwner } from "./voice";

const LS_TOOLS = "jerin_tools";
const LS_VOICE = "jerin_voice";
const LS_LAST_SESSION = "jerin_last_session";
const MAX_RECORD_SECONDS = 120;
const MAX_ATTACHMENTS = 8;

const SUGGESTIONS = [
  "Which episodes are missing a Server 2 link?",
  "Suggest the next BTTH scene we should dub",
  "Write YouTube, Facebook and Telegram titles for my latest episode",
  "কমেন্টগুলো দেখে বলো দর্শকরা কী চাইছে",
];

interface Pending {
  key: string;
  name: string;
  kind: AttKind;
  status: "uploading" | "ready" | "error";
  progress: number;
  preview?: string;
  thumb?: string;
  att?: Attachment;
}

function mimeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["srt", "vtt", "md", "csv", "txt", "json", "log"].includes(ext)) return "text/plain";
  return "application/octet-stream";
}

function groupSessions(rows: SessionRow[]): { label: string; rows: SessionRow[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: Record<string, SessionRow[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const r of rows) {
    const t = new Date(r.updatedAt).getTime();
    if (t >= startOfToday) groups.Today.push(r);
    else if (t >= startOfToday - day) groups.Yesterday.push(r);
    else if (t >= startOfToday - 7 * day) groups["Previous 7 days"].push(r);
    else groups.Older.push(r);
  }
  return Object.entries(groups)
    .filter(([, v]) => v.length)
    .map(([label, v]) => ({ label, rows: v }));
}

function mapServerMessage(m: ServerMessage): ChatMsg {
  return {
    key: `s${m.id}`,
    id: m.id,
    role: m.role,
    text: m.text,
    attachments: m.attachments ?? undefined,
    action: m.action ?? undefined,
    sources: m.sources ?? undefined,
    thoughts: m.thoughts ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Memory dialog
// ---------------------------------------------------------------------------
function MemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<{ id: number; content: string }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setItems(null);
    apiJson<{ memory: { id: number; content: string }[] }>("/memory")
      .then((d) => setItems(d.memory))
      .catch(() => setItems([]));
  }, [open]);
  const remove = async (id: number) => {
    setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
    try {
      await apiJson(`/memory/${id}`, { method: "DELETE" });
    } catch {
      /* list refreshes next open */
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-400">
            <BrainCircuit className="h-5 w-5" /> Jerin's memory
          </DialogTitle>
          <DialogDescription>
            Facts Jerin saved to your database. She reads all of this in every chat. Ask her to "remember …" or remove anything here.
          </DialogDescription>
        </DialogHeader>
        <div className="jerin-scroll max-h-80 space-y-2 overflow-y-auto">
          {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {items?.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
          {items?.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-2.5 text-sm">
              <span className="flex-1 break-words">{m.content}</span>
              <button onClick={() => remove(m.id)} className="text-muted-foreground transition hover:text-red-400" aria-label="Forget">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main chat
// ---------------------------------------------------------------------------
export function JerinChat({ model, thinking }: { model: string; thinking: boolean }) {
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);

  const [tools, setTools] = useState<{ search: boolean; code: boolean }>(() => {
    try {
      return { search: true, code: false, ...JSON.parse(localStorage.getItem(LS_TOOLS) || "{}") };
    } catch {
      return { search: true, code: false };
    }
  });
  const [voiceOn, setVoiceOn] = useState<boolean>(() => localStorage.getItem(LS_VOICE) !== "false");
  const speakingOwner = useSpeakingOwner();

  // recording
  const [rec, setRec] = useState<{ seconds: number; levels: number[] } | null>(null);
  const recRef = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    ctx: AudioContext | null;
    raf: number;
    timer: number;
    started: number;
    send: boolean;
  } | null>(null);

  // scrolling
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- scrolling: stay pinned to the newest text unless the user scrolls up ------------------
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 120;
    setShowJump(dist > 320);
  };

  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  // Keep pinned to the newest text when anything changes height: images and code blocks loading
  // inside the messages, the thinking panel opening, or the message area itself shrinking because
  // the composer grew (attachment chips, multi-line input).
  useEffect(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom();
    });
    ro.observe(content);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  // ---- sessions ------------------------------------------------------------------------------
  const refreshSessions = useCallback(
    async (q = query) => {
      try {
        const d = await apiJson<{ sessions: SessionRow[] }>(`/sessions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        setSessions(d.sessions);
      } catch {
        /* sidebar just keeps its last state */
      }
    },
    [query],
  );

  useEffect(() => {
    const t = setTimeout(() => refreshSessions(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, refreshSessions]);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    stopVoice();
    sessionIdRef.current = null;
    setSessionId(null);
    setMessages([]);
    setInput("");
    setPending([]);
    localStorage.removeItem(LS_LAST_SESSION);
    stickRef.current = true;
  }, []);

  const openSession = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      stopVoice();
      setSidebarOpen(false);
      try {
        const d = await apiJson<{ session: SessionRow; messages: ServerMessage[] }>(`/sessions/${id}`);
        sessionIdRef.current = id;
        setSessionId(id);
        setMessages(d.messages.map(mapServerMessage));
        localStorage.setItem(LS_LAST_SESSION, id);
        stickRef.current = true;
        requestAnimationFrame(() => scrollToBottom());
      } catch (err: any) {
        toast({ title: "Couldn't open that chat", description: err.message, variant: "destructive" });
        if (localStorage.getItem(LS_LAST_SESSION) === id) localStorage.removeItem(LS_LAST_SESSION);
      }
    },
    [scrollToBottom, toast],
  );

  // Come back to the chat you were in.
  useEffect(() => {
    const last = localStorage.getItem(LS_LAST_SESSION);
    if (last) openSession(last);
    return () => {
      abortRef.current?.abort();
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSession = async (id: string) => {
    if (!window.confirm("Delete this chat permanently?")) return;
    try {
      await apiJson(`/sessions/${id}`, { method: "DELETE" });
      if (sessionIdRef.current === id) resetChat();
      refreshSessions();
    } catch (err: any) {
      toast({ title: "Couldn't delete", description: err.message, variant: "destructive" });
    }
  };

  const commitRename = async () => {
    if (!renaming) return;
    const { id, value } = renaming;
    setRenaming(null);
    if (!value.trim()) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: value.trim() } : s)));
    try {
      await apiJson(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title: value.trim() }) });
    } catch {
      refreshSessions();
    }
  };

  // ---- attachments ---------------------------------------------------------------------------
  const patchPending = (key: string, patch: Partial<Pending>) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setPending((prev) => {
        if (prev.length + list.length > MAX_ATTACHMENTS) {
          toast({ title: `Up to ${MAX_ATTACHMENTS} attachments per message`, variant: "destructive" });
          return prev;
        }
        const added: Pending[] = [];
        for (const file of list) {
          if (file.size > MAX_UPLOAD_BYTES) {
            toast({ title: `${file.name} is too large`, description: `Max ${formatBytes(MAX_UPLOAD_BYTES)} per file.`, variant: "destructive" });
            continue;
          }
          const mime = mimeFor(file);
          const kind = kindOf(mime);
          const key = uid();
          const preview = kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined;
          added.push({ key, name: file.name, kind, status: "uploading", progress: 0, preview });
          makeThumb(file).then((thumb) => thumb && patchPending(key, { thumb }));
          uploadFile(file, (pct) => patchPending(key, { progress: pct }), mime)
            .then((r) =>
              patchPending(key, {
                status: "ready",
                progress: 100,
                att: { kind, name: file.name, mimeType: r.mimeType, fileUri: r.fileUri, uploadedAt: r.uploadedAt },
              }),
            )
            .catch((err: Error) => {
              patchPending(key, { status: "error" });
              toast({ title: `Couldn't upload ${file.name}`, description: err.message, variant: "destructive" });
            });
        }
        return [...prev, ...added];
      });
    },
    [toast],
  );

  const uploading = pending.some((p) => p.status === "uploading");
  const readyAtts = (): UiAttachment[] =>
    pending
      .filter((p) => p.status === "ready" && p.att)
      .map((p) => ({ ...(p.att as Attachment), thumb: p.thumb, preview: p.preview }));

  // ---- send ----------------------------------------------------------------------------------
  const patchMsg = (key: string, fn: (m: ChatMsg) => ChatMsg) =>
    setMessages((prev) => prev.map((m) => (m.key === key ? fn(m) : m)));

  const send = useCallback(
    async (opts: { text: string; atts: UiAttachment[]; audio?: { inlineData: string }; regenerate?: boolean }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      unlockAudio();
      stickRef.current = true;

      const userKey = uid();
      const modelKey = uid();
      const uiAtts: UiAttachment[] = [...opts.atts];
      if (opts.audio) uiAtts.push({ kind: "audio", name: "Voice message", mimeType: "audio/wav" });

      setMessages((prev) => {
        let base = prev;
        if (opts.regenerate) {
          let i = base.length;
          while (i > 0 && base[i - 1].role === "model") i--;
          base = base.slice(0, i);
        }
        const add: ChatMsg[] = [];
        if (!opts.regenerate) add.push({ key: userKey, role: "user", text: opts.text, attachments: uiAtts.length ? uiAtts : undefined });
        add.push({ key: modelKey, role: "model", text: "", streaming: true });
        return [...base, ...add];
      });
      if (!opts.regenerate) {
        setInput("");
        setPending([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }

      const ac = new AbortController();
      abortRef.current = ac;
      const voice = voiceOn ? new VoiceStreamer(modelKey) : null;

      let textBuf = "";
      let thoughtBuf = "";
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (!textBuf && !thoughtBuf) return;
        const t = textBuf;
        const th = thoughtBuf;
        textBuf = "";
        thoughtBuf = "";
        patchMsg(modelKey, (m) => ({
          ...m,
          text: m.text + t,
          thoughts: th ? (m.thoughts || "") + th : m.thoughts,
          toolLabel: t ? undefined : m.toolLabel,
        }));
      };
      const schedule = () => {
        if (!raf) raf = requestAnimationFrame(flush);
      };

      const onEvent = (ev: StreamEvent) => {
        switch (ev.type) {
          case "session":
            sessionIdRef.current = ev.sessionId;
            setSessionId(ev.sessionId);
            localStorage.setItem(LS_LAST_SESSION, ev.sessionId);
            if (ev.userMessageId && !opts.regenerate) patchMsg(userKey, (m) => ({ ...m, id: ev.userMessageId as number }));
            if (ev.isNew) refreshSessions("");
            break;
          case "text":
            textBuf += ev.delta;
            voice?.feed(ev.delta);
            schedule();
            break;
          case "thought":
            thoughtBuf += ev.delta;
            schedule();
            break;
          case "transcript":
            patchMsg(userKey, (m) => ({ ...m, text: ev.text }));
            break;
          case "tool":
            patchMsg(modelKey, (m) => ({ ...m, toolLabel: ev.label }));
            break;
          case "image":
            patchMsg(modelKey, (m) => ({ ...m, attachments: [...(m.attachments ?? []), ev.attachment] }));
            break;
          case "sources":
            patchMsg(modelKey, (m) => ({ ...m, sources: ev.sources }));
            break;
          case "notice":
            patchMsg(modelKey, (m) => ({ ...m, notice: ev.text }));
            break;
          case "done":
            flush();
            patchMsg(modelKey, (m) => ({
              ...m,
              id: ev.messageId ?? m.id,
              action: ev.action ?? undefined,
              streaming: false,
              toolLabel: undefined,
            }));
            break;
          case "error":
            flush();
            patchMsg(modelKey, (m) => ({ ...m, error: ev.message, streaming: false, toolLabel: undefined }));
            break;
        }
      };

      try {
        const attachments = [
          ...opts.atts.map(({ preview: _p, ...a }) => a),
          ...(opts.audio
            ? [{ kind: "audio" as const, name: "Voice message", mimeType: "audio/wav", inlineData: opts.audio.inlineData }]
            : []),
        ];
        await streamChat(
          {
            sessionId: sessionIdRef.current,
            message: opts.text,
            attachments,
            model,
            thinking,
            tools,
            regenerate: opts.regenerate,
          },
          ac.signal,
          onEvent,
        );
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          flush();
          patchMsg(modelKey, (m) => ({ ...m, error: err?.message || "Something went wrong talking to Jerin.", streaming: false }));
        }
      } finally {
        if (raf) cancelAnimationFrame(raf);
        flush();
        voice?.end();
        // Drop an empty placeholder (e.g. stopped before anything arrived).
        setMessages((prev) =>
          prev
            .map((m) => (m.key === modelKey ? { ...m, streaming: false, toolLabel: undefined } : m))
            .filter((m) => !(m.key === modelKey && !m.text && !m.attachments?.length && !m.action && !m.error)),
        );
        abortRef.current = null;
        busyRef.current = false;
        setBusy(false);
        refreshSessions("");
        setTimeout(() => refreshSessions(""), 6000); // picks up the auto-generated title
      }
    },
    [model, thinking, tools, voiceOn, refreshSessions],
  );

  const submit = () => {
    if (busyRef.current || uploading) return;
    const text = input.trim();
    const atts = readyAtts();
    if (!text && !atts.length) return;
    void send({ text, atts });
  };

  const stop = () => {
    abortRef.current?.abort();
    stopVoice();
  };

  const regenerate = () => {
    if (busyRef.current) return;
    void send({ text: "", atts: [], regenerate: true });
  };

  // ---- actions (Confirm / Cancel cards) ------------------------------------------------------
  const persistAction = (id: number | undefined, status: ActionState["status"], result?: string) => {
    if (!id) return;
    apiJson(`/messages/${id}/action`, { method: "PATCH", body: JSON.stringify({ status, result }) }).catch(() => {});
  };

  const confirmAction = async (key: string) => {
    const msg = messages.find((m) => m.key === key);
    if (!msg?.action) return;
    const { name, args } = msg.action;
    patchMsg(key, (m) => ({ ...m, action: m.action && { ...m.action, status: "confirmed" } }));
    try {
      const res = await fetch(`${API_BASE}/api/rocky/execute-action`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: name, args }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Action failed");
      let result = "✅ Done.";
      if (name === "create_episode") result = `✅ Episode #${data.episodeId} is live.`;
      else if (name === "update_episode") result = `✅ Updated S${data.season} EP${data.episodeNumber} (${(data.changed || []).join(", ")}).`;
      else if (name === "schedule_social_post") result = `✅ Scheduled (${data.scheduledTime}).`;
      patchMsg(key, (m) => ({ ...m, action: m.action && { ...m.action, status: "confirmed", result } }));
      persistAction(msg.id, "confirmed", result);
    } catch (err: any) {
      const result = `❌ ${err.message}`;
      patchMsg(key, (m) => ({ ...m, action: m.action && { ...m.action, status: "failed", result } }));
      persistAction(msg.id, "failed", result);
    }
  };

  const cancelAction = (key: string) => {
    const msg = messages.find((m) => m.key === key);
    patchMsg(key, (m) => ({ ...m, action: m.action && { ...m.action, status: "cancelled" } }));
    persistAction(msg?.id, "cancelled");
  };

  // ---- voice recording -----------------------------------------------------------------------
  const finishRecording = useCallback(
    async (blob: Blob, seconds: number) => {
      if (seconds < 0.7 || blob.size < 1000) return;
      if (pending.some((p) => p.status === "uploading")) {
        toast({ title: "Still uploading your attachments — try again in a moment." });
        return;
      }
      try {
        const inlineData = await blobToWavBase64(blob);
        void send({ text: "", atts: readyAtts(), audio: { inlineData } });
      } catch {
        toast({ title: "Couldn't process that recording", description: "Try again, or type your message.", variant: "destructive" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, send, toast],
  );

  const stopRecording = useCallback((sendIt: boolean) => {
    const r = recRef.current;
    if (!r) return;
    r.send = sendIt;
    if (r.recorder.state !== "inactive") r.recorder.stop();
  }, []);

  const startRecording = async () => {
    unlockAudio();
    stopVoice();
    if (busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Recording isn't supported in this browser", description: "Try Chrome or Safari, or type your message.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      let ctx: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;
      try {
        const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
      } catch {
        ctx = null;
      }

      const started = Date.now();
      const state = { recorder, stream, chunks, ctx, raf: 0, timer: 0, started, send: true };
      recRef.current = state;

      const data = new Uint8Array(analyser?.frequencyBinCount ?? 0);
      let lastPaint = 0;
      const loop = (t: number) => {
        if (analyser && t - lastPaint > 60) {
          lastPaint = t;
          analyser.getByteFrequencyData(data);
          const levels = Array.from({ length: 26 }, (_, i) => data[Math.floor((i / 26) * data.length)] / 255);
          setRec((r) => (r ? { ...r, levels } : r));
        }
        state.raf = requestAnimationFrame(loop);
      };
      state.raf = requestAnimationFrame(loop);
      state.timer = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        setRec((r) => (r ? { ...r, seconds } : r));
        if (seconds >= MAX_RECORD_SECONDS) stopRecording(true);
      }, 250);

      recorder.onstop = () => {
        cancelAnimationFrame(state.raf);
        clearInterval(state.timer);
        stream.getTracks().forEach((t) => t.stop());
        state.ctx?.close().catch(() => {});
        const seconds = (Date.now() - started) / 1000;
        const sendIt = state.send;
        recRef.current = null;
        setRec(null);
        if (sendIt) void finishRecording(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), seconds);
      };

      recorder.start();
      setRec({ seconds: 0, levels: Array(26).fill(0.05) });
    } catch (err: any) {
      toast({
        title: "Couldn't access the microphone",
        description: err?.name === "NotAllowedError" ? "Allow microphone access in your browser settings." : err?.message,
        variant: "destructive",
      });
    }
  };

  useEffect(
    () => () => {
      if (recRef.current) {
        recRef.current.send = false;
        if (recRef.current.recorder.state !== "inactive") recRef.current.recorder.stop();
      }
    },
    [],
  );

  // ---- input handling ------------------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // On touch devices Enter makes a new line; the arrow button sends.
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    submit();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const toggleTool = (k: "search" | "code") => {
    const next = { ...tools, [k]: !tools[k] };
    setTools(next);
    localStorage.setItem(LS_TOOLS, JSON.stringify(next));
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem(LS_VOICE, String(next));
    if (!next) stopVoice();
    else unlockAudio();
  };

  const title = sessions.find((s) => s.id === sessionId)?.title;
  const lastModelKey = [...messages].reverse().find((m) => m.role === "model")?.key;
  const canSend = (!!input.trim() || pending.some((p) => p.status === "ready")) && !uploading;

  return (
    <div
      className="dark relative flex h-[calc(100dvh-15rem)] min-h-[520px] overflow-hidden rounded-2xl border border-cyan-900/40 text-foreground bg-gradient-to-b from-[#060d17]/90 to-[#04080f]/90 shadow-[0_0_40px_rgba(6,182,212,0.06)]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      <JerinStyles />

      {/* Sidebar */}
      {sidebarOpen && <div className="absolute inset-0 z-20 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-cyan-900/40 bg-[#050a12] transition-transform md:static md:z-auto md:w-64 md:shrink-0 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="space-y-2 p-3">
          <button
            onClick={() => {
              resetChat();
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <MessageSquarePlus className="h-4 w-4" /> New chat
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-cyan-500/50"
            />
          </div>
        </div>

        <div className="jerin-scroll flex-1 space-y-4 overflow-y-auto px-2 pb-3">
          {sessions.length === 0 && (
            <p className="px-2 pt-2 text-xs text-muted-foreground">{query ? "No chats match." : "Your chats will appear here."}</p>
          )}
          {groupSessions(sessions).map((g) => (
            <div key={g.label}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g.label}</div>
              {g.rows.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors",
                    s.id === sessionId ? "bg-cyan-500/15 text-cyan-200" : "text-foreground/80 hover:bg-white/5",
                  )}
                >
                  {renaming?.id === s.id ? (
                    <>
                      <input
                        autoFocus
                        value={renaming.value}
                        onChange={(e) => setRenaming({ id: s.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        className="min-w-0 flex-1 rounded bg-black/40 px-1.5 py-0.5 text-sm outline-none ring-1 ring-cyan-500/50"
                      />
                      <button onClick={() => void commitRename()} aria-label="Save name">
                        <Check className="h-4 w-4 text-cyan-400" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => void openSession(s.id)} className="min-w-0 flex-1 truncate text-left">
                        {s.title}
                      </button>
                      <button
                        onClick={() => setRenaming({ id: s.id, value: s.title })}
                        className="text-muted-foreground opacity-100 transition hover:text-cyan-300 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Rename chat"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void deleteSession(s.id)}
                        className="text-muted-foreground opacity-100 transition hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <button
          onClick={() => setMemoryOpen(true)}
          className="m-3 flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-muted-foreground transition hover:border-purple-500/40 hover:text-purple-300"
        >
          <BrainCircuit className="h-4 w-4" /> Jerin's memory
        </button>
      </aside>

      {/* Main column */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 md:hidden" aria-label="Open chats">
            <Menu className="h-5 w-5" />
          </button>
          <Orb active={busy} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{title || "New chat"}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {model.replace("gemini-", "Gemini ").replace("-flash", " Flash")} · {thinking ? "Deep thinking" : "Quick"}
            </div>
          </div>
          <button
            onClick={toggleVoice}
            className={cn("rounded-lg p-2 transition hover:bg-white/10", voiceOn ? "text-cyan-400" : "text-muted-foreground")}
            aria-label={voiceOn ? "Turn voice off" : "Turn voice on"}
            title={voiceOn ? "Voice replies on" : "Voice replies off"}
          >
            {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="jerin-scroll relative flex-1 overflow-y-auto overscroll-contain">
          <div ref={contentRef} className="mx-auto w-full max-w-3xl space-y-6 px-4 py-5">
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center pt-8 text-center sm:pt-14">
                <Orb active size={64} />
                <h3 className="mt-5 bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-2xl font-bold text-transparent">Hi Rocky, what's the plan?</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Ask anything, talk to me in Bangla or English, drop in images, videos or files, or tell me to update the site.
                </p>
                <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send({ text: s, atts: [] })}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-foreground/85 transition hover:border-cyan-500/40 hover:bg-cyan-500/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {messages.map((m) => (
              <MessageView
                key={m.key}
                msg={m}
                isLast={m.key === lastModelKey}
                speaking={speakingOwner === m.key}
                busy={busy}
                onSpeak={() => {
                  unlockAudio();
                  speakMessage(m.key, m.text);
                }}
                onStopSpeak={stopVoice}
                onRegenerate={regenerate}
                onConfirm={() => void confirmAction(m.key)}
                onCancel={() => cancelAction(m.key)}
              />
            ))}
          </div>
        </div>

        {showJump && (
          <button
            onClick={() => {
              stickRef.current = true;
              scrollToBottom(true);
            }}
            className="absolute bottom-36 left-1/2 z-10 -translate-x-1/2 rounded-full border border-cyan-500/40 bg-[#07111c]/95 p-2 text-cyan-300 shadow-lg backdrop-blur transition hover:bg-cyan-500/20"
            aria-label="Jump to latest"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {/* Composer */}
        <div className="px-3 pb-3 pt-1">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-lg transition focus-within:border-cyan-500/40">
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
                {pending.map((p) => {
                  const visual = p.preview && p.kind === "image" ? p.preview : p.thumb;
                  return (
                    <div key={p.key} className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-black/30 py-1.5 pl-1.5 pr-7">
                      {visual ? (
                        <img src={visual} alt="" className="h-9 w-9 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                          {p.kind === "video" ? <Film className="h-4 w-4 text-cyan-400" /> : <FileText className="h-4 w-4 text-cyan-400" />}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="max-w-[130px] truncate text-xs">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.status === "uploading" ? `Uploading ${p.progress}%` : p.status === "error" ? "Failed" : "Ready"}
                        </div>
                      </div>
                      {p.status === "uploading" && (
                        <div className="absolute bottom-0 left-0 h-0.5 bg-cyan-400 transition-all" style={{ width: `${p.progress}%` }} />
                      )}
                      <button
                        onClick={() => setPending((prev) => prev.filter((x) => x.key !== p.key))}
                        className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-red-400"
                        aria-label="Remove attachment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {rec ? (
              <div className="flex items-center gap-3 px-1 py-1.5">
                <button
                  onClick={() => stopRecording(false)}
                  className="rounded-full p-2.5 text-muted-foreground transition hover:bg-red-500/15 hover:text-red-400"
                  aria-label="Cancel recording"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <div className="flex flex-1 items-center gap-3">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                  <span className="w-12 font-mono text-sm tabular-nums">
                    {Math.floor(rec.seconds / 60)}:{String(rec.seconds % 60).padStart(2, "0")}
                  </span>
                  <div className="flex h-8 flex-1 items-center gap-[3px]">
                    {rec.levels.map((l, i) => (
                      <span key={i} className="w-[3px] rounded-full bg-cyan-400/80 transition-[height]" style={{ height: `${Math.max(12, l * 100)}%` }} />
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => stopRecording(true)}
                  className="rounded-full bg-cyan-500 p-2.5 text-black transition hover:bg-cyan-400"
                  aria-label="Send voice message"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={input}
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoGrow(e.target);
                  }}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  placeholder="Message Jerin — বাংলা বা English, যেটাই সুবিধা…"
                  className="jerin-scroll block max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2.5 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
                />
                <div className="flex items-center gap-1 px-1 pb-0.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,application/pdf,text/*,.md,.csv,.json,.srt,.vtt"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-cyan-300"
                    aria-label="Attach files"
                    title="Attach images, videos, audio, PDFs or text files"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => toggleTool("search")}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                      tools.search ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300" : "border-white/10 text-muted-foreground hover:bg-white/5",
                    )}
                    title="Let Jerin search the web and read links"
                  >
                    <Globe className="h-3.5 w-3.5" /> Search
                  </button>
                  <button
                    onClick={() => toggleTool("code")}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                      tools.code ? "border-purple-500/50 bg-purple-500/15 text-purple-300" : "border-white/10 text-muted-foreground hover:bg-white/5",
                    )}
                    title="Let Jerin run Python for calculations and data"
                  >
                    <Terminal className="h-3.5 w-3.5" /> Code
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => void startRecording()}
                    disabled={busy}
                    className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-cyan-300 disabled:opacity-40"
                    aria-label="Record a voice message"
                    title="Record a voice message (Bangla or English)"
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                  {busy ? (
                    <button onClick={stop} className="rounded-full bg-red-500/90 p-2.5 text-white transition hover:bg-red-500" aria-label="Stop">
                      <Square className="h-4 w-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={submit}
                      disabled={!canSend}
                      className="rounded-full bg-cyan-500 p-2.5 text-black transition hover:bg-cyan-400 disabled:bg-white/10 disabled:text-muted-foreground"
                      aria-label="Send"
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/60">
            Jerin can make mistakes. Site changes always wait for your confirmation.
          </p>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-cyan-400/70 bg-cyan-500/10 backdrop-blur-sm">
            <p className="text-sm font-medium text-cyan-200">Drop files to attach</p>
          </div>
        )}
      </section>

      <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />
    </div>
  );
}
