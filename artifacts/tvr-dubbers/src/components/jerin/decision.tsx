import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, ListChecks, FileAudio, FileVideo, FileImage, File as FileIcon } from "lucide-react";
import {
  MAX_DECISION_FILE_BYTES,
  formatBytes,
  runDecision,
  uid,
  uploadDecisionMedia,
  type DecisionAnswer,
  type DecisionQuestion,
  type DecisionResult,
} from "./api";
import { PRESETS, type Preset, type PresetQuestion } from "./decision-presets";

// ---------------------------------------------------------------------------
// Checker: scores a thumbnail, a dub clip or a title against a checklist using Gemini Decision.
// It returns probabilities, not prose, so each answer is drawn as a bar.
// ---------------------------------------------------------------------------

const MAX_FILES = 3;
const REUPLOAD_AFTER_MS = 8 * 60_000; // the server keeps a file for 10 minutes

interface PickedFile {
  id: string;
  file: File;
  status: "uploading" | "ready" | "error";
  progress: number;
  mediaId?: string;
  uploadedAt?: number;
  error?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Tone = "good" | "bad" | "mixed" | "neutral";
const TONE_BAR: Record<Tone, string> = {
  good: "bg-emerald-500",
  bad: "bg-red-500",
  mixed: "bg-amber-400",
  neutral: "bg-cyan-500",
};
const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-600",
  bad: "text-red-600",
  mixed: "text-amber-600",
  neutral: "text-cyan-600",
};

/** 1 = as good as it gets, 0 = as bad as it gets. */
function toneOf(goodness: number): Tone {
  return goodness >= 0.65 ? "good" : goodness <= 0.35 ? "bad" : "mixed";
}

function FileGlyph({ type }: { type: string }) {
  if (type.startsWith("image/")) return <FileImage className="h-4 w-4 shrink-0" />;
  if (type.startsWith("audio/")) return <FileAudio className="h-4 w-4 shrink-0" />;
  if (type.startsWith("video/")) return <FileVideo className="h-4 w-4 shrink-0" />;
  return <FileIcon className="h-4 w-4 shrink-0" />;
}

function Bar({ value, tone, label }: { value: number; tone: Tone; label: string }) {
  return (
    <div
      className="h-2 w-full rounded-full bg-white/10 overflow-hidden"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp01(value) * 100)}
      aria-label={label}
    >
      <div className={`h-full rounded-full transition-all duration-500 ${TONE_BAR[tone]}`} style={{ width: pct(clamp01(value)) }} />
    </div>
  );
}

function Confidence({ value }: { value: number | null }) {
  if (value === null) return null;
  return <span className="text-[11px] text-muted-foreground">sure: {pct(value)}</span>;
}

function AnswerCard({ q, a }: { q: PresetQuestion; a: DecisionAnswer | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-black/20 p-3 space-y-2" data-testid={`answer-${q.key}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium leading-snug">{q.label}</div>
        {a && !a.missing && <Confidence value={a.confidence} />}
      </div>
      {!a || a.missing ? (
        <div className="text-xs text-muted-foreground">No answer came back for this question.</div>
      ) : a.type === "noul" ? (
        <NoulBody q={q} yes={a.yes ?? 0.5} />
      ) : a.type === "choice" ? (
        <ChoiceBody q={q} a={a} />
      ) : (
        <ScoreBody q={q} a={a} />
      )}
      <div className="text-[11px] text-muted-foreground/80 leading-snug">{q.instructions}</div>
    </div>
  );
}

function NoulBody({ q, yes }: { q: PresetQuestion; yes: number }) {
  const tone: Tone = q.good ? toneOf(q.good === "yes" ? yes : 1 - yes) : "neutral";
  const word = yes >= 0.5 ? "Yes" : "No";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className={`text-base font-semibold ${TONE_TEXT[tone]}`}>{word}</span>
        <span className="text-xs text-muted-foreground">chance of yes: {pct(yes)}</span>
      </div>
      <Bar value={yes} tone={tone} label={`${q.label}: chance of yes`} />
    </div>
  );
}

