const API_ROOT = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Gemini ${status}`);
  }
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(500, "GEMINI_API_KEY missing");
  return key;
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

export function friendlyGeminiError(status: number, text: string, model: string): string {
  if (status === 429) {
    const q = parseQuota(text);
    const wait = q.retrySeconds ? ` Try again in about ${q.retrySeconds} seconds.` : "";
    if (q.kind === "day")
      return `The free daily quota for ${model} is used up. It resets at midnight Pacific time (about 2 PM in Dhaka). Switch to another Gemini model in Jerin's settings to keep going now.`;
    if (q.kind === "tokens")
      return `That request is bigger than the free per-minute token limit (videos cost thousands of tokens per minute of footage).${wait || " Wait a minute, or send a shorter clip."}`;
    if (q.kind === "minute") return `Too many requests for this minute on the free tier.${wait || " Wait a moment and try again."}`;
    return `Gemini says the free-tier quota for ${model} is exhausted right now.${wait}`;
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
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<any> {
  const res = await fetch(`${API_ROOT}/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new GeminiError(res.status, await res.text().catch(() => ""));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
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
export async function generateOnce(model: string, body: unknown, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${API_ROOT}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw new GeminiError(res.status, text);
  return JSON.parse(text);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UploadedFile {
  name: string;
  uri: string;
  mimeType: string;
}

/** Uploads bytes to the Gemini Files API (resumable protocol) and waits until the file is usable. */
export async function uploadToGeminiFiles(buf: Buffer, mimeType: string, displayName: string): Promise<UploadedFile> {
  const key = apiKey();
  const start = await fetch(`${API_ROOT}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
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
    const poll = await fetch(`${API_ROOT}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key } });
    if (!poll.ok) throw new GeminiError(poll.status, await poll.text().catch(() => ""));
    file = await poll.json();
  }
  if (!file || file.state === "FAILED") throw new GeminiError(422, "Gemini could not process that file.");
  if (file.state === "PROCESSING") throw new GeminiError(504, "Gemini is still processing that file — try again shortly.");
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType };
}
