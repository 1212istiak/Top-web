import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, episodesTable } from "@workspace/db";
import {
  ListEpisodesQueryParams,
  CreateEpisodeBody,
  UpdateEpisodeBody,
  GetEpisodeParams,
  UpdateEpisodeParams,
  DeleteEpisodeParams,
  IncrementEpisodeViewParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Helper to format episode
function formatEpisode(ep: typeof episodesTable.$inferSelect) {
  return {
    id: ep.id,
    title: ep.title,
    episodeNumber: ep.episodeNumber,
    season: ep.season,
    genre: ep.genre,
    thumbnailUrl: ep.thumbnailUrl,
    primaryServerUrl: ep.primaryServerUrl,
    backupServerUrl: ep.backupServerUrl,
    isSpecial: ep.isSpecial,
    createdAt: ep.createdAt instanceof Date ? ep.createdAt.toISOString() : String(ep.createdAt),
    viewCount: ep.viewCount,
  };
}

// GET /episodes
router.get("/episodes", async (req, res): Promise<void> => {
  const parsed = ListEpisodesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let query = db.select().from(episodesTable).$dynamic();

  if (parsed.data.special === "true") {
    query = query.where(eq(episodesTable.isSpecial, true));
  } else if (parsed.data.special === "false") {
    query = query.where(eq(episodesTable.isSpecial, false));
  }

  const episodes = await query.orderBy(desc(episodesTable.createdAt));

  // Filter by genre in JS (simpler than dynamic SQL)
  const filtered = parsed.data.genre
    ? episodes.filter((e) => e.genre?.toLowerCase() === parsed.data.genre?.toLowerCase())
    : episodes;

  res.json(filtered.map(formatEpisode));
});

// POST /episodes
router.post("/episodes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateEpisodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [episode] = await db.insert(episodesTable).values({
    title: data.title,
    episodeNumber: data.episodeNumber,
    season: data.season ?? 1,
    genre: data.genre,
    thumbnailUrl: data.thumbnailUrl,
    primaryServerUrl: data.primaryServerUrl,
    backupServerUrl: data.backupServerUrl,
    isSpecial: data.isSpecial ?? false,
  }).returning();

  res.status(201).json(formatEpisode(episode));
});

// GET /episodes/stats/summary — must come before /:id
router.get("/episodes/stats/summary", async (_req, res): Promise<void> => {
  const episodes = await db.select().from(episodesTable).orderBy(desc(episodesTable.createdAt));

  const totalEpisodes = episodes.length;
  const totalSpecial = episodes.filter((e) => e.isSpecial).length;
  const totalViews = episodes.reduce((sum, e) => sum + e.viewCount, 0);

  const genreMap: Record<string, number> = {};
  for (const ep of episodes) {
    if (ep.genre) {
      genreMap[ep.genre] = (genreMap[ep.genre] || 0) + 1;
    }
  }
  const genreCounts = Object.entries(genreMap).map(([genre, count]) => ({ genre, count }));
  const recentEpisodes = episodes.slice(0, 6).map(formatEpisode);

  res.json({ totalEpisodes, totalSpecial, totalViews, genreCounts, recentEpisodes });
});

// GET /episodes/:id
router.get("/episodes/:id", async (req, res): Promise<void> => {
  const params = GetEpisodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [episode] = await db.select().from(episodesTable).where(eq(episodesTable.id, params.data.id));
  if (!episode) {
    res.status(404).json({ error: "Episode not found" });
    return;
  }
  res.json(formatEpisode(episode));
});

// PATCH /episodes/:id
router.patch("/episodes/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateEpisodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEpisodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof episodesTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.title !== undefined) updateData.title = d.title;
  if (d.episodeNumber !== undefined) updateData.episodeNumber = d.episodeNumber;
  if (d.season !== undefined) updateData.season = d.season;
  if (d.genre !== undefined) updateData.genre = d.genre;
  if (d.thumbnailUrl !== undefined) updateData.thumbnailUrl = d.thumbnailUrl;
  if (d.primaryServerUrl !== undefined) updateData.primaryServerUrl = d.primaryServerUrl;
  if (d.backupServerUrl !== undefined) updateData.backupServerUrl = d.backupServerUrl;
  if (d.isSpecial !== undefined) updateData.isSpecial = d.isSpecial;

  const [episode] = await db.update(episodesTable).set(updateData).where(eq(episodesTable.id, params.data.id)).returning();
  if (!episode) {
    res.status(404).json({ error: "Episode not found" });
    return;
  }
  res.json(formatEpisode(episode));
});

// DELETE /episodes/:id
router.delete("/episodes/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteEpisodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(episodesTable).where(eq(episodesTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Episode not found" });
    return;
  }
  res.sendStatus(204);
});

// POST /episodes/:id/view
router.post("/episodes/:id/view", async (req, res): Promise<void> => {
  const params = IncrementEpisodeViewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db.update(episodesTable)
    .set({ viewCount: sql`${episodesTable.viewCount} + 1` })
    .where(eq(episodesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Episode not found" });
    return;
  }
  res.json({ viewCount: updated.viewCount });
});

export default router;
