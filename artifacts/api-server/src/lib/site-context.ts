import { sql, desc, asc } from "drizzle-orm";
import {
  db,
  episodesTable,
  commentsTable,
  reactionsTable,
  settingsTable,
  trailerTable,
  voiceArtistsTable,
  jerinMemoryTable,
} from "@workspace/db";
import { logger } from "./logger";

// Kept small on purpose: this block is sent with EVERY Jerin message, and the free Gemini tier
// limits tokens per minute. Older comments / full URLs can still be looked up on demand.
const MAX_COMMENTS = 30;
const MAX_URL_CHARS = 80;
const MAX_SETTING_CHARS = 200;

/** One-line, length-capped version of a URL / embed code (embed snippets can be thousands of chars). */
const short = (v: string | null | undefined, max = MAX_URL_CHARS): string => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…(+${t.length - max} chars)` : t;
};

/** Which video platform a server link / embed code points to (cheap to send, and lets Jerin count exactly). */
function platformOf(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  if (!t) return "EMPTY";
  const l = t.toLowerCase();
  if (/youtube\.com|youtu\.be|youtube-nocookie\.com/.test(l)) return "youtube";
  if (/dailymotion\.com|dai\.ly/.test(l)) return "dailymotion";
  if (/rumble\.com/.test(l)) return "rumble";
  if (/drive\.google\.com/.test(l)) return "google-drive";
  if (/cloudinary\.com/.test(l)) return "cloudinary";
  const host = t.match(/https?:\/\/([^/\s"'<>?#]+)/i)?.[1]?.replace(/^www\./i, "");
  return host ? host.toLowerCase() : "other";
}

/** "[youtube, embed-code] <first 80 chars>" or "EMPTY". */
const link = (v: string | null | undefined): string => {
  const p = platformOf(v);
  if (p === "EMPTY") return "EMPTY";
  const embed = /<\s*(iframe|script)/i.test(v ?? "") ? ", embed-code" : "";
  return `[${p}${embed}] ${short(v)}`;
};

const tally = (vals: (string | null | undefined)[]): string => {
  const m = new Map<string, number>();
  for (const v of vals) {
    const p = platformOf(v);
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}: ${n}`).join(", ") || "none";
};

/** Everything in the website database that Jerin should know, as plain text (admin password excluded). */
export async function buildSiteContext(): Promise<string> {
  try {
    const [episodes, comments, reactionRows, settings, trailers, artists] = await Promise.all([
      db.select().from(episodesTable).orderBy(asc(episodesTable.season), asc(episodesTable.episodeNumber)),
      db.select().from(commentsTable).orderBy(desc(commentsTable.createdAt)).limit(MAX_COMMENTS),
      db
        .select({
          episodeId: reactionsTable.episodeId,
          type: reactionsTable.reactionType,
          n: sql<number>`count(*)::int`,
        })
        .from(reactionsTable)
        .groupBy(reactionsTable.episodeId, reactionsTable.reactionType),
      db.select().from(settingsTable),
      db.select().from(trailerTable),
      db.select().from(voiceArtistsTable).orderBy(asc(voiceArtistsTable.displayOrder)),
    ]);

    const reactionsByEpisode = new Map<number, string[]>();
    for (const r of reactionRows) {
      const list = reactionsByEpisode.get(r.episodeId) ?? [];
      list.push(`${r.type}:${r.n}`);
      reactionsByEpisode.set(r.episodeId, list);
    }
    const commentCount = new Map<number, number>();
    for (const c of comments) commentCount.set(c.episodeId, (commentCount.get(c.episodeId) ?? 0) + 1);

    const epLines = episodes.map(
      (e) =>
        `id${e.id} | S${e.season} EP${e.episodeNumber}${e.isSpecial ? " [special]" : ""} | ${e.title} | genre: ${e.genre || "-"} | server1: ${link(e.primaryServerUrl)} | server2: ${link(e.backupServerUrl)} | thumb: ${short(e.thumbnailUrl) || "-"} | ${e.viewCount} views | reactions: ${(reactionsByEpisode.get(e.id) ?? []).join(",") || "none"} | created ${e.createdAt.toISOString().slice(0, 10)}`,
    );
    const titleById = new Map(episodes.map((e) => [e.id, `S${e.season} EP${e.episodeNumber}`]));
    const commentLines = comments.map(
      (c) =>
        `[${titleById.get(c.episodeId) ?? `ep#${c.episodeId}`}] ${c.nickname} (${c.createdAt.toISOString().slice(0, 10)}): ${c.body.replace(/\s+/g, " ").slice(0, 200)}`,
    );
    const settingLines = settings.map((s) => `${s.key}: ${short(s.value, MAX_SETTING_CHARS) || "(empty)"}`);
    const t = trailers[0];
    const trailerLine = t
      ? `title: ${t.title || "-"} | genre: ${t.genre || "-"} | server1: ${link(t.primaryServerUrl)} | server2: ${link(t.backupServerUrl)} | thumb: ${short(t.thumbnailUrl) || "-"}`
      : "none";

    return [
      `=== WEBSITE DATABASE (live, read-only snapshot) ===`,
      `EXACT PLATFORM COUNTS over all ${episodes.length} episodes (use these for "how many" questions; URLs below are shortened):`,
      `  server1 (primary): ${tally(episodes.map((e) => e.primaryServerUrl))}`,
      `  server2 (backup): ${tally(episodes.map((e) => e.backupServerUrl))}`,
      `  both servers combined: ${tally(episodes.flatMap((e) => [e.primaryServerUrl, e.backupServerUrl]))}`,
      ``,
      `EPISODES (${episodes.length}):`,
      epLines.join("\n") || "(none)",
      ``,
      `TRAILER / UPCOMING EPISODE: ${trailerLine}`,
      ``,
      `VOICE ARTIST ROSTER (${artists.length}): ${artists.map((a) => a.name).join(", ") || "(none)"}`,
      ``,
      `SITE SETTINGS:\n${settingLines.join("\n")}`,
      ``,
      `VISITOR COMMENTS (${comments.length} most recent shown, newest first; older ones are not included):`,
      commentLines.join("\n") || "(none)",
    ].join("\n");
  } catch (err) {
    logger.error({ err }, "Could not build site context for Jerin");
    return "=== WEBSITE DATABASE ===\n(could not be loaded this time — tell the user if they ask about site data)";
  }
}

export async function loadMemory() {
  try {
    return await db.select().from(jerinMemoryTable).orderBy(asc(jerinMemoryTable.id));
  } catch (err) {
    logger.error({ err }, "Could not load Jerin memory");
    return [];
  }
}
