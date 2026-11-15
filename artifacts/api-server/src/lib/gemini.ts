const API_ROOT = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  constructor(
    public status: number,
    public body: string,
    /** Ready-to-show message (used when the key pool, not Gemini, produced the failure). */
    public friendly?: string,
  ) {
    super(`Gemini ${status}`);
  }
}

// ---------------------------------------------------------------------------
// API key pool
//
// Keys come from GEMINI_API_KEY (key 1) and GEMINI_API_KEY_2 ... GEMINI_API_KEY_9, tried strictly in
// that order and strictly ONE AT A TIME: a request goes to the first key that is available, and only
// if Gemini rejects it for quota/invalid-key reasons *before producing anything* does the same
// request move to the next key. The same task is never sent to two keys at once.
// A key that ran out of quota rests until its limit is likely back (daily limits reset at midnight
// Pacific) instead of being retried on every message.
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";

export interface KeyInfo {
  id: string;
  label: string;
  key: string;
}

const idCache = new Map<string, string>();
function idOf(key: string): string {
  let id = idCache.get(key);
  if (!id) {
    id = "k" + createHash("sha256").update(key).digest("hex").slice(0, 8);
    idCache.set(key, id);
  }
  return id;
}

export function geminiKeys(): KeyInfo[] {
  const raw: string[] = [process.env.GEMINI_API_KEY ?? ""];
  for (let i = 2; i <= 9; i++) raw.push(process.env[`GEMINI_API_KEY_${i}`] ?? "");
  const out: KeyInfo[] = [];
  const seen = new Set<string>();
  raw.forEach((k, i) => {
    const key = k.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id: idOf(key), label: `Key ${i + 1}`, key });
  });
  return out;
}

export const hasGeminiKeys = (): boolean => geminiKeys().length > 0;

interface Rest {
  until: number;
  reason: string;
  /** Google's own words for the rejection. */
  detail?: string;
}
const resting = new Map<string, Rest>(); // `${keyId}|${model}` -> quota rest (quotas are per model)
const disabled = new Map<string, Rest>(); // keyId -> invalid / suspended key

/** Milliseconds until the next midnight in Pacific time, when Gemini daily quotas reset. */
function msUntilPacificMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) % 24;
  const since = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return 24 * 3600_000 - since + 60_000;
}

/** Decides whether a failed response means "this key is out", and for how long. */
function classifyKeyFailure(status: number, text: string): { ms: number; reason: string; invalid?: boolean } | null {
  if (status === 429) {
    const q = parseQuota(text);
    if (/limit:\s*0\b/.test(text)) return { ms: 6 * 3600_000, reason: "no free allowance (limit 0)" };
    if (q.kind === "day") return { ms: msUntilPacificMidnight(), reason: "daily quota used up" };
    if (q.kind === "minute" || q.kind === "tokens")
      return { ms: Math.min((q.retrySeconds ?? 60) + 1, 120) * 1000, reason: q.kind === "tokens" ? "per-minute token limit" : "per-minute limit" };
    // Unrecognised 429: could be a request-specific limit rather than an empty key, so rest briefly only.
    return { ms: 60_000, reason: "Google refused the request (limit not recognised)" };
  }
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(text)) return { ms: 6 * 3600_000, reason: "invalid key", invalid: true };
  if (status === 403 && !/file/i.test(text) && /PERMISSION_DENIED|API key|leaked|suspend|disabled|denied/i.test(text))
    return { ms: 6 * 3600_000, reason: "key rejected", invalid: true };
  return null;
}

function markFailed(k: KeyInfo, model: string, f: { ms: number; reason: string; invalid?: boolean }, detail?: string) {
  const rest: Rest = { until: Date.now() + f.ms, reason: f.reason, detail };
  if (f.invalid) disabled.set(k.id, rest);
  else resting.set(`${k.id}|${model}`, rest);
  console.warn(`[gemini-keys] ${k.label} resting ${Math.round(f.ms / 1000)}s for ${model}: ${f.reason}`);
}

