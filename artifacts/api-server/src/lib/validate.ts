// Extra server-side checks layered on top of the generated Zod schemas (which only say
// "number" / "string"). Used by admin routes and by the AI action endpoints.

const MAX_EMBED_LENGTH = 5000;

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Episode server fields hold either a plain http(s) link or a pasted HTML embed snippet
// (the site's player supports both), so a snippet is allowed but a bare javascript:/data: URL is not.
export function isPlayerSource(v: string): boolean {
  const value = v.trim();
  if (!value || value.length > MAX_EMBED_LENGTH) return false;
  if (/^\s*<\s*(iframe|script|div|embed|object|video)\b/i.test(value)) return true;
  return isHttpUrl(value);
}

export function isWholeNumber(n: unknown, max = 100_000): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
}

export interface EpisodeFields {
  episodeNumber?: unknown;
  season?: unknown;
  thumbnailUrl?: unknown;
  primaryServerUrl?: unknown;
  backupServerUrl?: unknown;
}

// Returns an error message, or null if every supplied field is acceptable.
export function checkEpisodeFields(f: EpisodeFields): string | null {
  if (f.episodeNumber != null && !isWholeNumber(f.episodeNumber)) return "episodeNumber must be a whole number.";
  if (f.season != null && !isWholeNumber(f.season, 1000)) return "season must be a whole number.";
  if (typeof f.thumbnailUrl === "string" && f.thumbnailUrl.trim() && !isHttpUrl(f.thumbnailUrl.trim())) {
    return "thumbnailUrl must be an http(s) link.";
  }
  for (const k of ["primaryServerUrl", "backupServerUrl"] as const) {
    const v = f[k];
    if (typeof v === "string" && v.trim() && !isPlayerSource(v)) {
      return `${k} must be an http(s) link or an embed code.`;
    }
  }
  return null;
}
