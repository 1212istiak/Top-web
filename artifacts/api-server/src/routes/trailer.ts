import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, trailerTable } from "@workspace/db";
import { UpdateTrailerBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function formatTrailer(t: typeof trailerTable.$inferSelect) {
  return {
    id: t.id,
    title: t.title,
    genre: t.genre,
    thumbnailUrl: t.thumbnailUrl,
    primaryServerUrl: t.primaryServerUrl,
    backupServerUrl: t.backupServerUrl,
  };
}

// GET /trailer
router.get("/trailer", async (_req, res): Promise<void> => {
  const [trailer] = await db.select().from(trailerTable).where(eq(trailerTable.id, 1));
  if (!trailer) {
    // Return empty trailer
    res.json({ id: 1, title: null, genre: null, thumbnailUrl: null, primaryServerUrl: null, backupServerUrl: null });
    return;
  }
  res.json(formatTrailer(trailer));
});

// PUT /trailer
router.put("/trailer", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateTrailerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(trailerTable).where(eq(trailerTable.id, 1));
  let trailer;
  if (existing.length > 0) {
    [trailer] = await db.update(trailerTable).set(parsed.data).where(eq(trailerTable.id, 1)).returning();
  } else {
    [trailer] = await db.insert(trailerTable).values({ id: 1, ...parsed.data }).returning();
  }

  res.json(formatTrailer(trailer));
});

export default router;
