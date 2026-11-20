import express, { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { isRateLimited } from "../lib/rate-limit";
import {
  CHAT_MODELS,
  GeminiError,
  clearUnrecognisedRests,
  friendlyGeminiError,
  generateOnce,
  geminiReason,
  hasGeminiKeys,
  pooledFetch,
  streamGenerate,
  thinkingOffConfig,
  thinkingOnConfig,
} from "../lib/gemini";

const router: IRouter = Router();

// ===========================================================================
// Gemini Decision: scores / classifies text, images, audio, video and PDFs against a list of
// questions in one fast call (POST /v1beta/decisions). It returns probabilities, not prose.
//
//   POST /rocky/decision/media  raw file body  -> { mediaId }   (kept in memory for 10 minutes)
//   POST /rocky/decision        { text?, mediaIds?, questions } -> { answers, usage }
// ===========================================================================
export const DECISION_MODEL = "gemini-decision-1";

const MB = 1024 * 1024;
const MAX_MEDIA_BYTES = 25 * MB; // per file
const STORE_CAP_BYTES = 80 * MB; // everything held in memory at once (Render's free tier has 512 MB)
const MEDIA_TTL_MS = 10 * 60_000;
const MAX_MEDIA_PER_CHECK = 3;
const MAX_TEXT_CHARS = 20_000;
const MAX_QUESTIONS = 40;
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---------------------------------------------------------------------------
// Temporary media store (files are sent inline to Decision as base64, so they only need to live
// between "pick the file" and "press Check")
// ---------------------------------------------------------------------------
interface StoredMedia {
  id: string;
  mime: string;
  name: string;
  data: Buffer;
  at: number;
}
const media = new Map<string, StoredMedia>();

function sweepMedia(): void {
  const now = Date.now();
  for (const [id, m] of media) if (now - m.at > MEDIA_TTL_MS) media.delete(id);
}

function putMedia(m: StoredMedia): void {
  sweepMedia();
  let total = 0;
  for (const x of media.values()) total += x.data.length;
  // Oldest first (Map keeps insertion order) until the new file fits.
  for (const [id, old] of media) {
    if (total + m.data.length <= STORE_CAP_BYTES) break;
    media.delete(id);
    total -= old.data.length;
  }
  media.set(m.id, m);
}

function normaliseMime(raw: string): string | null {
  let m = raw.split(";")[0].trim().toLowerCase();
  if (m === "audio/mp3") m = "audio/mpeg";
  if (m === "audio/x-wav" || m === "audio/wave") m = "audio/wav";
  if (/^(image|audio|video)\/[a-z0-9.+-]+$/.test(m) || m === "application/pdf") return m;
  return null;
}

function mediaBlock(m: StoredMedia): Record<string, unknown> {
  const data = m.data.toString("base64");
  if (m.mime.startsWith("image/")) return { type: "image", data, mime_type: m.mime, resolution: "medium" };
  if (m.mime.startsWith("video/")) return { type: "video", data, mime_type: m.mime, resolution: "low" };
  if (m.mime.startsWith("audio/")) return { type: "audio", data, mime_type: m.mime };
  return { type: "document", data, mime_type: m.mime };
}

// Reads the raw body, but answers "too big" in plain words instead of an HTML error page.
const rawMedia = express.raw({ type: () => true, limit: MAX_MEDIA_BYTES });
function readMedia(req: Request, res: Response, next: NextFunction): void {
  rawMedia(req, res, (err?: unknown) => {
    if (!err) return next();
    const tooBig = (err as { status?: number })?.status === 413;
    res.status(tooBig ? 413 : 400).json({
      error: tooBig
        ? `That file is too big for a check (max ${MAX_MEDIA_BYTES / MB} MB). Try a shorter clip or a smaller image.`
        : "Couldn't read that upload.",
    });
  });
}

router.post("/rocky/decision/media", requireAdmin, readMedia, (req: Request, res: Response): void => {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Empty upload." });
    return;
  }
  if (isRateLimited(30, "decision-media")) {
    res.status(429).json({ error: "Too many uploads this minute — try again shortly." });
    return;
  }
  const mime = normaliseMime(String(req.headers["x-file-mime"] || ""));
  if (!mime) {
    res.status(415).json({ error: "Decision can check images, audio, video, PDFs and text. That file type isn't supported." });
    return;
  }
  let name = "file";
  try {
    name = decodeURIComponent(String(req.headers["x-file-name"] || "file")).slice(0, 120);
  } catch {
    /* keep default */
  }
  const id = randomUUID();
  putMedia({ id, mime, name, data: body, at: Date.now() });
  res.json({ mediaId: id, mimeType: mime, name, size: body.length, expiresInSeconds: MEDIA_TTL_MS / 1000 });
});

