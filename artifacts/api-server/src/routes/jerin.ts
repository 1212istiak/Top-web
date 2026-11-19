import { randomUUID } from "node:crypto";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import {
  db,
  jerinSessionsTable,
  jerinMessagesTable,
  jerinMemoryTable,
  jerinMediaTable,
  type JerinAttachment,
  type JerinAction,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { isRateLimited } from "../lib/rate-limit";
import { buildSiteContext, loadMemory } from "../lib/site-context";
import {
  GeminiError,
  friendlyGeminiError,
  geminiKeys,
  hasGeminiKeys,
  keyLabel,
  keyPoolStatus,
  testKeys,
  generateOnce,
  streamGenerate,
  uploadToGeminiFiles,
  clearUnrecognisedRests,
} from "../lib/gemini";

const router: IRouter = Router();

const ALLOWED_MODELS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"];
const DEFAULT_MODEL = "gemini-3.8-flash";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const FILE_TTL_MS = 47 * 60 * 60 * 1000; // Gemini Files API keeps uploads for 48h
const HISTORY_LIMIT = 80;
const MAX_UPLOAD = 100 * 1024 * 1024;
const MAX_TOOL_ROUNDS = 5;

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------
// Site actions never run on their own: the client shows a Confirm card first.
const SITE_ACTIONS = new Set(["create_episode", "update_episode", "schedule_social_post"]);
// Harmless helpers Jerin can run by herself mid-reply.
const AUTO_TOOLS = new Set(["generate_image", "remember", "forget_memory", "search_past_chats"]);

const FUNCTION_DECLARATIONS = [
  {
    name: "create_episode",
    description: "Create and publish a new episode on the TVR Dubbers website. The user sees a confirm card first.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Episode title" },
        episodeNumber: { type: "number", description: "Episode number" },
        season: { type: "number", description: "Season number, defaults to 1" },
        genre: { type: "string", description: "Genre/category" },
        thumbnailUrl: { type: "string", description: "Thumbnail image URL, optional" },
        primaryServerUrl: { type: "string", description: "Embed URL for the video player (Dailymotion/Rumble/YouTube)" },
        backupServerUrl: { type: "string", description: "Backup embed URL, optional" },
        isSpecial: { type: "boolean", description: "Whether this is a special episode" },
      },
      required: ["title", "episodeNumber", "primaryServerUrl"],
    },
  },
  {
    name: "update_episode",
    description:
      "Edit an existing episode on the website. Only include fields that should change. The user sees a confirm card first.",
    parameters: {
      type: "object",
      properties: {
        episodeNumber: { type: "number", description: "Number of the episode to edit" },
        season: { type: "number", description: "Season of that episode" },
        isSpecial: { type: "boolean", description: "True if the episode to edit is a special episode" },
        primaryServerUrl: { type: "string", description: "New Server 1 URL (replaces the current one)" },
        backupServerUrl: { type: "string", description: "New Server 2 URL (replaces the current one)" },
        title: { type: "string", description: "New title, optional" },
        genre: { type: "string", description: "New genre, optional" },
        thumbnailUrl: { type: "string", description: "New thumbnail URL, optional" },
      },
      required: ["episodeNumber"],
    },
  },
  {
    name: "schedule_social_post",
    description:
      "Draft and schedule a text-only social post across connected Publora platforms. Cannot attach video — for video posts tell the user to use the Publish tab. The user sees a confirm card first.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The post caption/content" },
        platformIds: { type: "array", items: { type: "string" }, description: "Publora platform IDs to post to" },
        scheduledTime: { type: "string", description: "ISO 8601 datetime to schedule for, omit for ASAP" },
      },
      required: ["content", "platformIds"],
    },
  },
  {
    name: "generate_image",
    description:
      "Create a brand-new image from a description, or edit/restyle an image the user shared earlier in this chat (set editExisting true). The result is shown to the user in the chat. Use it for thumbnails, posters, character art, edits like 'change the background' or 'make it look like a poster'.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed description of the image to create, or the edit to apply" },
        editExisting: {
          type: "boolean",
          description: "True to edit the most recent image in this conversation instead of creating a new one",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "remember",
    description:
      "Save a durable fact to Jerin's long-term memory (preferences, decisions, recurring details about Rocky, the channel or the project). Do not save passwords or secrets.",
    parameters: {
      type: "object",
      properties: { fact: { type: "string", description: "The fact to remember, one short sentence" } },
      required: ["fact"],
    },
  },
  {
    name: "forget_memory",
    description: "Delete one entry from long-term memory by its id (ids are listed in the memory section).",
    parameters: {
      type: "object",
      properties: { id: { type: "number", description: "Memory entry id" } },
      required: ["id"],
    },
  },
  {
    name: "search_past_chats",
    description: "Search the user's earlier Jerin chat sessions for a keyword or phrase and get matching snippets.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Word or phrase to look for" } },
      required: ["query"],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const PERSONA = `You are Jerin, the AI copilot of TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky (Istiak). You live in the admin panel of the TVR Dubbers website and work like a combination of Gemini and Google AI Studio: you can reason, search the web, run code, read links, and understand images, video, audio and documents the user attaches.

LANGUAGE
- Reply in the language the user writes or speaks. Rocky mixes Bangla and English freely, so you may mix them naturally too.
- Write Bangla in Bangla script (not romanized), keep English names and technical terms (BTTH, episode, thumbnail, YouTube) in English. Do not transliterate a single word into the other script mid-sentence. Match Banglish only if the user writes in it.
- Your replies may be read aloud by a Bangla-capable voice, so write numbers and punctuation the way a person would say them, and use the Bangla danda (।) to end Bangla sentences.

STYLE
- Be direct, warm and confident. Be concise for simple questions and thorough when depth is needed. Give honest assessments, not flattery.
- Use Markdown when it helps (short lists, tables, code blocks). Avoid walls of text.

WHAT YOU CAN DO
- You can WATCH public YouTube videos when the user pastes a link (you receive the video itself, audio and picture), so you can write transcripts, dubbing scripts and translations from it. For long videos, work through the whole thing and be upfront about the time it needs.
- Answer anything, analyse attachments (images, video, audio, PDFs, text files), search the web and read URLs when those tools are available, and run Python for calculations or data work.
- Create or edit images with the generate_image function. If it fails (for example the Gemini key has no image quota), say so plainly and instead give a precise written design brief.
- You CANNOT render or edit video files. For video, analyse it and give a concrete edit plan (timestamps, cuts, captions, pacing) the user can apply in their editor. Be upfront about this when asked to "edit" a video.
- Read the whole website database below and answer from it. Call create_episode, update_episode or schedule_social_post to change the site: the user always gets a Confirm card first, and nothing happens until they tap it. Only call these with real values; ask for missing details in plain text rather than guessing. If it's ambiguous which season or which server slot is meant, ask first. When told to put a URL into the empty server slot, use whichever slot is EMPTY.
- Use remember to store durable facts and preferences (never secrets), forget_memory to remove one, and search_past_chats to look through earlier conversations.
- If you are not sure of a character's name in a BTTH video or image, say so ("possibly Xiao Yan") instead of stating it as fact.`;

