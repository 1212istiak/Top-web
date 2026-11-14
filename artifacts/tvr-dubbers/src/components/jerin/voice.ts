import { useSyncExternalStore } from "react";
import { API_BASE, authHeaders } from "./api";

// Jerin's voice. Replies are spoken *while they stream in*: finished sentences are sent to
// ElevenLabs (eleven_v3, the Bangla-capable model) one chunk at a time and played back to back,
// so audio starts after the first sentence instead of after the whole reply.

const MAX_SPOKEN_CHARS = 1400; // protects ElevenLabs credits on very long answers
const FIRST_CHUNK_MIN = 24;
const NEXT_CHUNK_MIN = 150; // v3 sounds steadier on longer chunks

let audioEl: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let activeToken = 0;
let resolveCurrent: (() => void) | null = null;

let owner: string | null = null;
const listeners = new Set<() => void>();
function setOwner(next: string | null) {
  owner = next;
  listeners.forEach((l) => l());
}

/** Which message id is being spoken right now (null when silent). */
export function useSpeakingOwner(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => owner,
    () => null,
  );
}

function getAudio(): HTMLAudioElement {
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

// Call inside a user gesture (send, mic tap) so mobile browsers allow playback later.
export function unlockAudio() {
  const a = getAudio();
  if (a.dataset.unlocked) return;
  a.dataset.unlocked = "1";
  a.src =
    "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAEwUAAAAAAAAAAAAAAAAA";
  a.play().catch(() => {});
}

export function stopVoice() {
  activeToken++;
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute("src");
  }
  resolveCurrent?.();
  resolveCurrent = null;
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  setOwner(null);
}

async function fetchTts(text: string): Promise<Blob | "skip"> {
  const res = await fetch(`${API_BASE}/api/rocky/tts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text }),
  });
  if (res.status === 400) return "skip"; // nothing speakable in this chunk
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  return res.blob();
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise<void>((resolve) => {
    const a = getAudio();
    const url = URL.createObjectURL(blob);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    const done = () => {
      a.onended = null;
      a.onerror = null;
      resolveCurrent = null;
      resolve();
    };
    resolveCurrent = done;
    a.onended = done;
    a.onerror = done;
    a.src = url;
    a.play().catch(done);
  });
}

// Only used if ElevenLabs is unreachable for a chunk.
function speakBrowser(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const bn = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("bn"));
    if (bn) u.voice = bn;
    const done = () => {
      resolveCurrent = null;
      resolve();
    };
    resolveCurrent = done;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  });
}

export class VoiceStreamer {
  private raw = "";
  private spokenIdx = 0;
  private spokenChars = 0;
  private first = true;
  private ended = false;
  private pendingChunks = 0;
  private chain: Promise<void> = Promise.resolve();
  private token: number;

  constructor(ownerId: string) {
    stopVoice();
    this.token = activeToken;
    setOwner(ownerId);
  }

  feed(delta: string) {
    this.raw += delta;
    this.process(false);
  }

  end() {
    this.ended = true;
    this.process(true);
    if (this.pendingChunks === 0 && this.token === activeToken) setOwner(null);
  }

  private process(final: boolean) {
    if (this.token !== activeToken) return;
    // Code is never read aloud; an unfinished fence hides everything after it for now.
    const clean = this.raw.replace(/```[\s\S]*?```/g, " ").replace(/```[\s\S]*$/, "");
    const pending = clean.slice(this.spokenIdx);
    if (!pending.trim()) return;

    let cut = -1;
    if (final) {
      cut = pending.length;
    } else {
      const re = /[।.!?]+(?=\s)|\n+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(pending))) cut = m.index + m[0].length;
    }
    if (cut <= 0) return;
    if (!final && cut < (this.first ? FIRST_CHUNK_MIN : NEXT_CHUNK_MIN)) return;

    let chunk = pending.slice(0, cut).trim();
    this.spokenIdx += cut;
    if (!chunk) return;

    const remaining = MAX_SPOKEN_CHARS - this.spokenChars;
    if (remaining <= 0) return;
    if (chunk.length > remaining) {
      const head = chunk.slice(0, remaining);
      const lastStop = Math.max(head.lastIndexOf("।"), head.lastIndexOf("."), head.lastIndexOf("?"), head.lastIndexOf("!"));
      chunk = lastStop > 40 ? head.slice(0, lastStop + 1) : head;
      this.spokenChars = MAX_SPOKEN_CHARS;
    } else {
      this.spokenChars += chunk.length;
    }
    this.enqueue(chunk);
  }

  private enqueue(chunk: string) {
    const token = this.token;
    this.first = false;
    this.pendingChunks++;
    // Start fetching immediately so the next sentence is ready when the current one ends.
    const audio = fetchTts(chunk).catch(() => "fallback" as const);
    this.chain = this.chain.then(async () => {
      try {
        const r = await audio;
        if (token !== activeToken || r === "skip") return;
        if (r === "fallback") await speakBrowser(chunk);
        else await playBlob(r);
      } finally {
        this.pendingChunks--;
        if (this.ended && this.pendingChunks === 0 && token === activeToken) setOwner(null);
      }
    });
  }
}

/** Replay a finished message from the start. */
export function speakMessage(ownerId: string, text: string) {
  const s = new VoiceStreamer(ownerId);
  s.feed(text);
  s.end();
}