function restOf(k: KeyInfo, model: string): Rest | null {
  const now = Date.now();
  const d = disabled.get(k.id);
  if (d && d.until > now) return d;
  const r = resting.get(`${k.id}|${model}`);
  if (r && r.until > now) return r;
  return null;
}

/** First key in order that is not resting for this model (optionally limited to certain key ids). */
function pickKey(model: string, allowed?: string[]): KeyInfo | null {
  for (const k of geminiKeys()) {
    if (allowed && !allowed.includes(k.id)) continue;
    if (!restOf(k, model)) return k;
  }
  return null;
}

export function keyPoolStatus() {
  const now = Date.now();
  return geminiKeys().map((k) => {
    const d = disabled.get(k.id);
    const rests = [...resting.entries()].filter(([key, r]) => key.startsWith(k.id + "|") && r.until > now);
    if (d && d.until > now) return { label: k.label, id: k.id, state: "disabled" as const, reason: d.reason, resumesInSec: Math.round((d.until - now) / 1000) };
    if (rests.length)
      return {
        label: k.label,
        id: k.id,
        state: "resting" as const,
        reason: `${rests.map(([key]) => key.split("|")[1]).join(", ")}: ${rests[0][1].reason}`,
        resumesInSec: Math.round((Math.min(...rests.map(([, r]) => r.until)) - now) / 1000),
      };
    return { label: k.label, id: k.id, state: "ready" as const };
  });
}

/** Last 4 characters only, so keys can be matched with AI Studio's list without exposing them. */
const hintOf = (key: string) => "…" + key.slice(-4);

export interface KeyTestResult {
  label: string;
  envName: string;
  hint?: string;
  status: "ok" | "no_quota" | "invalid" | "overloaded" | "error" | "not_set";
  message: string;
}