// ---------------------------------------------------------------------------
// Questions: validated here so a bad request gets a clear message instead of a vague Google 400
// ---------------------------------------------------------------------------
type QType = "noul" | "choice" | "score";
type Questions = Record<string, { type: QType; instructions: string; criteria?: unknown }>;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number): string | null => (typeof x === "string" && x.trim() && x.length <= max ? x.trim() : null);

function cleanQuestions(raw: unknown): { ok: true; questions: Questions } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: "Add at least one question." };
  const keys = Object.keys(raw);
  if (keys.length < 1) return { ok: false, error: "Add at least one question." };
  if (keys.length > MAX_QUESTIONS) return { ok: false, error: `Too many questions (max ${MAX_QUESTIONS}).` };
  const out: Questions = {};
  for (const key of keys) {
    const q = raw[key];
    if (!KEY_RE.test(key)) return { ok: false, error: `Question name "${key.slice(0, 30)}" must use only letters, numbers, - and _ (max 64).` };
    if (!isObj(q)) return { ok: false, error: `Question "${key}" is invalid.` };
    const type = q.type;
    if (type !== "noul" && type !== "choice" && type !== "score") return { ok: false, error: `Question "${key}" has an unknown type.` };
    const instructions = str(q.instructions, 500);
    if (!instructions) return { ok: false, error: `Question "${key}" needs text (up to 500 characters).` };
    const item: Questions[string] = { type, instructions };

    if (type === "noul" && isObj(q.criteria)) {
      const c: Record<string, string> = {};
      for (const f of ["true_description", "false_description"] as const) {
        if (q.criteria[f] === undefined) continue;
        const v = str(q.criteria[f], 300);
        if (!v) return { ok: false, error: `Question "${key}": ${f} must be short text.` };
        c[f] = v;
      }
      if (Object.keys(c).length) item.criteria = c;
    }
    if (type === "choice") {
      if (!isObj(q.criteria)) return { ok: false, error: `Question "${key}" needs its options.` };
      const entries = Object.entries(q.criteria);
      if (entries.length < 2 || entries.length > 255) return { ok: false, error: `Question "${key}" needs 2 to 255 options.` };
      const c: Record<string, string> = {};
      for (const [k, v] of entries) {
        const d = str(v, 300);
        if (!k || k.length > 64 || !d) return { ok: false, error: `Question "${key}" has an invalid option.` };
        c[k] = d;
      }
      item.criteria = c;
    }
    if (type === "score") {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 255)
        return { ok: false, error: `Question "${key}" needs 2 or more score levels.` };
      const levels = q.criteria.map((v) => str(v, 300));
      if (levels.some((v) => !v)) return { ok: false, error: `Question "${key}" has an empty score level.` };
      item.criteria = levels;
    }
    out[key] = item;
  }
  return { ok: true, questions: out };
}

// ---------------------------------------------------------------------------
// Answers: one normal shape for the page whatever Google returns
// ---------------------------------------------------------------------------
interface DecisionAnswer {
  type: QType;
  /** 0-1, how sure the model is. */
  confidence: number | null;
  /** noul: probability the answer is yes (0.01-0.99). */
  yes?: number | null;
  /** choice: the winning option. */
  choice?: string | null;
  /** score: probability-weighted level (0 = first level). */
  score?: number | null;
  probabilities?: Record<string, number>;
  /** score: what each level number means. */
  legend?: Record<string, string>;
  /** Google sent nothing for this question. */
  missing?: boolean;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
function mapOf<T>(x: unknown, pick: (v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x)) {
    const p = pick(v);
    if (p !== null) out[k] = p;
  }
  return out;
}

