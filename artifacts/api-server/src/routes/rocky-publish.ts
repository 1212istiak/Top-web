import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db, episodesTable } from "@workspace/db";

const router: IRouter = Router();

const PUBLORA_BASE = "https://api.publora.com/api/v1";

function publoraHeaders(): Record<string, string> {
  return {
    "x-publora-key": process.env.PUBLORA_API_KEY || "",
    "Content-Type": "application/json",
  };
}

// GET /rocky/publora/connections — list connected social accounts
router.get("/rocky/publora/connections", requireAdmin, async (_req, res): Promise<void> => {
  if (!process.env.PUBLORA_API_KEY) {
    res.status(500).json({ error: "Publora isn't configured yet (missing API key on the server)." });
    return;
  }
  try {
    const r = await fetch(`${PUBLORA_BASE}/platform-connections`, { headers: publoraHeaders() });
    const data = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: "Couldn't reach Publora — check your API key." });
      return;
    }
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Publora connections fetch failed");
    res.status(500).json({ error: "Something went wrong reaching Publora." });
  }
});

// POST /rocky/publish — create the episode on the TVR Dubbers site only.
// Video upload to Publora happens separately, directly from the browser
// (see the three routes below) so large files never pass through this server.
router.post("/rocky/publish", requireAdmin, async (req, res): Promise<void> => {
  const { title, episodeNumber, season, genre, thumbnailUrl, primaryServerUrl, backupServerUrl, isSpecial } = req.body as {
    title?: string;
    episodeNumber?: number;
    season?: number;
    genre?: string;
    thumbnailUrl?: string;
    primaryServerUrl?: string;
    backupServerUrl?: string;
    isSpecial?: boolean;
  };

  if (!title || !episodeNumber || !primaryServerUrl) {
    res.status(400).json({ error: "title, episodeNumber, and primaryServerUrl (embed link) are required." });
    return;
  }

  try {
    const [episode] = await db.insert(episodesTable).values({
      title,
      episodeNumber,
      season: season ?? 1,
      genre: genre ?? null,
      thumbnailUrl: thumbnailUrl ?? null,
      primaryServerUrl,
      backupServerUrl: backupServerUrl ?? null,
      isSpecial: isSpecial ?? false,
    }).returning();
    res.json({ success: true, episodeId: episode.id });
  } catch (err) {
    logger.error({ err }, "Failed to create episode from Jerin publish");
    res.status(500).json({ error: "Couldn't create the episode on your site." });
  }
});

// --- Publora social scheduling: 3-step flow, video uploads directly browser -> Publora ---

// Step 1: create a draft post, get a postGroupId back
router.post("/rocky/publora/create-draft", requireAdmin, async (req, res): Promise<void> => {
  if (!process.env.PUBLORA_API_KEY) {
    res.status(500).json({ error: "Publora isn't configured yet (missing API key on the server)." });
    return;
  }
  const { content, platformIds } = req.body as { content?: string; platformIds?: string[] };
  if (!content || !platformIds?.length) {
    res.status(400).json({ error: "content and platformIds are required." });
    return;
  }
  try {
    const r = await fetch(`${PUBLORA_BASE}/create-post`, {
      method: "POST",
      headers: publoraHeaders(),
      body: JSON.stringify({ content, platforms: platformIds }),
    });
    const data: any = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: data?.error || "Publora create-post failed." });
      return;
    }
    res.json({ postGroupId: data.postGroupId });
  } catch (err) {
    logger.error({ err }, "Publora create-draft failed");
    res.status(500).json({ error: "Something went wrong creating the Publora draft." });
  }
});

// Step 2: get a presigned upload URL — the browser will PUT the video directly to this URL
router.post("/rocky/publora/get-upload-url", requireAdmin, async (req, res): Promise<void> => {
  if (!process.env.PUBLORA_API_KEY) {
    res.status(500).json({ error: "Publora isn't configured yet (missing API key on the server)." });
    return;
  }
  const { postGroupId, fileName, contentType } = req.body as {
    postGroupId?: string;
    fileName?: string;
    contentType?: string;
  };
  if (!postGroupId || !fileName) {
    res.status(400).json({ error: "postGroupId and fileName are required." });
    return;
  }
  try {
    const r = await fetch(`${PUBLORA_BASE}/get-upload-url`, {
      method: "POST",
      headers: publoraHeaders(),
      body: JSON.stringify({ postGroupId, fileName, contentType: contentType || "video/mp4", type: "video" }),
    });
    const data: any = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: data?.error || "Publora get-upload-url failed." });
      return;
    }
    res.json(data); // { uploadUrl, fileUrl, mediaId, ... }
  } catch (err) {
    logger.error({ err }, "Publora get-upload-url failed");
    res.status(500).json({ error: "Something went wrong getting the Publora upload URL." });
  }
});

// Step 3: after the browser has PUT the video directly to the presigned URL, finalize/schedule the post
router.post("/rocky/publora/finalize", requireAdmin, async (req, res): Promise<void> => {
  if (!process.env.PUBLORA_API_KEY) {
    res.status(500).json({ error: "Publora isn't configured yet (missing API key on the server)." });
    return;
  }
  const { postGroupId, scheduledTime } = req.body as { postGroupId?: string; scheduledTime?: string };
  if (!postGroupId) {
    res.status(400).json({ error: "postGroupId is required." });
    return;
  }
  try {
    const r = await fetch(`${PUBLORA_BASE}/update-post/${postGroupId}`, {
      method: "PUT",
      headers: publoraHeaders(),
      body: JSON.stringify({
        status: "scheduled",
        scheduledTime: scheduledTime || new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    const data: any = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: data?.error || "Publora update-post failed." });
      return;
    }
    res.json({ success: true, scheduledTime: scheduledTime || "ASAP" });
  } catch (err) {
    logger.error({ err }, "Publora finalize failed");
    res.status(500).json({ error: "Something went wrong scheduling the Publora post." });
  }
});

export default router;