function dhakaNow(): string {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "full", timeStyle: "short" }) + " (Asia/Dhaka)";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Part = Record<string, any>;
interface Content {
  role: "user" | "model";
  parts: Part[];
}

function isFresh(a: JerinAttachment): boolean {
  return !!a.fileUri && !!a.uploadedAt && Date.now() - a.uploadedAt < FILE_TTL_MS;
}

// Uploaded files belong to the API key (Google project) that received them; other keys can't read
// them. Files from before key rotation existed have no keyId and belong to the first key.
const ownerOf = (a: JerinAttachment): string | undefined => a.keyId ?? geminiKeys()[0]?.id;
const usableBy = (a: JerinAttachment, keyId?: string): boolean => isFresh(a) && (!keyId || ownerOf(a) === keyId);

function attachmentParts(atts: JerinAttachment[] | null | undefined, keyId?: string, includeFiles = true): Part[] {
  const parts: Part[] = [];
  for (const a of atts ?? []) {
    if (usableBy(a, keyId)) {
      // Re-sending an old video/image on every turn burns the free token quota, so earlier-turn files
      // are replaced by a note; only the file(s) in the message being answered are actually sent.
      if (includeFiles) parts.push({ fileData: { mimeType: a.mimeType, fileUri: a.fileUri } });
      else parts.push({ text: `[earlier in this chat the user attached a ${a.kind} "${a.name}" — not re-sent to save quota; ask them to attach it again if you need to look at it]` });
    } else if (a.kind === "audio" && !a.fileUri) continue; // voice note: its transcript is the message text
    else if (a.generated) parts.push({ text: `[an image Jerin generated earlier: ${a.name}]` });
    else if (isFresh(a)) parts.push({ text: `[attached ${a.kind} "${a.name}" is stored on a different API key, so it can't be viewed in this reply]` });
    else parts.push({ text: `[attached ${a.kind} "${a.name}" — no longer available to view]` });
  }
  return parts;
}

function pushContent(contents: Content[], role: "user" | "model", parts: Part[]) {
  if (!parts.length) return;
  const last = contents[contents.length - 1];
  if (last && last.role === role) last.parts.push(...parts);
  else contents.push({ role, parts });
}

function messageToContent(m: typeof jerinMessagesTable.$inferSelect, keyId?: string, includeFiles = true): Content {
  if (m.role === "user") {
    const parts = [...attachmentParts(m.attachments, keyId, includeFiles), ...(m.text ? [{ text: m.text }] : [])];
    return { role: "user", parts: parts.length ? parts : [{ text: "(empty message)" }] };
  }
  let text = m.text || "";
  if (m.action) {
    const a = m.action;
    text += `\n[Proposed action ${a.name} ${JSON.stringify(a.args)} — ${a.status}${a.result ? `: ${a.result}` : ""}]`;
  }
  if (m.attachments?.some((a) => a.generated)) text += "\n[Jerin generated an image here]";
  return { role: "model", parts: [{ text: text.trim() || "(no text)" }] };
}

function cleanTitle(raw: string): string {
  return raw.replace(/^["'“”\s]+|["'“”\s.]+$/g, "").replace(/\s+/g, " ").slice(0, 60) || "New chat";
}

function sse(res: Response, data: Record<string, unknown>) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
// Which API keys are loaded and which are resting (never exposes key material).
router.get("/rocky/keys", requireAdmin, (_req, res): void => {
  res.json({ keys: keyPoolStatus() });
});

// Sends one tiny request to each key (sequentially) to prove it is valid and has quota.
router.post("/rocky/keys/test", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const model = ALLOWED_MODELS.includes(req.body?.model ?? "") ? (req.body.model as string) : DEFAULT_MODEL;
  res.json({ model, results: await testKeys(model) });
});

router.get("/rocky/sessions", requireAdmin, async (req, res): Promise<void> => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    let rows;
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      rows = await db
        .select()
        .from(jerinSessionsTable)
        .where(
          or(
            ilike(jerinSessionsTable.title, pattern),
            sql`exists (select 1 from jerin_messages m where m.session_id = ${jerinSessionsTable.id} and m.text ilike ${pattern})`,
          ),
        )
        .orderBy(desc(jerinSessionsTable.updatedAt))
        .limit(100);
    } else {
      rows = await db.select().from(jerinSessionsTable).orderBy(desc(jerinSessionsTable.updatedAt)).limit(100);
    }
    res.json({ sessions: rows });
  } catch (err) {
    logger.error({ err }, "List Jerin sessions failed");
    res.status(500).json({ error: "Couldn't load your chats." });
  }
});