function normaliseAnswers(json: unknown, questions: Questions): Record<string, DecisionAnswer> {
  const raw = isObj(json) && isObj(json.answers) ? json.answers : {};
  const out: Record<string, DecisionAnswer> = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = raw[key];
    if (!isObj(a)) {
      out[key] = { type: q.type, confidence: null, missing: true };
      continue;
    }
    const confidence = num(a.confidence);
    if (q.type === "noul") {
      out[key] = { type: "noul", confidence, yes: num(a.noul) ?? num(a.probability) ?? num(a.yes) };
    } else if (q.type === "choice") {
      const probabilities = mapOf(a.probabilities, num);
      const top = Object.entries(probabilities).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      out[key] = { type: "choice", confidence, choice: typeof a.choice === "string" ? a.choice : top, probabilities };
    } else {
      let legend = mapOf(a.legend, (v) => (typeof v === "string" ? v : null));
      if (!Object.keys(legend).length && Array.isArray(q.criteria)) {
        legend = Object.fromEntries((q.criteria as string[]).map((d, i) => [String(i), d]));
      }
      out[key] = { type: "score", confidence, score: num(a.score), probabilities: mapOf(a.probabilities, num), legend };
    }
  }
  return out;
}

function decisionError(err: GeminiError): { status: number; message: string } {
  const body = err.body || "";
  if (err.friendly) return { status: 502, message: err.friendly };
  if (err.status === 400 && /safety|prohibited_content|blocklist|image_safety|content_blocked/i.test(body)) {
    return { status: 422, message: "Google's safety filter blocked this input, so there are no answers. Try a different file or text." };
  }
  if (err.status === 400) {
    const why = geminiReason(body);
    return { status: 400, message: `Gemini Decision rejected the request${why ? `: ${why.slice(0, 280).replace(/[.\s]+$/, "")}` : " (a file may be too large or the wrong type)"}.` };
  }
  if (err.status === 404) {
    return { status: 502, message: "Gemini Decision isn't available on your API keys (the Decisions API may not be open to your account yet)." };
  }
  return { status: 502, message: friendlyGeminiError(err.status, body, "Gemini Decision") };
}