/** Sends a tiny real request to every key, one after another, and reports what each one can do. */
export async function testKeys(model: string): Promise<KeyTestResult[]> {
  const results: KeyTestResult[] = [];
  const envNames = ["GEMINI_API_KEY", ...Array.from({ length: 8 }, (_, i) => `GEMINI_API_KEY_${i + 2}`)];
  const configured = geminiKeys();
  const byLabel = new Map(configured.map((k) => [k.label, k]));
  for (let i = 0; i < envNames.length; i++) {
    const label = `Key ${i + 1}`;
    const k = byLabel.get(label);
    if (!k) {
      if (i < 6) results.push({ label, envName: envNames[i], status: "not_set", message: "Not set on the server (or it duplicates another key)." });
      continue;
    }
    try {
      const res = await fetch(`${API_ROOT}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": k.key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
          generationConfig: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      if (res.ok) {
        resting.delete(`${k.id}|${model}`);
        disabled.delete(k.id);
        results.push({ label, envName: envNames[i], hint: hintOf(k.key), status: "ok", message: "Working — has quota left." });
        continue;
      }
      const f = classifyKeyFailure(res.status, text);
      if (f) markFailed(k, model, f, geminiReason(text));
      if (f?.invalid) results.push({ label, envName: envNames[i], hint: hintOf(k.key), status: "invalid", message: "Google rejected this key. It is wrong, deleted, or restricted — copy it again." });
      else if (f) results.push({ label, envName: envNames[i], hint: hintOf(k.key), status: "no_quota", message: `Valid, but out of quota right now (${f.reason}).` });
      else if (res.status >= 500) results.push({ label, envName: envNames[i], hint: hintOf(k.key), status: "overloaded", message: `Key accepted, but Google's servers are overloaded for ${model} right now (HTTP ${res.status}). Not a key problem.` });
      else results.push({ label, envName: envNames[i], hint: hintOf(k.key), status: "error", message: `Unexpected reply from Google (HTTP ${res.status}).` });
    } catch {
      results.push({ label, envName: envNames[i], hint: hintOf(k.key), status: "error", message: "Google didn't answer in time (its servers may be slow) — this says nothing about the key itself. Try again." });
    }
  }
  return results;
}

export function keyLabel(id: string): string {
  return geminiKeys().find((k) => k.id === id)?.label ?? "another key";
}

function exhaustedMessage(model: string, allowed?: string[]): string {
  const keys = geminiKeys().filter((k) => !allowed || allowed.includes(k.id));
  const soonest = Math.min(...keys.map((k) => (restOf(k, model)?.until ?? Date.now()) - Date.now()));
  const mins = Math.max(1, Math.ceil(soonest / 60_000));
  const when = mins >= 90 ? `about ${Math.round(mins / 60)} hours` : `about ${mins} min`;
  if (allowed && allowed.length && keys.length < geminiKeys().length)
    return `The API key that holds your attached file (${keys.map((k) => k.label).join(", ")}) is out of quota for ${model}, and files can only be read by the key that received them. It frees up in ${when}, or attach the file again after switching.`;
  if (keys.length <= 1)
    return `The only API key is out of quota for ${model} (back in ${when}). Add more keys on the server as GEMINI_API_KEY_2, GEMINI_API_KEY_3 and so on.`;
  const rests = keys.map((k) => restOf(k, model)).filter((r): r is Rest => !!r);
  const daily = rests.length > 0 && rests.every((r) => /daily|limit 0/i.test(r.reason));
  if (!daily) {
    const said = rests.find((r) => r.detail)?.detail;
    return `Google rejected this request on all ${keys.length} API keys${said ? ` (Google said: "${said}")` : ""}. That usually means the request itself is too big for the free tier — for example a long YouTube video — rather than the keys being empty. Try a shorter clip, or another model in Jerin's settings. The keys are retried automatically in about ${when}.`;
  }
  return `All ${keys.length} API keys have used their daily quota for ${model}. The soonest frees up in ${when} (daily limits reset around 2 PM Dhaka time). Try another model in Jerin's settings meanwhile.`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HEADER_TIMEOUT_MS = 45_000; // Gemini must start answering within this long
const STALL_TIMEOUT_MS = 60_000; // ...and must not go silent for this long mid-answer

const slowMessage = (s: number) =>
  `Gemini didn't respond within ${s} seconds — Google's servers look slow or overloaded right now. Try again in a moment, or switch to another model in Jerin's settings.`;

export interface PoolOptions {
  signal?: AbortSignal;
  /** Only these keys may be used (e.g. the key that owns an uploaded file). */
  allowedKeyIds?: string[];
  /** Called when a request moves from one key to the next. */
  onSwitch?: (from: string, to: string, reason: string) => void;
}

export interface PooledResult {
  res: Response;
  key: KeyInfo | null;
  /** Set when no key could serve the request; res is then a synthetic 429. */
  exhausted?: string;
}

/**
 * POSTs to a Gemini endpoint using the first available key, moving on to the next key (one at a
 * time) when Gemini rejects the request for quota or key reasons. `body` may be a function of the
 * key id so per-key content (uploaded-file references) can be rebuilt for whichever key serves it.
 */
export async function pooledFetch(
  model: string,
  path: string,
  body: unknown | ((keyId: string) => unknown),
  opts: PoolOptions = {},
): Promise<PooledResult> {
  let waited = false;
  let last: { res: Response; key: KeyInfo } | null = null;
  let previous: KeyInfo | null = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const key = pickKey(model, opts.allowedKeyIds);
    if (!key) {
      // Everything is resting. If a key frees up within seconds (per-minute limit), wait for it once.
      const candidates = geminiKeys().filter((k) => !opts.allowedKeyIds || opts.allowedKeyIds.includes(k.id));
      const soonest = Math.min(...candidates.map((k) => (restOf(k, model)?.until ?? Infinity) - Date.now()));
      if (candidates.length && !waited && soonest <= 45_000 && !opts.signal?.aborted) {
        waited = true;
        await sleep(Math.max(500, soonest + 250));
        continue;
      }
      const msg = candidates.length ? exhaustedMessage(model, opts.allowedKeyIds) : "No Gemini API key is configured on the server (set GEMINI_API_KEY).";
      const text = JSON.stringify({ error: { code: 429, message: msg } });
      return { res: new Response(text, { status: 429, headers: { "content-type": "application/json" } }), key: null, exhausted: msg };
    }

    if (previous && previous.id !== key.id) opts.onSwitch?.(previous.label, key.label, "quota");
    const payload = typeof body === "function" ? (body as (id: string) => unknown)(key.id) : body;
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, HEADER_TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let res: Response;
    try {
      res = await fetch(`${API_ROOT}/v1beta/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key.key },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
    } catch (err) {
      if (timedOut && !opts.signal?.aborted) throw new GeminiError(504, "", slowMessage(HEADER_TIMEOUT_MS / 1000));
      throw err;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
    if (res.ok) return { res, key };

    const text = await res.clone().text().catch(() => "");
    const failure = classifyKeyFailure(res.status, text);
    if (!failure) return { res, key };
    markFailed(key, model, failure, geminiReason(text));
    last = { res, key };
    previous = key;
  }
  return { res: last!.res, key: last!.key };
}

export interface QuotaInfo {
  /** Which free-tier limit was hit. */
  kind: "day" | "tokens" | "minute" | "unknown";
  /** Seconds Gemini asked us to wait, if it said. */
  retrySeconds: number | null;
}

/** Reads Gemini's 429 body to learn *which* limit was hit and how long to wait. */
export function parseQuota(body: string): QuotaInfo {
  let retrySeconds: number | null = null;
  let ids = "";
  try {
    const details: any[] = JSON.parse(body)?.error?.details ?? [];
    for (const d of details) {
      if (typeof d?.retryDelay === "string") retrySeconds = Math.ceil(parseFloat(d.retryDelay));
      for (const v of d?.violations ?? []) ids += ` ${v?.quotaId ?? ""} ${v?.quotaMetric ?? ""}`;
    }
  } catch {
    /* body is not JSON */
  }
  if (retrySeconds === null) {
    const m = body.match(/retry in ([\d.]+)s/i);
    if (m) retrySeconds = Math.ceil(parseFloat(m[1]));
  }
  const hay = `${ids} ${body}`;
  let kind: QuotaInfo["kind"] = "unknown";
  if (/PerDay/i.test(hay)) kind = "day";
  else if (/token/i.test(ids) && /PerMinute/i.test(ids)) kind = "tokens";
  else if (/PerMinute/i.test(hay)) kind = "minute";
  return { kind, retrySeconds };
}

/** Google's own human-readable reason from an error body, shortened. */
export function geminiReason(body: string): string {
  try {
    const msg = JSON.parse(body)?.error?.message;
    if (typeof msg === "string") return msg.replace(/\s+/g, " ").slice(0, 260);
  } catch {
    /* not JSON */
  }
  return body.replace(/\s+/g, " ").slice(0, 200);
}

export function friendlyGeminiError(status: number, text: string, model: string): string {
  if (status === 429) {
    const q = parseQuota(text);
    const wait = q.retrySeconds ? ` Try again in about ${q.retrySeconds} seconds.` : "";
    if (/limit:\s*0\b/.test(text))
      return `Google reports a free-tier limit of 0 for ${model} on this request, meaning your key has no free allowance for it (or the daily allowance is fully spent). Try a different model in Jerin's settings, or enable billing on the key.`;
    if (q.kind === "day")
      return `The free daily quota for ${model} is used up. It resets at midnight Pacific time (about 2 PM in Dhaka). Switch to another Gemini model in Jerin's settings to keep going now.`;
    if (q.kind === "tokens")
      return `That request is bigger than the free per-minute token limit (videos cost thousands of tokens per minute of footage).${wait || " Wait a minute, or send a shorter clip."}`;
    if (q.kind === "minute") return `Too many requests for this minute on the free tier.${wait || " Wait a moment and try again."}`;
    const why = geminiReason(text);
    return `Gemini says the quota for ${model} is exhausted right now.${wait}${why ? ` Google's message: "${why}"` : ""}`;
  }
  if (status === 404) return `Model ${model} isn't available on your key — pick a different model in Jerin's settings.`;
  if (status === 503) return "Gemini is overloaded right now — try again in a moment.";
  if (status === 400) return "Gemini rejected that request (a file may be unsupported or too large). Try again without the attachment.";
  if (status === 403) return "Gemini refused the request — check that the API key is valid and allowed to use this model.";
  return "Jerin's brain (Gemini) returned an error.";
}

/** Streams a generateContent call, yielding each parsed SSE chunk as it arrives. */
export async function* streamGenerate(
  model: string,
  body: unknown | ((keyId: string) => unknown),
  signal?: AbortSignal,
  opts: Omit<PoolOptions, "signal"> = {},
): AsyncGenerator<any> {
  const { res, exhausted } = await pooledFetch(model, `models/${model}:streamGenerateContent?alt=sse`, body, { ...opts, signal });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new GeminiError(res.status, text, exhausted);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let stall: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([
      reader.read(),
      new Promise<"stalled">((resolve) => {
        stall = setTimeout(() => resolve("stalled"), STALL_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(stall));
    if (next === "stalled") {
      reader.cancel().catch(() => {});
      throw new GeminiError(504, "", slowMessage(STALL_TIMEOUT_MS / 1000));
    }
    const { done, value } = next;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        yield JSON.parse(json);
      } catch {
        /* partial / keep-alive line */
      }
    }
  }
}

/** Plain (non-streaming) generateContent call. */
export async function generateOnce(
  model: string,
  body: unknown | ((keyId: string) => unknown),
  signal?: AbortSignal,
  opts: Omit<PoolOptions, "signal"> = {},
): Promise<any> {
  const { res, exhausted } = await pooledFetch(model, `models/${model}:generateContent`, body, { ...opts, signal });
  const text = await res.text();
  if (!res.ok) throw new GeminiError(res.status, text, exhausted);
  return JSON.parse(text);
}

export interface UploadedFile {
  name: string;
  uri: string;
  mimeType: string;
  /** The key (project) that now owns this file. Only that key can read it later. */
  keyId: string;
}

async function uploadWithKey(k: KeyInfo, buf: Buffer, mimeType: string, displayName: string): Promise<UploadedFile> {
  const start = await fetch(`${API_ROOT}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": k.key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buf.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });
  if (!start.ok) throw new GeminiError(start.status, await start.text().catch(() => ""));
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new GeminiError(502, "Gemini did not return an upload URL");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: buf as any,
  });
  const upText = await up.text();
  if (!up.ok) throw new GeminiError(up.status, upText);
  let file = JSON.parse(upText).file;

  // Video/audio go through a PROCESSING state before they can be used in a prompt.
  for (let i = 0; i < 80 && file?.state === "PROCESSING"; i++) {
    await sleep(1500);
    const poll = await fetch(`${API_ROOT}/v1beta/${file.name}`, { headers: { "x-goog-api-key": k.key } });
    if (!poll.ok) throw new GeminiError(poll.status, await poll.text().catch(() => ""));
    file = await poll.json();
  }
  if (!file || file.state === "FAILED") throw new GeminiError(422, "Gemini could not process that file.");
  if (file.state === "PROCESSING") throw new GeminiError(504, "Gemini is still processing that file — try again shortly.");
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType, keyId: k.id };
}

/**
 * Uploads bytes to the Gemini Files API using the first available key (moving on if a key is out of
 * quota). The file belongs to that key's project, which is reported back in keyId.
 */
export async function uploadToGeminiFiles(buf: Buffer, mimeType: string, displayName: string): Promise<UploadedFile> {
  let lastErr: unknown = new GeminiError(500, "No Gemini API key is configured on the server (set GEMINI_API_KEY).");
  for (const k of geminiKeys()) {
    if (restOf(k, "files")) continue;
    try {
      return await uploadWithKey(k, buf, mimeType, displayName);
    } catch (err) {
      lastErr = err;
      if (err instanceof GeminiError) {
        const f = classifyKeyFailure(err.status, err.body);
        if (f) {
          markFailed(k, "files", f);
          continue;
        }
      }
      throw err;
    }
  }
  if (lastErr instanceof GeminiError && !lastErr.friendly && geminiKeys().length > 1)
    lastErr.friendly = "Every API key is out of quota for file uploads right now. Try again later.";
  throw lastErr;
}