router.post("/rocky/chat/stop", requireAdmin, (req, res): void => {
  const id = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  const ac = id ? runs.get(id) : undefined;
  if (ac) ac.abort();
  res.json({ stopped: !!ac });
});

router.get("/rocky/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = String(req.params.id);
    const [session] = await db.select().from(jerinSessionsTable).where(eq(jerinSessionsTable.id, id));
    if (!session) {
      res.status(404).json({ error: "Chat not found." });
      return;
    }
    const messages = await db
      .select()
      .from(jerinMessagesTable)
      .where(eq(jerinMessagesTable.sessionId, id))
      .orderBy(asc(jerinMessagesTable.id));
    res.json({ session, messages, running: runs.has(id) });
  } catch (err) {
    logger.error({ err }, "Load Jerin session failed");
    res.status(500).json({ error: "Couldn't load that chat." });
  }
});

router.patch("/rocky/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const title = typeof req.body?.title === "string" ? cleanTitle(req.body.title) : "";
  if (!title) {
    res.status(400).json({ error: "title is required." });
    return;
  }
  try {
    await db.update(jerinSessionsTable).set({ title }).where(eq(jerinSessionsTable.id, String(req.params.id)));
    res.json({ success: true, title });
  } catch (err) {
    logger.error({ err }, "Rename Jerin session failed");
    res.status(500).json({ error: "Couldn't rename that chat." });
  }
});

router.delete("/rocky/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  try {
    await db.delete(jerinMessagesTable).where(eq(jerinMessagesTable.sessionId, id));
    await db.delete(jerinMediaTable).where(eq(jerinMediaTable.sessionId, id));
    await db.delete(jerinSessionsTable).where(eq(jerinSessionsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Delete Jerin session failed");
    res.status(500).json({ error: "Couldn't delete that chat." });
  }
});

// Persist the outcome of a Confirm/Cancel tap so it survives a reload.
router.patch("/rocky/messages/:id/action", requireAdmin, async (req, res): Promise<void> => {
  const { status, result } = req.body as { status?: JerinAction["status"]; result?: string };
  if (!status || !["pending", "confirmed", "cancelled", "failed"].includes(status)) {
    res.status(400).json({ error: "valid status is required." });
    return;
  }
  try {
    const id = Number(req.params.id);
    const [msg] = await db.select().from(jerinMessagesTable).where(eq(jerinMessagesTable.id, id));
    if (!msg?.action) {
      res.status(404).json({ error: "Action not found." });
      return;
    }
    await db
      .update(jerinMessagesTable)
      .set({ action: { ...msg.action, status, result: typeof result === "string" ? result.slice(0, 2000) : msg.action.result } })
      .where(eq(jerinMessagesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Update action status failed");
    res.status(500).json({ error: "Couldn't save the action result." });
  }
});

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------
router.get("/rocky/memory", requireAdmin, async (_req, res): Promise<void> => {
  res.json({ memory: await loadMemory() });
});

router.delete("/rocky/memory/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    await db.delete(jerinMemoryTable).where(eq(jerinMemoryTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Delete memory failed");
    res.status(500).json({ error: "Couldn't delete that memory." });
  }
});

// ---------------------------------------------------------------------------
// Generated media + uploads
// ---------------------------------------------------------------------------
router.get("/rocky/media/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [row] = await db.select().from(jerinMediaTable).where(eq(jerinMediaTable.id, String(req.params.id)));
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.set({ "Content-Type": row.mimeType, "Cache-Control": "private, max-age=86400" });
    res.send(row.data);
  } catch (err) {
    logger.error({ err }, "Serve media failed");
    res.status(500).json({ error: "Couldn't load that image." });
  }
});

// Raw binary upload (images, video, audio, PDFs, text). Forwarded to the Gemini Files API so the
// file can be reused across the next ~48h of the conversation. Browser sends the file body as-is.
router.post(
  "/rocky/upload",
  requireAdmin,
  express.raw({ type: () => true, limit: MAX_UPLOAD }),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Empty upload." });
      return;
    }
    if (isRateLimited(30, "upload")) {
      res.status(429).json({ error: "Too many requests this minute — try again shortly." });
      return;
    }
    const mimeType = String(req.headers["x-file-mime"] || "application/octet-stream");
    let name = "file";
    try {
      name = decodeURIComponent(String(req.headers["x-file-name"] || "file"));
    } catch {
      /* keep default */
    }
    try {
      const file = await uploadToGeminiFiles(body, mimeType, name);
      res.json({ fileUri: file.uri, mimeType: file.mimeType, name, uploadedAt: Date.now(), keyId: file.keyId });
    } catch (err) {
      logger.error({ err }, "Gemini file upload failed");
      if (err instanceof GeminiError) {
        res.status(502).json({ error: err.status === 422 || err.status === 504 ? (err.body || "Gemini couldn't process that file.") : (err.friendly ?? friendlyGeminiError(err.status, err.body, "files")) });
      } else {
        res.status(500).json({ error: "Upload failed." });
      }
    }
  },
);

