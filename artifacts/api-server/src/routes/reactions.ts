import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, reactionsTable } from "@workspace/db";
import {
  GetReactionsParams,
  AddReactionParams,
  AddReactionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const VALID_REACTIONS = ["👍", "❤️", "👎", "🔥", "😥", "😹", "💀"];

async function getReactionCounts(episodeId: number) {
  const reactions = await db.select().from(reactionsTable).where(eq(reactionsTable.episodeId, episodeId));
  const counts: Record<string, number> = {};
  for (const r of VALID_REACTIONS) counts[r] = 0;
  for (const r of reactions) {
    if (counts[r.reactionType] !== undefined) {
      counts[r.reactionType]++;
    }
  }
  const total = reactions.length;
  return { episodeId, counts, total };
}

// GET /episodes/:id/reactions
router.get("/episodes/:id/reactions", async (req, res): Promise<void> => {
  const params = GetReactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  res.json(await getReactionCounts(params.data.id));
});

// POST /episodes/:id/reactions
router.post("/episodes/:id/reactions", async (req, res): Promise<void> => {
  const params = AddReactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddReactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { reactionType, visitorId } = parsed.data;

  // Upsert: one reaction per visitor per episode
  const existing = await db.select().from(reactionsTable)
    .where(and(eq(reactionsTable.episodeId, params.data.id), eq(reactionsTable.visitorId, visitorId)));

  if (existing.length > 0) {
    await db.update(reactionsTable)
      .set({ reactionType })
      .where(and(eq(reactionsTable.episodeId, params.data.id), eq(reactionsTable.visitorId, visitorId)));
  } else {
    await db.insert(reactionsTable).values({
      episodeId: params.data.id,
      visitorId,
      reactionType,
    });
  }

  res.json(await getReactionCounts(params.data.id));
});

export default router;
