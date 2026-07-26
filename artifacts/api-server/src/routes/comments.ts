import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, commentsTable } from "@workspace/db";
import {
  ListCommentsParams,
  CreateCommentParams,
  CreateCommentBody,
  DeleteCommentParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Rate limiting map: IP -> [timestamps]
const commentRateMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const maxComments = 3;
  const timestamps = (commentRateMap.get(ip) || []).filter((t) => now - t < window);
  if (timestamps.length >= maxComments) return true;
  timestamps.push(now);
  commentRateMap.set(ip, timestamps);
  return false;
}

function formatComment(c: typeof commentsTable.$inferSelect) {
  return {
    id: c.id,
    episodeId: c.episodeId,
    nickname: c.nickname,
    body: c.body,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  };
}

// GET /episodes/:id/comments
router.get("/episodes/:id/comments", async (req, res): Promise<void> => {
  const params = ListCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const comments = await db.select().from(commentsTable)
    .where(eq(commentsTable.episodeId, params.data.id))
    .orderBy(desc(commentsTable.createdAt));
  res.json(comments.map(formatComment));
});

// POST /episodes/:id/comments
router.post("/episodes/:id/comments", async (req, res): Promise<void> => {
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many comments. Please wait a minute." });
    return;
  }

  const params = CreateCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Sanitize: strip HTML tags
  const body = parsed.data.body.replace(/<[^>]*>/g, "").trim();
  const nickname = (parsed.data.nickname || "Anonymous").replace(/<[^>]*>/g, "").trim().slice(0, 50) || "Anonymous";

  if (!body) {
    res.status(400).json({ error: "Comment body cannot be empty" });
    return;
  }

  const [comment] = await db.insert(commentsTable).values({
    episodeId: params.data.id,
    nickname,
    body: body.slice(0, 1000),
  }).returning();

  res.status(201).json(formatComment(comment));
});

// DELETE /comments/:id — admin
router.delete("/comments/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(commentsTable).where(eq(commentsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.sendStatus(204);
});

// GET /comments/all — admin
router.get("/comments/all", requireAdmin, async (_req, res): Promise<void> => {
  const comments = await db.select().from(commentsTable).orderBy(desc(commentsTable.createdAt));
  res.json(comments.map(formatComment));
});

export default router;