// ---------------------------------------------------------------------------
// Auto tools (run server-side during a reply)
// ---------------------------------------------------------------------------
async function findLatestImagePart(
  sessionId: string,
  current: JerinAttachment[],
): Promise<{ part: Part; keyId?: string } | null> {
  const asPart = (a: JerinAttachment) => ({
    part: { fileData: { mimeType: a.mimeType, fileUri: a.fileUri } } as Part,
    keyId: ownerOf(a),
  });
  const fromCurrent = [...current].reverse().find((a) => a.kind === "image" && isFresh(a));
  if (fromCurrent) return asPart(fromCurrent);

  const rows = await db
    .select()
    .from(jerinMessagesTable)
    .where(eq(jerinMessagesTable.sessionId, sessionId))
    .orderBy(desc(jerinMessagesTable.id))
    .limit(30);
  for (const m of rows) {
    for (const a of [...(m.attachments ?? [])].reverse()) {
      if (a.kind !== "image") continue;
      if (a.mediaId) {
        const [media] = await db.select().from(jerinMediaTable).where(eq(jerinMediaTable.id, a.mediaId));
        if (media) return { part: { inlineData: { mimeType: media.mimeType, data: media.data.toString("base64") } } };
      }
      if (isFresh(a)) return asPart(a);
    }
  }
  return null;
}

interface ToolContext {
  sessionId: string;
  currentAttachments: JerinAttachment[];
  generated: JerinAttachment[];
  signal: AbortSignal;
  emit: (data: Record<string, unknown>) => void;
}

async function runAutoTool(name: string, args: any, ctx: ToolContext): Promise<Record<string, unknown>> {
  try {
    if (name === "remember") {
      const fact = String(args?.fact ?? "").trim().slice(0, 400);
      if (!fact) return { ok: false, error: "fact is empty" };
      ctx.emit({ type: "tool", name, label: "Saving to memory" });
      const existing = await db.select().from(jerinMemoryTable).where(eq(jerinMemoryTable.content, fact));
      if (existing.length) return { ok: true, note: "already remembered", id: existing[0].id };
      const [row] = await db.insert(jerinMemoryTable).values({ content: fact }).returning();
      return { ok: true, id: row.id };
    }
    if (name === "forget_memory") {
      ctx.emit({ type: "tool", name, label: "Updating memory" });
      await db.delete(jerinMemoryTable).where(eq(jerinMemoryTable.id, Number(args?.id)));
      return { ok: true };
    }
    if (name === "search_past_chats") {
      const q = String(args?.query ?? "").trim();
      if (!q) return { ok: false, error: "query is empty" };
      ctx.emit({ type: "tool", name, label: "Searching past chats" });
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await db
        .select({
          sessionTitle: jerinSessionsTable.title,
          role: jerinMessagesTable.role,
          text: jerinMessagesTable.text,
          at: jerinMessagesTable.createdAt,
          sessionId: jerinMessagesTable.sessionId,
        })
        .from(jerinMessagesTable)
        .innerJoin(jerinSessionsTable, eq(jerinSessionsTable.id, jerinMessagesTable.sessionId))
        .where(and(ilike(jerinMessagesTable.text, pattern), sql`${jerinMessagesTable.sessionId} <> ${ctx.sessionId}`))
        .orderBy(desc(jerinMessagesTable.id))
        .limit(8);
      return {
        ok: true,
        matches: rows.map((r) => ({
          chat: r.sessionTitle,
          date: r.at.toISOString().slice(0, 10),
          who: r.role === "user" ? "Rocky" : "Jerin",
          snippet: r.text.replace(/\s+/g, " ").slice(0, 260),
        })),
      };
    }
    if (name === "generate_image") {
      const prompt = String(args?.prompt ?? "").trim();
      if (!prompt) return { ok: false, error: "prompt is empty" };
      ctx.emit({ type: "tool", name, label: args?.editExisting ? "Editing image" : "Generating image" });
      const parts: Part[] = [{ text: prompt }];
      let imageKeyId: string | undefined;
      if (args?.editExisting) {
        const src = await findLatestImagePart(ctx.sessionId, ctx.currentAttachments);
        if (!src) return { ok: false, error: "There is no earlier image in this chat to edit." };
        parts.unshift(src.part);
        imageKeyId = src.keyId;
      }
      let data: any;
      try {
        data = await generateOnce(
          IMAGE_MODEL,
          { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
          ctx.signal,
          { allowedKeyIds: imageKeyId ? [imageKeyId] : undefined },
        );
      } catch (err) {
        if (err instanceof GeminiError) {
          const quota = err.status === 429 || /limit:\s*0|billing|quota/i.test(err.body);
          return {
            ok: false,
            error: quota
              ? "Image generation isn't available on this Gemini API key right now (it usually needs a billing-enabled key)."
              : `Image model error (${err.status}).`,
          };
        }
        throw err;
      }
      const imgPart = (data?.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData?.data);
      if (!imgPart) return { ok: false, error: "The image model returned no image (it may have declined the request)." };
      const mimeType = imgPart.inlineData.mimeType || "image/png";
      const mediaId = randomUUID();
      await db.insert(jerinMediaTable).values({
        id: mediaId,
        sessionId: ctx.sessionId,
        mimeType,
        data: Buffer.from(imgPart.inlineData.data, "base64"),
      });
      const att: JerinAttachment = {
        kind: "image",
        name: `jerin-${mediaId.slice(0, 6)}.${mimeType.includes("jpeg") ? "jpg" : "png"}`,
        mimeType,
        mediaId,
        generated: true,
      };
      ctx.generated.push(att);
      ctx.emit({ type: "image", attachment: att });
      return { ok: true, note: "The image was created and is now visible to the user in the chat." };
    }
    return { ok: false, error: `Unknown function ${name}` };
  } catch (err) {
    if ((err as any)?.name === "AbortError") throw err;
    logger.error({ err, name }, "Jerin auto tool failed");
    return { ok: false, error: "That step failed unexpectedly." };
  }
}

// ---------------------------------------------------------------------------
// Chat (streaming)
// ---------------------------------------------------------------------------
interface ClientAttachment extends JerinAttachment {
  /** base64 audio recorded in the browser (voice notes are sent inline, not uploaded). */
  inlineData?: string;
}

interface ToolToggles {
  search?: boolean;
  code?: boolean;
}

// Some Gemini models reject mixing built-in tools (search/code) with function calling or an
// unknown flag. We try the richest request first and fall back, remembering what worked.
// Gemini can natively watch public YouTube videos when the URL is passed as file data. (The
// URL-reading tool cannot, which is why a pasted YouTube link used to go nowhere.)
const YT_RE = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/gi;
function extractYouTubeUrls(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(YT_RE)) ids.add(m[1]);
  return [...ids].slice(0, 2).map((id) => `https://www.youtube.com/watch?v=${id}`);
}