router.post("/rocky/decision", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  if (!hasGeminiKeys()) {
    res.status(503).json({ error: "No Gemini API key is configured on the server." });
    return;
  }
  const b = isObj(req.body) ? req.body : {};
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > MAX_TEXT_CHARS) {
    res.status(400).json({ error: `That text is too long (max ${MAX_TEXT_CHARS.toLocaleString()} characters).` });
    return;
  }
  const mediaIds = Array.isArray(b.mediaIds) ? b.mediaIds.filter((x): x is string => typeof x === "string") : [];
  if (mediaIds.length > MAX_MEDIA_PER_CHECK) {
    res.status(400).json({ error: `Check up to ${MAX_MEDIA_PER_CHECK} files at a time.` });
    return;
  }
  if (!text && !mediaIds.length) {
    res.status(400).json({ error: "Add some text or a file to check." });
    return;
  }
  const q = cleanQuestions(b.questions);
  if (!q.ok) {
    res.status(400).json({ error: q.error });
    return;
  }

  sweepMedia();
  const files: StoredMedia[] = [];
  for (const id of mediaIds) {
    const m = media.get(id);
    if (!m) {
      res.status(410).json({ error: "A file you added has expired (they're kept for 10 minutes). Please add it again." });
      return;
    }
    files.push(m);
  }

  // Only requests that will really go to Google use up the per-minute allowance (typos don't).
  if (isRateLimited(20, "decision")) {
    res.status(429).json({ error: "Too many checks this minute — try again shortly." });
    return;
  }

  const input: Record<string, unknown>[] = [];
  if (text) input.push({ type: "text", text });
  for (const f of files) input.push(mediaBlock(f));

  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });
  const started = Date.now();
  try {
    const { res: gres, key, exhausted } = await pooledFetch(
      DECISION_MODEL,
      "decisions",
      { model: DECISION_MODEL, input, questions: q.questions },
      { signal: ac.signal },
    );
    const raw = await gres.text();
    if (!gres.ok) throw new GeminiError(gres.status, raw, exhausted);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new GeminiError(502, raw, "Gemini Decision sent back something unreadable. Try again.");
    }
    const answers = normaliseAnswers(json, q.questions);
    const usage = isObj(json) && isObj(json.usage) ? json.usage : {};
    const inputTokens = num(usage.total_input_tokens) ?? num(usage.total_tokens);
    const ms = Date.now() - started;
    logger.info(
      { questions: Object.keys(q.questions).length, files: files.length, fileBytes: files.reduce((n, f) => n + f.data.length, 0), inputTokens, ms, key: key?.label },
      "Decision check done",
    );
    res.json({ model: DECISION_MODEL, answers, usage: { inputTokens, byModality: Array.isArray(usage.input_tokens_by_modality) ? usage.input_tokens_by_modality : [] }, ms });
  } catch (err) {
    if (ac.signal.aborted) return;
    if (err instanceof GeminiError) {
      logger.warn({ status: err.status, body: (err.body || "").slice(0, 600) }, "Decision call failed");
      const e = decisionError(err);
      res.status(e.status).json({ error: e.message });
      return;
    }
    logger.error({ err }, "Decision check failed");
    res.status(500).json({ error: "The check failed unexpectedly. Try again." });
  }
});

// ===========================================================================
// Model check: a small battery of real calls so you can see how a model behaves on YOUR keys
// (reply, Bangla, deep thinking, tool calling, streaming, Google Search) with timings and tokens.
// ===========================================================================
interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "skip";
  ms: number;
  inTokens: number | null;
  outTokens: number | null;
  note: string;
  sample?: string;
}
type TestOutcome = Pick<CheckResult, "status" | "note"> & Partial<Pick<CheckResult, "inTokens" | "outTokens" | "sample">>;

const userTurn = (text: string) => ({ role: "user", parts: [{ text }] });
const partsOf = (j: any): any[] => j?.candidates?.[0]?.content?.parts ?? [];
const answerText = (j: any): string =>
  partsOf(j)
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");

function usageOf(j: any): { inTokens: number | null; outTokens: number | null } {
  const u = j?.usageMetadata ?? {};
  const out = (num(u.candidatesTokenCount) ?? 0) + (num(u.thoughtsTokenCount) ?? 0);
  return { inTokens: num(u.promptTokenCount), outTokens: num(u.candidatesTokenCount) === null && num(u.thoughtsTokenCount) === null ? null : out };
}