function ChoiceBody({ q, a }: { q: PresetQuestion; a: DecisionAnswer }) {
  const nice = (k: string) => q.optionLabels?.[k] ?? k.replace(/_/g, " ");
  const rows = Object.entries(a.probabilities ?? {})
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3);
  const winner = a.choice ?? rows[0]?.[0] ?? null;
  return (
    <div className="space-y-2">
      <div className="text-base font-semibold text-cyan-600">{winner ? nice(winner) : "—"}</div>
      {rows.map(([k, p]) => (
        <div key={k} className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={k === winner ? "text-foreground" : ""}>{nice(k)}</span>
            <span>{pct(p)}</span>
          </div>
          <Bar value={p} tone={k === winner ? "neutral" : "mixed"} label={`${nice(k)} probability`} />
        </div>
      ))}
    </div>
  );
}

function ScoreBody({ q, a }: { q: PresetQuestion; a: DecisionAnswer }) {
  const levels = Array.isArray(q.criteria) ? q.criteria : Object.values(a.legend ?? {});
  const max = Math.max(1, levels.length - 1);
  const score = clamp01((a.score ?? 0) / max) * max;
  const nearest = a.legend?.[String(Math.round(score))] ?? levels[Math.round(score)] ?? "";
  const frac = score / max;
  const tone = toneOf(q.higherIsBetter === false ? 1 - frac : frac);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-base font-semibold ${TONE_TEXT[tone]}`}>
          {score.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ {max}</span>
        </span>
        <span className="text-xs text-muted-foreground text-right">{nearest}</span>
      </div>
      <Bar value={frac} tone={tone} label={`${q.label}: score`} />
      <div className="flex justify-between text-[10px] text-muted-foreground/70">
        <span>{q.higherIsBetter === false ? "best" : "worst"}</span>
        <span>{q.higherIsBetter === false ? "worst" : "best"}</span>
      </div>
    </div>
  );
}

export function CheckerPanel() {
  const { toast } = useToast();
  const [presetId, setPresetId] = useState<Preset["id"]>("thumbnail");
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ data: DecisionResult; questions: PresetQuestion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The questions that will be sent: a preset's checklist, or one yes/no question per custom line.
  const questions: PresetQuestion[] = useMemo(() => {
    if (preset.id !== "custom") return preset.questions;
    return custom
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((line, i) => ({ key: `q${i + 1}`, label: line.length > 60 ? `${line.slice(0, 57)}…` : line, type: "noul" as const, instructions: line.slice(0, 500) }));
  }, [preset, custom]);

  const anyUploading = files.some((f) => f.status === "uploading");
  const readyFiles = files.filter((f) => f.status === "ready");
  const hasInput = !!text.trim() || readyFiles.length > 0;
  const missingFile = preset.needsFile && readyFiles.length === 0;
  const missingText = preset.needsText && !text.trim();
  const canRun = !running && !anyUploading && hasInput && !missingFile && !missingText && questions.length > 0;

  const startUpload = (item: PickedFile) => {
    uploadDecisionMedia(item.file, (progress) => setFiles((fs) => fs.map((f) => (f.id === item.id ? { ...f, progress } : f))))
      .then((r) => setFiles((fs) => fs.map((f) => (f.id === item.id ? { ...f, status: "ready", progress: 100, mediaId: r.mediaId, uploadedAt: Date.now(), error: undefined } : f))))
      .catch((e: Error) => setFiles((fs) => fs.map((f) => (f.id === item.id ? { ...f, status: "error", error: e.message } : f))));
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const room = MAX_FILES - files.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) toast({ title: `Up to ${MAX_FILES} files`, description: "Extra files were skipped." });
    const items: PickedFile[] = [];
    for (const file of picked) {
      if (file.size > MAX_DECISION_FILE_BYTES) {
        toast({ title: "File too big", description: `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_DECISION_FILE_BYTES)} — try a shorter clip.`, variant: "destructive" });
        continue;
      }
      items.push({ id: uid(), file, status: "uploading", progress: 0 });
    }
    if (!items.length) return;
    setFiles((fs) => [...fs, ...items]);
    items.forEach(startUpload);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (id: string) => setFiles((fs) => fs.filter((f) => f.id !== id));

  const choosePreset = (id: Preset["id"]) => {
    setPresetId(id);
    setResult(null);
    setError(null);
  };

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      // The server only keeps a file for 10 minutes; send stale ones again first.
      const fresh: PickedFile[] = [];
      for (const f of readyFiles) {
        if (f.uploadedAt && Date.now() - f.uploadedAt > REUPLOAD_AFTER_MS) {
          const r = await uploadDecisionMedia(f.file, () => {});
          const next = { ...f, mediaId: r.mediaId, uploadedAt: Date.now() };
          setFiles((fs) => fs.map((x) => (x.id === f.id ? next : x)));
          fresh.push(next);
        } else fresh.push(f);
      }
      const body: Record<string, DecisionQuestion> = {};
      for (const q of questions) body[q.key] = { type: q.type, instructions: q.instructions, ...(q.criteria ? { criteria: q.criteria } : {}) };
      const data = await runDecision({
        text: text.trim() || undefined,
        mediaIds: fresh.map((f) => f.mediaId!).filter(Boolean),
        questions: body,
      });
      setResult({ data, questions });
    } catch (e: any) {
      setError(e?.message || "The check failed.");
    } finally {
      setRunning(false);
    }
  };

  const showFiles = preset.accept !== "";

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold text-cyan-600 flex items-center gap-2">
          <ListChecks className="h-5 w-5" /> Checker
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Gemini Decision scores your work against a checklist in a second or two. These are AI estimates — a guide, not a verdict.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="What to check">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === presetId}
            onClick={() => choosePreset(p.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
              p.id === presetId ? "bg-cyan-500 border-cyan-500 text-black font-medium shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "bg-white/5 border-border text-muted-foreground hover:bg-white/10"
            }`}
          >
            <span className="mr-1.5">{p.emoji}</span>
            {p.name}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{preset.hint}</p>

      {preset.id === "custom" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="checker-custom">
            Your yes/no questions, one per line ({questions.length}/40)
          </label>
          <Textarea
            id="checker-custom"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={"Does it mention the episode number?\nIs the audio free of background noise?"}
            className="min-h-[90px]"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="checker-text">
          {preset.textLabel}
        </label>
        <Textarea
          id="checker-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={preset.textPlaceholder}
          className={preset.needsText ? "min-h-[130px]" : "min-h-[60px]"}
          maxLength={20000}
        />
      </div>

      {showFiles && (
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept={preset.accept} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={files.length >= MAX_FILES}>
            <Upload className="h-4 w-4 mr-2" />
            {preset.id === "thumbnail" ? "Choose thumbnail" : preset.id === "dub" ? "Choose audio or video" : "Add a file"}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">up to {MAX_FILES} files, {formatBytes(MAX_DECISION_FILE_BYTES)} each</span>
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-md border border-border bg-black/20 px-2.5 py-1.5 text-sm">
                  <FileGlyph type={f.file.type} />
                  <span className="truncate flex-1">{f.file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.file.size)}</span>
                  {f.status === "uploading" && (
                    <span className="text-xs text-cyan-300 shrink-0 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> {f.progress}%
                    </span>
                  )}
                  {f.status === "ready" && <span className="text-xs text-emerald-400 shrink-0">ready</span>}
                  {f.status === "error" && (
                    <span className="text-xs text-red-400 shrink-0" title={f.error}>
                      failed
                    </span>
                  )}
                  {f.status === "error" && (
                    <button className="text-xs underline text-muted-foreground" onClick={() => { setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, status: "uploading", progress: 0 } : x))); startUpload(f); }}>
                      retry
                    </button>
                  )}
                  <button onClick={() => removeFile(f.id)} aria-label={`Remove ${f.file.name}`} className="text-muted-foreground hover:text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.some((f) => f.status === "error") && <p className="text-xs text-red-400">{files.find((f) => f.status === "error")?.error}</p>}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={run} disabled={!canRun} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {running ? "Checking…" : `Check (${questions.length} question${questions.length === 1 ? "" : "s"})`}
        </Button>
        {!canRun && !running && (
          <span className="text-xs text-muted-foreground">
            {anyUploading
              ? "Waiting for the upload…"
              : missingFile
                ? "Add a file to check."
                : missingText
                  ? "Paste the text to check."
                  : questions.length === 0
                    ? "Write at least one question."
                    : !hasInput
                      ? "Add some text or a file."
                      : ""}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3" data-testid="checker-results">
          <div className="text-xs text-muted-foreground">
            Checked in {(result.data.ms / 1000).toFixed(1)} s
            {result.data.usage.inputTokens ? ` · ${result.data.usage.inputTokens.toLocaleString()} input tokens` : ""} · Gemini Decision
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.questions.map((q) => (
              <AnswerCard key={q.key} q={q} a={result.data.answers[q.key]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