const startVariant: Record<"builtins" | "plain", number> = { builtins: 0, plain: 0 };

// Google Search grounding has its own (often zero) free-tier quota. When a request with Search on is
// refused with a 429 and works without it, Search is left off for a while instead of failing first.
const SEARCH_PAUSE_MS = 30 * 60_000;

// Replies that are being generated right now, by chat id. A reply keeps running (and is saved to the
// database) even if the browser disconnects, e.g. the tab is minimized or the phone locks. Only the
// Stop button (POST /rocky/chat/stop) or the hard cap cancels it.
const runs = new Map<string, AbortController>();
const RUN_HARD_CAP_MS = 12 * 60_000;
let searchBlockedUntil = 0;

/** "gemini-3.8-flash" -> "3.8 Flash" */
const shortModel = (m: string) => m.replace(/^gemini-/, "").replace(/-flash$/, " Flash");

function buildVariants(base: any, thinking: boolean, toggles: ToolToggles, hasVideo: boolean) {
  const builtins: any[] = [];
  if (toggles.search) builtins.push({ googleSearch: {} }, { urlContext: {} });
  if (toggles.code) builtins.push({ codeExecution: {} });
  const fn = { functionDeclarations: FUNCTION_DECLARATIONS };
  // Low media resolution cuts video cost from ~300 to ~100 tokens per second of footage, which is
  // what makes full-length episodes fit under the free per-minute token limit. Dialogue is audio,
  // so script work does not need high-res frames.
  const media = hasVideo ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {};
  const thinkingCfg = thinking
    ? { ...media, thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } }
    : { ...media, thinkingConfig: { thinkingBudget: 0 } };

  const withTools = (tools: any[], extra: any = {}, gen: any = thinkingCfg) => ({
    ...base,
    ...(tools.length ? { tools } : {}),
    ...extra,
    generationConfig: gen,
  });

  const variants = [
    withTools([fn, ...builtins], builtins.length ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
    withTools([fn, ...builtins]),
    // Fallback: the user's explicit Search/Code choice wins over site actions.
    withTools(builtins.length ? builtins : [fn]),
    withTools(builtins.length ? builtins : [fn], {}, {}),
  ];
  // Variants 0 and 1 are identical when no built-ins are requested; skip the duplicate.
  return builtins.length ? variants : [variants[1], variants[3]];
}

