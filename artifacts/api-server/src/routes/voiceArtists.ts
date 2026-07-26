import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, voiceArtistsTable } from "@workspace/db";
import {
  CreateVoiceArtistBody,
  DeleteVoiceArtistParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// GET /voice-artists
router.get("/voice-artists", async (_req, res): Promise<void> => {
  const artists = await db.select().from(voiceArtistsTable).orderBy(voiceArtistsTable.displayOrder);
  res.json(artists);
});

// POST /voice-artists
router.post("/voice-artists", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateVoiceArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [artist] = await db.insert(voiceArtistsTable).values({
    name: parsed.data.name.trim(),
    displayOrder: parsed.data.displayOrder ?? 0,
  }).returning();
  res.status(201).json(artist);
});

// DELETE /voice-artists/:id
router.delete("/voice-artists/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteVoiceArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(voiceArtistsTable).where(eq(voiceArtistsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Voice artist not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
