// SmartPlayer
//
// Accepts whatever an admin pastes into a "Server URL" field and figures out
// how to play it, so the field isn't locked to one platform's URL shape:
//
//   1. A full HTML embed snippet (an <iframe>, a <div>+<script> widget, a
//      monetized/ad-supported JS embed, etc.) — rendered inside a sandboxed
//      iframe via `srcDoc` so any <script> tags actually execute, including
//      old-style `document.write()` ad embeds that break if injected
//      directly into the page's live DOM.
//   2. A direct video file URL (.mp4/.webm/.ogg/.mov/.m3u8) — played with a
//      native <video> tag.
//   3. A known platform's watch-page or share URL (YouTube, Dailymotion,
//      Rumble, Vimeo, Facebook, Twitch) — normalized into that platform's
//      embeddable iframe URL.
//   4. Anything else — used as-is as an iframe src, which covers embed URLs
//      from platforms not explicitly listed above.

function looksLikeHtmlEmbed(value: string): boolean {
  return /<\s*(iframe|script|div|embed|object)\b/i.test(value);
}

const VIDEO_FILE_EXT = /\.(mp4|webm|ogg|mov|m3u8)(\?.*)?$/i;

function normalizePlainUrl(raw: string): { kind: "video" | "iframe"; src: string } {
  const url = raw.trim();

  // YouTube (watch, shorts, youtu.be, or already /embed/)
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i);
  if (m) return { kind: "iframe", src: `https://www.youtube.com/embed/${m[1]}` };

  // Dailymotion (watch, dai.ly short link, or already /embed/video/)
  m = url.match(/dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/i) || url.match(/dai\.ly\/([a-zA-Z0-9]+)/i);
  if (m) return { kind: "iframe", src: `https://www.dailymotion.com/embed/video/${m[1]}` };

  // Rumble (the id in the watch-page slug is the same id the embed URL uses)
  m = url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/i);
  if (m) return { kind: "iframe", src: `https://rumble.com/embed/${m[1]}/` };
  m = url.match(/rumble\.com\/(v[a-zA-Z0-9]+)-/i);
  if (m) return { kind: "iframe", src: `https://rumble.com/embed/${m[1]}/` };

  // Vimeo
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}` };

  // Facebook video / fb.watch
  if (/facebook\.com\/.+\/videos\//i.test(url) || /fb\.watch\//i.test(url)) {
    return { kind: "iframe", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0` };
  }

  // Twitch VOD
  m = url.match(/twitch\.tv\/videos\/(\d+)/i);
  if (m) {
    const parent = typeof window !== "undefined" ? window.location.hostname : "";
    return { kind: "iframe", src: `https://player.twitch.tv/?video=${m[1]}&parent=${parent}` };
  }

  if (VIDEO_FILE_EXT.test(url)) return { kind: "video", src: url };

  // Fallback: treat it as an already-embeddable URL from any other platform
  return { kind: "iframe", src: url };
}

function buildSandboxDoc(rawHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden;}
iframe,video,embed,object{width:100%;height:100%;border:0;display:block;}
</style></head><body>${rawHtml}</body></html>`;
}

export function SmartPlayer({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;

  // Full embed code (iframe / div+script widget / monetized JS embed).
  // Rendered in a sandboxed iframe with its own document so <script> tags
  // (including document.write-based ad embeds) execute normally.
  if (looksLikeHtmlEmbed(trimmed)) {
    return (
      <iframe
        srcDoc={buildSandboxDoc(trimmed)}
        className={className}
        allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture; monetization; encrypted-media"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
      />
    );
  }

  const normalized = normalizePlainUrl(trimmed);

  if (normalized.kind === "video") {
    return (
      <video controls className={className} src={normalized.src}>
        Your browser does not support the video tag.
      </video>
    );
  }

  return (
    <iframe
      src={normalized.src}
      className={className}
      allowFullScreen
      allow="autoplay; fullscreen; picture-in-picture; monetization; encrypted-media"
    />
  );
}
