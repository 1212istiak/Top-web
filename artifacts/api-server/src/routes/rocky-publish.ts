import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db, episodesTable } from "@workspace/db";

const router: IRouter = Router();

const PUBLORA_BASE = "https://api.publora.com/api/v1";

function publoraHeaders(): Record<string, string> {
  const key = process.env.PUBLORA_API_KEY;
  return {
    "x-publora-key": key || "",
    "Content-Type": "application/json",
  };
}

// GET /rocky/publora/connections — list connected social accounts
router.get("/rocky/publora/connections", requireAdmin, async (_req, res): Promise<void> => {
  const key = process.env.PUBLORA_API_KEY;
  if (!key) {
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

// POST /rocky/publish — the full pipeline:
// 1. Create the episode on the TVR Dubbers site
// 2. (optional) Create a draft post on Publora, stream the video from videoFileUrl
//    to Publora's presigned upload, then schedule it across chosen platforms
router.post("/rocky/publish", requireAdmin, async (req, res): Promise<void> => {
  const {
    // Episode fields (site)
    title,
    episodeNumber,
    season,
    genre,
    thumbnailUrl,
    primaryServerUrl, // embed URL (Dailymotion/Rumble/YouTube) — required
    backupServerUrl,
    isSpecial,
    // Publora fields (optional — only if publishing to social too)
    publishToSocial,
    videoFileUrl, // direct downloadable video URL (e.g. Cloudinary) — required if publishToSocial
    socialCaption,
    platformIds, // e.g. ["youtube-xxx", "facebook-xxx", "telegram-xxx"]
    scheduledTime, // ISO 8601 UTC — omit to post ASAP
  } = req.body as {
    title?: string;
    episodeNumber?: number;
    season?: number;
    genre?: string;
    thumbnailUrl?: string;
    primaryServerUrl?: string;
    backupServerUrl?: string;
    isSpecial?: boolean;
    publishToSocial?: boolean;
    videoFileUrl?: string;
    socialCaption?: string;
    platformIds?: string[];
    scheduledTime?: string;
  };

  if (!title || !episodeNumber || !primaryServerUrl) {
    res.status(400).json({ error: "title, episodeNumber, and primaryServerUrl (embed link) are required." });
    return;
  }

  const result: any = { site: null, social: null };

  // --- Step 1: Create the episode on the site ---
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
    result.site = { success: true, episodeId: episode.id };
  } catch (err) {
    logger.error({ err }, "Failed to create episode from Jerin publish");
    res.status(500).json({ error: "Couldn't create the episode on your site.", result });
    return;
  }

  // --- Step 2 (optional): Publish to social via Publora ---
  if (publishToSocial) {
    const key = process.env.PUBLORA_API_KEY;
    if (!key) {
      result.social = { success: false, error: "Publora isn't configured (missing API key on the server)." };
      res.json(result);
      return;
    }
    if (!videoFileUrl || !platformIds?.length) {
      result.social = { success: false, error: "videoFileUrl and platformIds are required to publish to social." };
      res.json(result);
      return;
    }

    try {
      // 2a. Create draft post (no scheduledTime yet — required so media can attach)
      const createRes = await fetch(`${PUBLORA_BASE}/create-post`, {
        method: "POST",
        headers: publoraHeaders(),
        body: JSON.stringify({
          content: socialCaption || title,
          platforms: platformIds,
        }),
      });
      const createData: any = await createRes.json();
      if (!createRes.ok) throw new Error(createData?.error || "create-post failed");
      const postGroupId = createData.postGroupId;

      // 2b. Get a pre-signed upload URL
      const fileName = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`;
      const uploadUrlRes = await fetch(`${PUBLORA_BASE}/get-upload-url`, {
        method: "POST",
        headers: publoraHeaders(),
        body: JSON.stringify({
          postGroupId,
          fileName,
          contentType: "video/mp4",
          type: "video",
        }),
      });
      const uploadUrlData: any = await uploadUrlRes.json();
      if (!uploadUrlRes.ok) throw new Error(uploadUrlData?.error || "get-upload-url failed");
      const { uploadUrl } = uploadUrlData;

      // 2c. Fetch the video from the source (e.g. Cloudinary) and stream it to Publora's S3 URL
      // Streamed server-to-server — never passes through the browser.
      const videoRes = await fetch(videoFileUrl);
      if (!videoRes.ok || !videoRes.body) throw new Error("Couldn't fetch the video from videoFileUrl.");

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        duplex: "half",
        body: videoRes.body,
      } as any);
      if (!putRes.ok) throw new Error(`Video upload to Publora failed (${putRes.status})`);

      // 2d. Schedule (or publish immediately if no scheduledTime given)
      const updateRes = await fetch(`${PUBLORA_BASE}/update-post/${postGroupId}`, {
        method: "PUT",
        headers: publoraHeaders(),
        body: JSON.stringify({
          status: "scheduled",
          scheduledTime: scheduledTime || new Date(Date.now() + 60_000).toISOString(),
        }),
      });
      const updateData: any = await updateRes.json();
      if (!updateRes.ok) throw new Error(updateData?.error || "update-post failed");

      result.social = { success: true, postGroupId, scheduledTime: scheduledTime || "ASAP" };
    } catch (err: any) {
      logger.error({ err }, "Publora publish pipeline failed");
      result.social = { success: false, error: err.message || "Publora publishing failed." };
    }
  }

  res.json(result);
});

export default router;
