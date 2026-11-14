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

const MAX_COMMENTS = 400;

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
        `id${e.id} | S${e.season} EP${e.episodeNumber}${e.isSpecial ? " [special]" : ""} | ${e.title} | genre: ${e.genre || "-"} | server1: ${e.primaryServerUrl || "EMPTY"} | server2: ${e.backupServerUrl || "EMPTY"} | thumb: ${e.thumbnailUrl || "-"} | ${e.viewCount} views | reactions: ${(reactionsByEpisode.get(e.id) ?? []).join(",") || "none"} | created ${e.createdAt.toISOString().slice(0, 10)}`,
    );
    const titleById = new Map(episodes.map((e) => [e.id, `S${e.season} EP${e.episodeNumber}`]));
    const commentLines = comments.map(
      (c) =>
        `[${titleById.get(c.episodeId) ?? `ep#${c.episodeId}`}] ${c.nickname} (${c.createdAt.toISOString().slice(0, 10)}): ${c.body.replace(/\s+/g, " ").slice(0, 300)}`,
    );
    const settingLines = settings.map((s) => `${s.key}: ${s.value || "(empty)"}`);
    const t = trailers[0];
    const trailerLine = t
      ? `title: ${t.title || "-"} | genre: ${t.genre || "-"} | server1: ${t.primaryServerUrl || "EMPTY"} | server2: ${t.backupServerUrl || "EMPTY"} | thumb: ${t.thumbnailUrl || "-"}`
      : "none";

    return [
      `=== WEBSITE DATABASE (live, read-only snapshot) ===`,
      `EPISODES (${episodes.length}):`,
      epLines.join("\n") || "(none)",
      ``,
      `TRAILER / UPCOMING EPISODE: ${trailerLine}`,
      ``,
      `VOICE ARTIST ROSTER (${artists.length}): ${artists.map((a) => a.name).join(", ") || "(none)"}`,
      ``,
      `SITE SETTINGS:\n${settingLines.join("\n")}`,
      ``,
      `VISITOR COMMENTS (${comments.length} most recent, newest first):`,
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