function errorNote(model: string, err: unknown): string {
  if (err instanceof GeminiError) {
    const why = geminiReason(err.body || "");
    if (err.status === 400 && why) return `Google refused the request (HTTP 400): ${why.slice(0, 240)}`;
    return `${err.friendly ?? friendlyGeminiError(err.status, err.body || "", model)} (HTTP ${err.status})`;
  }
  const name = (err as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return "No answer within 40 seconds.";
  return err instanceof Error ? err.message.slice(0, 200) : "Unknown error";
}

async function runTest(
  id: string,
  label: string,
  fn: (signal: AbortSignal) => Promise<TestOutcome>,
  model: string,
): Promise<{ result: CheckResult; error?: unknown }> {
  const t0 = Date.now();
  try {
    const r = await fn(AbortSignal.timeout(40_000));
    return { result: { id, label, ms: Date.now() - t0, inTokens: r.inTokens ?? null, outTokens: r.outTokens ?? null, ...r } };
  } catch (error) {
    return { result: { id, label, status: "fail", ms: Date.now() - t0, inTokens: null, outTokens: null, note: errorNote(model, error) }, error };
  }
}

router.post("/rocky/model-check", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const model = isObj(req.body) && typeof req.body.model === "string" ? req.body.model : "";
  if (!(CHAT_MODELS as readonly string[]).includes(model)) {
    res.status(400).json({ error: "Unknown model." });
    return;
  }
  if (!hasGeminiKeys()) {
    res.status(503).json({ error: "No Gemini API key is configured on the server." });
    return;
  }
  if (isRateLimited(4, "model-check")) {
    res.status(429).json({ error: "Model checks are limited — wait a minute and try again." });
    return;
  }

  const tests: CheckResult[] = [];
  const started = Date.now();

  // 1. A plain reply. If Google says the model doesn't exist for these keys, there's no point going on.
  const t1 = await runTest(
    "reply",
    "Quick reply",
    async (signal) => {
      const j = await generateOnce(model, { contents: [userTurn("Reply with exactly one word: PONG")], generationConfig: { maxOutputTokens: 256, thinkingConfig: thinkingOffConfig(model) } }, signal);
      const t = answerText(j).trim();
      return { status: /pong/i.test(t) ? "pass" : "fail", note: /pong/i.test(t) ? "Answered correctly" : `Unexpected answer: "${t.slice(0, 80)}"`, sample: t.slice(0, 80), ...usageOf(j) };
    },
    model,
  );
  tests.push(t1.result);
  if (t1.error instanceof GeminiError && (t1.error.status === 404 || (t1.error.status === 400 && /not found|not supported/i.test(t1.error.body || "")))) {
    res.json({ model, available: false, tests, summary: { passed: 0, failed: 1, skipped: 0, avgMs: t1.result.ms }, totalMs: Date.now() - started });
    return;
  }

  // 2. Bangla
  tests.push(
    (
      await runTest(
        "bangla",
        "Bangla answer",
        async (signal) => {
          const j = await generateOnce(
            model,
            { contents: [userTurn("বাংলায় এক বা দুই বাক্যে বলো: 'Battle Through the Heavens' অ্যানিমেটি কী নিয়ে?")], generationConfig: { maxOutputTokens: 600, thinkingConfig: thinkingOffConfig(model) } },
            signal,
          );
          const t = answerText(j).trim();
          const bn = (t.match(/[ঀ-৿]/g) ?? []).length;
          return { status: bn >= 15 ? "pass" : "fail", note: bn >= 15 ? `${bn} Bangla characters` : `Only ${bn} Bangla characters in the answer`, sample: t.slice(0, 170), ...usageOf(j) };
        },
        model,
      )
    ).result,
  );

  // 3. Deep thinking (the setting that differs between 3.x and 4)
  tests.push(
    (
      await runTest(
        "thinking",
        "Deep thinking",
        async (signal) => {
          const j = await generateOnce(
            model,
            {
              contents: [userTurn("A dubbing studio records 7 episodes a week. Each episode needs 3 takes of 12 minutes. How many minutes of recording is that per week? Reply with just the number.")],
              generationConfig: { maxOutputTokens: 4096, thinkingConfig: thinkingOnConfig(model) },
            },
            signal,
          );
          const t = answerText(j).trim();
          const summaries = partsOf(j).filter((p) => p.thought).length;
          const spent = num(j?.usageMetadata?.thoughtsTokenCount) ?? 0;
          const ok = /\b252\b/.test(t);
          return { status: ok ? "pass" : "fail", note: `${ok ? "Correct (252)" : `Wrong answer: "${t.slice(0, 60)}"`}; ${summaries ? "thought summary returned" : "no thought summary"}; ${spent} thinking tokens`, sample: t.slice(0, 60), ...usageOf(j) };
        },
        model,
      )
    ).result,
  );

  // 4. Tool calling (Jerin's confirm-before-acting actions rely on it)
  tests.push(
    (
      await runTest(
        "tools",
        "Tool calling",
        async (signal) => {
          const j = await generateOnce(
            model,
            {
              contents: [userTurn("Set the title of episode 12 to 'The Fire Lotus Returns' using the tool.")],
              tools: [{ functionDeclarations: [{ name: "set_episode_title", description: "Sets the title of an episode.", parameters: { type: "object", properties: { episode: { type: "integer" }, title: { type: "string" } }, required: ["episode", "title"] } }] }],
              generationConfig: { maxOutputTokens: 512, thinkingConfig: thinkingOffConfig(model) },
            },
            signal,
          );
          const call = partsOf(j).find((p) => p.functionCall)?.functionCall;
          const ok = call?.name === "set_episode_title" && /fire lotus/i.test(String(call?.args?.title ?? ""));
          return { status: ok ? "pass" : "fail", note: ok ? `Called ${call.name}(${JSON.stringify(call.args).slice(0, 90)})` : call ? `Wrong call: ${JSON.stringify(call).slice(0, 120)}` : "Answered in text instead of calling the tool", ...usageOf(j) };
        },
        model,
      )
    ).result,
  );

  // 5. Streaming (how Jerin's replies appear word by word)
  tests.push(
    (
      await runTest(
        "stream",
        "Streaming",
        async (signal) => {
          const body = { contents: [userTurn("Count from 1 to 5, one number per line, nothing else.")], generationConfig: { maxOutputTokens: 256, thinkingConfig: thinkingOffConfig(model) } };
          const t0 = Date.now();
          let chunks = 0;
          let first = 0;
          let text = "";
          let usage: any = null;
          for await (const c of streamGenerate(model, body, signal)) {
            const piece = partsOf(c).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
            if (piece) {
              if (!chunks) first = Date.now() - t0;
              chunks++;
              text += piece;
            }
            if (c?.usageMetadata) usage = c.usageMetadata;
          }
          const ok = chunks >= 1 && /5/.test(text);
          return { status: ok ? "pass" : "fail", note: ok ? `First text after ${first} ms, ${chunks} chunk${chunks === 1 ? "" : "s"}` : `Stream ended with ${chunks} chunks: "${text.slice(0, 60)}"`, ...usageOf({ usageMetadata: usage }) };
        },
        model,
      )
    ).result,
  );

  // 6. Google Search grounding. Often has no free quota, so a refusal is "skipped", not "failed".
  tests.push(
    (
      await runTest(
        "search",
        "Google Search",
        async (signal) => {
          try {
            const j = await generateOnce(
              model,
              { contents: [userTurn("Search the web: what is the latest stable version of Node.js? One short sentence.")], tools: [{ googleSearch: {} }], generationConfig: { maxOutputTokens: 512, thinkingConfig: thinkingOffConfig(model) } },
              signal,
            );
            const sources = j?.candidates?.[0]?.groundingMetadata?.groundingChunks?.length ?? 0;
            const t = answerText(j).trim();
            return sources
              ? { status: "pass", note: `Searched the web, ${sources} source${sources === 1 ? "" : "s"}`, sample: t.slice(0, 120), ...usageOf(j) }
              : { status: "skip", note: "Answered without searching", sample: t.slice(0, 120), ...usageOf(j) };
          } catch (err) {
            if (err instanceof GeminiError && [400, 403, 429].includes(err.status)) {
              // A refused Search call says nothing about the key, so don't leave it resting for normal chat.
              clearUnrecognisedRests(model);
              return { status: "skip", note: `Search isn't available on your keys for this model (free tier or setting): ${errorNote(model, err)}` };
            }
            throw err;
          }
        },
        model,
      )
    ).result,
  );

  const timed = tests.filter((t) => t.status !== "skip");
  const summary = {
    passed: tests.filter((t) => t.status === "pass").length,
    failed: tests.filter((t) => t.status === "fail").length,
    skipped: tests.filter((t) => t.status === "skip").length,
    avgMs: timed.length ? Math.round(timed.reduce((n, t) => n + t.ms, 0) / timed.length) : 0,
  };
  logger.info({ model, ...summary, totalMs: Date.now() - started }, "Model check done");
  res.json({ model, available: true, tests, summary, totalMs: Date.now() - started });
});

export default router;
