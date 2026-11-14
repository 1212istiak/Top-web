// Shared types + network helpers for Jerin's chat UI.

export const API_BASE: string = import.meta.env.VITE_API_URL || "";

export type AttKind = "image" | "video" | "audio" | "document";

export interface Attachment {
  kind: AttKind;
  name: string;
  mimeType: string;
  fileUri?: string;
  uploadedAt?: number;
  thumb?: string;
  mediaId?: string;
  generated?: boolean;
}

/** Attachment as shown in the UI: may carry a local object-URL preview that is never sent to the server. */
export interface UiAttachment extends Attachment {
  preview?: string;
}

export interface ActionState {
  name: string;
  args: Record<string, any>;
  status: "pending" | "confirmed" | "cancelled" | "failed";
  result?: string;
}

export interface Source {
  title: string;
  uri: string;
}

export interface SessionRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerMessage {
  id: number;
  role: "user" | "model";
  text: string;
  attachments: Attachment[] | null;
  action: ActionState | null;
  sources: Source[] | null;
  thoughts: string | null;
  createdAt: string;
}

export function authHeaders(json = true): Record<string, string> {
  const token = localStorage.getItem("tvr_admin_token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/rocky${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export function kindOf(mime: string): AttKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Sends the file as a raw body (with progress) to the backend, which hands it to the Gemini Files API. */
export function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
  mimeOverride?: string,
): Promise<{ fileUri: string; mimeType: string; uploadedAt: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/rocky/upload`, true);
    const h = authHeaders(false);
    for (const [k, v] of Object.entries(h)) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-File-Mime", mimeOverride || file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.fileUri) resolve(data);
      else reject(new Error(data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });
}

/** Small JPEG preview (~160px) for images and a poster frame for videos, so old chats still show something. */
export async function makeThumb(file: File): Promise<string | undefined> {
  try {
    const url = URL.createObjectURL(file);
    try {
      let source: CanvasImageSource;
      let w: number;
      let h: number;
      if (file.type.startsWith("image/")) {
        const img = new Image();
        img.src = url;
        await img.decode();
        source = img;
        w = img.naturalWidth;
        h = img.naturalHeight;
      } else if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("video"));
        });
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          setTimeout(resolve, 1500);
        });
        source = video;
        w = video.videoWidth;
        h = video.videoHeight;
      } else {
        return undefined;
      }
      if (!w || !h) return undefined;
      const scale = Math.min(1, 160 / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Voice notes: decode whatever the browser recorded and re-encode as 16 kHz mono WAV, which
// Gemini accepts everywhere (WebM/Opus from Chrome is not a guaranteed audio input format).
// ---------------------------------------------------------------------------
export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  await ctx.close();

  const targetRate = 16000;
  const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------
export type StreamEvent =
  | { type: "session"; sessionId: string; userMessageId: number | null; isNew: boolean }
  | { type: "text"; delta: string }
  | { type: "thought"; delta: string }
  | { type: "transcript"; text: string }
  | { type: "tool"; name: string; label: string }
  | { type: "image"; attachment: Attachment }
  | { type: "sources"; sources: Source[] }
  | { type: "notice"; text: string }
  | { type: "done"; messageId: number | null; action: ActionState | null }
  | { type: "error"; message: string };

export interface ChatRequest {
  sessionId: string | null;
  message: string;
  attachments: (Attachment & { inlineData?: string })[];
  model: string;
  thinking: boolean;
  tools: { search: boolean; code: boolean };
  regenerate?: boolean;
}

export async function streamChat(
  body: ChatRequest,
  signal: AbortSignal,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rocky/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Jerin failed to respond (${res.status})`;
    try {
      msg = (await res.json())?.error || msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}