router.post("/rocky/chat", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  if (isRateLimited(18 * Math.max(1, geminiKeys().length))) {
    res.status(429).json({ error: "Jerin is cooling down — you've hit the free-tier request limit for this minute. Try again shortly." });
    return;
  }
  if (!hasGeminiKeys()) {
    logger.error("GEMINI_API_KEY not configured");
    res.status(500).json({ error: "Jerin isn't configured yet (missing API key on the server)." });
    return;
  }

  const body = req.body as {
    sessionId?: string;
    message?: string;
    attachments?: ClientAttachment[];
    model?: string;
    thinking?: boolean;
    tools?: ToolToggles;
    regenerate?: boolean;
  };

  const text = (body.message ?? "").trim();
  const clientAtts = Array.isArray(body.attachments) ? body.attachments.slice(0, 8) : [];
  if (!body.regenerate && !text && clientAtts.length === 0) {
    res.status(400).json({ error: "Message or attachment required." });
    return;
  }

  let model = ALLOWED_MODELS.includes(body.model ?? "") ? (body.model as string) : DEFAULT_MODEL;
  const triedModels = new Set<string>([model]);
  const thinking = body.thinking === true;
  const toggles: ToolToggles = { search: body.tools?.search !== false, code: body.tools?.code === true };

  // ---- Session + user message -------------------------------------------------------------
  let sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";
  if (sessionId && runs.has(sessionId)) {
    res.status(409).json({ error: "Jerin is still answering in this chat — wait for her to finish, or press Stop." });
    return;
  }
  let isNewSession = false;
  let userMessageId: number | null = null;
  let history: (typeof jerinMessagesTable.$inferSelect)[] = [];
  const stored: JerinAttachment[] = clientAtts.map(({ inlineData: _inline, ...a }) => a);

  try {
    if (sessionId) {
      const [s] = await db.select().from(jerinSessionsTable).where(eq(jerinSessionsTable.id, sessionId));
      if (!s) sessionId = "";
    }
    if (!sessionId) {
      sessionId = randomUUID();
      isNewSession = true;
      // Placeholder title from the first message so the sidebar is useful immediately (and even if
      // Gemini fails); the AI-written title replaces it after the first reply.
      const placeholder = text
        ? cleanTitle(text.split("\n")[0].slice(0, 48))
        : clientAtts.some((a) => a.kind === "audio")
          ? "Voice message"
          : clientAtts[0]?.name
            ? cleanTitle(clientAtts[0].name)
            : "New chat";
      await db.insert(jerinSessionsTable).values({ id: sessionId, title: placeholder });
    }

    if (body.regenerate) {
      // Drop everything after the last user message, then answer that message again.
      const all = await db
        .select()
        .from(jerinMessagesTable)
        .where(eq(jerinMessagesTable.sessionId, sessionId))
        .orderBy(asc(jerinMessagesTable.id));
      const lastUser = [...all].reverse().find((m) => m.role === "user");
      if (!lastUser) {
        res.status(400).json({ error: "Nothing to regenerate." });
        return;
      }
      await db
        .delete(jerinMessagesTable)
        .where(and(eq(jerinMessagesTable.sessionId, sessionId), gt(jerinMessagesTable.id, lastUser.id)));
      history = all.filter((m) => m.id <= lastUser.id).slice(-HISTORY_LIMIT);
      userMessageId = lastUser.id;
    } else {
      const rows = await db
        .select()
        .from(jerinMessagesTable)
        .where(eq(jerinMessagesTable.sessionId, sessionId))
        .orderBy(desc(jerinMessagesTable.id))
        .limit(HISTORY_LIMIT);
      history = rows.reverse();
    }
  } catch (err) {
    logger.error({ err }, "Jerin chat setup failed");
    res.status(500).json({ error: "Couldn't open the chat session." });
    return;
  }

  // ---- Open the event stream --------------------------------------------------------------
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const ac = new AbortController();
  runs.set(sessionId, ac);
  const hardCap = setTimeout(() => ac.abort(), RUN_HARD_CAP_MS);
  // A dropped connection (minimized tab, locked phone, network blip) no longer cancels the reply:
  // Jerin keeps going and saves it, and the page picks it up when it comes back.
  res.on("close", () => {
    if (!res.writableEnded) logger.info({ sessionId }, "Client disconnected mid-reply; Jerin keeps working and will save it");
  });
  // Tiny comment lines keep proxies from closing an idle stream and let the page notice a dead one.
  const keepAlive = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": ping\n\n");
  }, 10_000);
  const emit = (d: Record<string, unknown>) => sse(res, d);

  let fullText = "";
  let thoughtText = "";
  let transcript = "";
  let sources: { title: string; uri: string }[] = [];
  let action: JerinAction | undefined;
  const generated: JerinAttachment[] = [];
  let saved = false;

  const saveModelMessage = async (): Promise<number | null> => {
    if (saved) return null;
    if (!fullText.trim() && !generated.length && !action) return null;
    saved = true;
    const [row] = await db
      .insert(jerinMessagesTable)
      .values({
        sessionId,
        role: "model",
        text: fullText.trim(),
        attachments: generated.length ? generated : null,
        action: action ?? null,
        sources: sources.length ? sources : null,
        thoughts: thoughtText.trim() ? thoughtText.trim().slice(0, 8000) : null,
        model,
      })
      .returning({ id: jerinMessagesTable.id });
    await db.update(jerinSessionsTable).set({ updatedAt: new Date() }).where(eq(jerinSessionsTable.id, sessionId));
    return row.id;
  };

  try {
    // User message (written now so it survives even if Gemini fails).
    const audioInline = clientAtts.find((a) => a.kind === "audio" && a.inlineData);
    const audioOnly = !!audioInline && !text;
    if (!body.regenerate) {
      const [row] = await db
        .insert(jerinMessagesTable)
        .values({
          sessionId,
          role: "user",
          text: audioOnly ? "" : text,
          attachments: stored.length ? stored : null,
        })
        .returning({ id: jerinMessagesTable.id });
      userMessageId = row.id;
    }
    emit({ type: "session", sessionId, userMessageId, isNew: isNewSession });

    // ---- Build the prompt -----------------------------------------------------------------
    const [siteContext, memory] = await Promise.all([buildSiteContext(), loadMemory()]);
    const memoryBlock = memory.length
      ? `=== LONG-TERM MEMORY (things you saved earlier; ids in brackets) ===\n${memory.map((m) => `[${m.id}] ${m.content}`).join("\n")}`
      : "=== LONG-TERM MEMORY ===\n(empty so far)";
    const systemPrompt = `${PERSONA}\n\n${memoryBlock}\n\n${siteContext}\n\nCurrent date and time: ${dhakaNow()}`;

    // The prompt is rebuilt for whichever API key ends up serving the request, because uploaded files
    // can only be read by the key that received them. Tool-loop turns are appended unchanged.
    const extraTurns: Content[] = [];
    const youtube = body.regenerate ? [] : extractYouTubeUrls(text);
    const hasVideoInput = youtube.length > 0 || (!body.regenerate && clientAtts.some((a) => a.kind === "video"));
    const buildContents = (keyId: string): Content[] => {
      const c: Content[] = [];
      // Only a regenerated turn re-sends its own files; for everything else, files from earlier turns become notes.
      const lastId = history[history.length - 1]?.id;
      for (const m of history) pushContent(c, m.role as "user" | "model", messageToContent(m, keyId, !!body.regenerate && m.id === lastId).parts);
      if (!body.regenerate) {
        const parts: Part[] = [];
        for (const a of clientAtts) {
          if (a.inlineData) parts.push({ inlineData: { mimeType: a.mimeType, data: a.inlineData } });
          else if (usableBy(a, keyId)) parts.push({ fileData: { mimeType: a.mimeType, fileUri: a.fileUri } });
          else if (isFresh(a)) parts.push({ text: `[attached ${a.kind} "${a.name}" is stored on a different API key and can't be viewed]` });
        }
        for (const url of youtube) parts.push({ fileData: { fileUri: url } });
        if (text) parts.push({ text });
        if (audioOnly) {
          parts.push({
            text: "The attached audio is the user's spoken message (it may mix Bangla and English). First write the exact transcription wrapped like <<T>>transcription<<E>>, then immediately answer it normally, in the language the user spoke.",
          });
        } else if (!text && parts.length) {
          parts.push({ text: "Take a look at what I attached and tell me what you see, then suggest useful next steps." });
        }
        pushContent(c, "user", parts);
      }
      c.push(...extraTurns);
      return c;
    };

    // Files in this turn pin the request to the key that owns them.
    const turnAtts = body.regenerate ? (history[history.length - 1]?.attachments ?? []) : clientAtts;
    const owners = [...new Set(turnAtts.filter((a: any) => !a.inlineData && isFresh(a)).map(ownerOf))].filter(Boolean) as string[];
    if (owners.length > 1) {
      throw new GeminiError(
        400,
        "",
        `Your attachments are stored on different API keys (${owners.map(keyLabel).join(", ")}), and one reply can only use one key. Attach them again together, or send them one at a time.`,
      );
    }
    const lockToKeys = owners.length === 1 ? owners : undefined;

    // ---- Stream with tool loop ------------------------------------------------------------
    logger.info(
      { systemPromptChars: systemPrompt.length, siteContextChars: siteContext.length, historyMessages: history.length, attachments: clientAtts.length },
      "Jerin prompt size",
    );
    const baseBody = { systemInstruction: { parts: [{ text: systemPrompt }] } };
    const searchPaused = toggles.search && Date.now() < searchBlockedUntil;
    let activeToggles: ToolToggles = searchPaused ? { ...toggles, search: false } : toggles;
    let searchDropped = searchPaused; // true once Search is off for this request (so it is only dropped once)
    let variants = buildVariants(baseBody, thinking, activeToggles, hasVideoInput);
    let variantKey: "builtins" | "plain" = activeToggles.search || activeToggles.code ? "builtins" : "plain";
    let variantIdx = Math.min(startVariant[variantKey], variants.length - 1);
    const notices: string[] = [];
    const skippedModels: { model: string; why: "overloaded" | "quota" }[] = [];
    if (searchPaused) notices.push("Web search was skipped (Google's free tier refused it a moment ago).");
    const sourceSet = new Map<string, string>();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const rawParts: Part[] = [];
      const calls: { name: string; args: any }[] = [];
      const wantTranscript = round === 0 && audioOnly;
      let transcriptBuf = "";
      let transcriptDone = !wantTranscript;
      let succeeded = false;

      for (;;) {
        try {
          const stream = streamGenerate(model, (keyId: string) => ({ ...variants[variantIdx], contents: buildContents(keyId) }), ac.signal, {
            allowedKeyIds: lockToKeys,
            onSwitch: (from, to) => {
              const msg = `${from} ran out of quota, so this reply was answered by ${to}.`;
              if (!notices.includes(msg)) notices.push(msg);
            },
          });
          for await (const chunk of stream) {
            succeeded = true;
            const cand = chunk?.candidates?.[0];
            for (const p of cand?.content?.parts ?? []) {
              if (p.thought && typeof p.text === "string") {
                thoughtText += p.text;
                emit({ type: "thought", delta: p.text });
                continue;
              }
              if (typeof p.text === "string" && p.text) {
                rawParts.push(p);
                let delta = p.text;
                if (!transcriptDone) {
                  transcriptBuf += delta;
                  const end = transcriptBuf.indexOf("<<E>>");
                  if (end >= 0) {
                    transcript = transcriptBuf.slice(0, end).replace("<<T>>", "").trim();
                    delta = transcriptBuf.slice(end + 5).replace(/^\s+/, "");
                    transcriptDone = true;
                    emit({ type: "transcript", text: transcript });
                  } else if (transcriptBuf.length > 1500 || (!transcriptBuf.includes("<<T>>") && transcriptBuf.length > 12)) {
                    // Model ignored the protocol — treat everything as the reply.
                    delta = transcriptBuf.replace("<<T>>", "");
                    transcriptDone = true;
                  } else {
                    delta = "";
                  }
                }
                if (delta) {
                  fullText += delta;
                  emit({ type: "text", delta });
                }
              } else if (p.executableCode) {
                rawParts.push(p);
                const lang = String(p.executableCode.language || "python").toLowerCase().replace("language_unspecified", "python");
                const d = `\n\n\`\`\`${lang}\n${p.executableCode.code}\n\`\`\`\n`;
                fullText += d;
                emit({ type: "text", delta: d });
              } else if (p.codeExecutionResult) {
                rawParts.push(p);
                const d = `\n**Output**\n\`\`\`\n${String(p.codeExecutionResult.output ?? "").trim()}\n\`\`\`\n\n`;
                fullText += d;
                emit({ type: "text", delta: d });
              } else if (p.functionCall) {
                rawParts.push(p);
                calls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
              }
            }
            const gm = cand?.groundingMetadata;
            for (const g of gm?.groundingChunks ?? []) {
              if (g?.web?.uri) sourceSet.set(g.web.uri, g.web.title || g.web.uri);
            }
          }
          break; // stream finished
        } catch (err) {
          // Google overloaded / slow on this model before anything was produced: try another model.
          // Quotas are per model, so when every key is out for this model, another model may still have room.
          // A 429 with Search on: Google Search grounding often has no free quota. Retry the same model
          // once without Search before giving up on the model.
          if (err instanceof GeminiError && err.status === 429 && !succeeded && activeToggles.search && !searchDropped && !ac.signal.aborted) {
            logger.warn({ model }, "Quota refusal with Search on, retrying without Search");
            searchDropped = true;
            activeToggles = { ...activeToggles, search: false };
            clearUnrecognisedRests(model);
            variants = buildVariants(baseBody, thinking, activeToggles, hasVideoInput);
            variantKey = activeToggles.search || activeToggles.code ? "builtins" : "plain";
            variantIdx = Math.min(startVariant[variantKey], variants.length - 1);
            notices.push("Web search was skipped (Google's free tier refused it).");
            continue;
          }
          const poolOut = err instanceof GeminiError && err.status === 429 && !!err.friendly && !lockToKeys;
          if (err instanceof GeminiError && ([500, 502, 503, 504].includes(err.status) || poolOut) && !succeeded && !ac.signal.aborted) {
            const alt = [...ALLOWED_MODELS].reverse().find((m) => !triedModels.has(m));
            if (alt) {
              logger.warn({ from: model, to: alt, status: err.status }, "Gemini unavailable, switching model");
              skippedModels.push({ model, why: poolOut ? "quota" : "overloaded" });
              triedModels.add(alt);
              model = alt;
              continue;
            }
          }
          const retryable = err instanceof GeminiError && err.status === 400 && !succeeded && variantIdx < variants.length - 1;
          if (!retryable) throw err;
          logger.warn({ variantIdx, body: (err as GeminiError).body.slice(0, 300) }, "Gemini rejected request variant, falling back");
          variantIdx++;
          // Variants 2+ (with built-in tools requested) no longer include the site-action functions.
          if (variantKey === "builtins" && variantIdx >= 2) {
            notices.push("Site actions are paused while Search/Code is on for this model. Turn them off if you want me to edit the site.");
          }
        }
      }
      // A later variant worked where an earlier one was rejected: start there next time.
      if (succeeded && variantIdx > startVariant[variantKey]) startVariant[variantKey] = variantIdx;
      // It only worked after Search was dropped: keep Search off for a while so each message doesn't fail first.
      if (succeeded && searchDropped && toggles.search && !searchPaused) searchBlockedUntil = Date.now() + SEARCH_PAUSE_MS;

      // flush a transcript buffer that never completed
      if (!transcriptDone && transcriptBuf) {
        const d = transcriptBuf.replace("<<T>>", "");
        fullText += d;
        emit({ type: "text", delta: d });
      }

      const siteCall = calls.find((c) => SITE_ACTIONS.has(c.name));
      if (siteCall) {
        action = { name: siteCall.name, args: siteCall.args ?? {}, status: "pending" };
        if (!fullText.trim()) {
          fullText = "I'll set that up — confirm below to go ahead.";
          emit({ type: "text", delta: fullText });
        }
        break;
      }

      if (!calls.length) break;

      const responseParts: Part[] = [];
      for (const c of calls) {
        const result = AUTO_TOOLS.has(c.name)
          ? await runAutoTool(c.name, c.args, {
              sessionId,
              currentAttachments: stored,
              generated,
              signal: ac.signal,
              emit,
            })
          : { ok: false, error: `Unknown function ${c.name}` };
        responseParts.push({ functionResponse: { name: c.name, response: result } });
      }
      extraTurns.push({ role: "model", parts: rawParts.filter((p) => !p.thought) }, { role: "user", parts: responseParts });
    }

    sources = [...sourceSet].map(([uri, title]) => ({ title, uri })).slice(0, 8);
    if (sources.length) emit({ type: "sources", sources });
    if (skippedModels.length) {
      const names = (why: "overloaded" | "quota") => skippedModels.filter((x) => x.why === why).map((x) => shortModel(x.model));
      const parts = [
        names("overloaded").length ? `${names("overloaded").join(" and ")} overloaded` : "",
        names("quota").length ? `${names("quota").join(" and ")} out of quota` : "",
      ].filter(Boolean);
      notices.unshift(`Answered by ${shortModel(model)} (${parts.join("; ")} right now).`);
    }
    if (notices.length) emit({ type: "notice", text: [...new Set(notices)].join(" ") });

    // Voice notes: store what the user said so future turns (and old chats) keep the text.
    if (audioOnly && userMessageId) {
      await db
        .update(jerinMessagesTable)
        .set({ text: transcript || "(voice message)" })
        .where(eq(jerinMessagesTable.id, userMessageId));
    }

    const messageId = await saveModelMessage();
    emit({ type: "done", messageId, action: action ?? null });
    res.end();

    // Name the chat after the first exchange (fire-and-forget).
    if (isNewSession && (text || transcript)) {
      generateOnce(model, {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Write a short title (max 5 words, same language as the conversation, no quotes, no trailing punctuation) for a chat that starts like this.\n\nUser: ${(text || transcript).slice(0, 400)}\n\nAssistant: ${fullText.slice(0, 400)}`,
              },
            ],
          },
        ],
        generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 30 },
      })
        .then((d) => {
          const t = cleanTitle(String(d?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
          if (!t || t === "New chat") return undefined;
          return db.update(jerinSessionsTable).set({ title: t }).where(eq(jerinSessionsTable.id, sessionId));
        })
        .catch((err) => logger.warn({ err }, "Chat title generation failed"));
    }
  } catch (err: any) {
    if (err?.name === "AbortError" || ac.signal.aborted) {
      // User pressed Stop (or the 12-minute safety cap hit): keep what was already written.
      try {
        await saveModelMessage();
      } catch (e) {
        logger.warn({ e }, "Could not save partial Jerin reply");
      }
      if (!res.writableEnded) res.end();
      return;
    }
    logger.error({ err, geminiStatus: (err as any)?.status, geminiBody: String((err as any)?.body ?? "").slice(0, 1500) }, "Jerin chat failed");
    try {
      await saveModelMessage();
    } catch {
      /* ignore */
    }
    const message =
      err instanceof GeminiError ? (err.friendly ?? friendlyGeminiError(err.status, err.body, model)) : "Something went wrong talking to Jerin's brain.";
    emit({ type: "error", message });
    if (!res.writableEnded) res.end();
  } finally {
    clearInterval(keepAlive);
    clearTimeout(hardCap);
    if (runs.get(sessionId) === ac) runs.delete(sessionId);
  }
});

export default router;
