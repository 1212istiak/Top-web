import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Simple in-memory rate limit: 30 requests / 10 minutes per admin session
// (admin-only route, but Gemini free tier has daily caps we don't want to blow through by accident)
let requestLog: number[] = [];
function isRateLimited(): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  requestLog = requestLog.filter((t) => now - t < window);
  if (requestLog.length >= 30) return true;
  requestLog.push(now);
  return false;
}

const FORMAT_NOTE =
  " Never use markdown symbols like **, *, #, or backticks in your response — write in plain sentences, since replies may be read aloud by text-to-speech.";

const SYSTEM_PROMPTS: Record<string, string> = {
  chat:
    "You are Rocky, a helpful copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). Rocky's founder is Istiak Ahmed. Keep answers practical and concise." +
    FORMAT_NOTE,
  scene:
    "You are Rocky, a content strategist for a Bangla BTTH dubbing YouTube/Facebook/Telegram channel called TVR Dubbers. Given the user's notes about what's trending or requested, suggest which BTTH scene(s) to dub next, with brief reasoning. Be concise and practical." +
    FORMAT_NOTE,
  titles:
    "You are Rocky, a copywriter for TVR Dubbers, a Bangla BTTH dubbing channel. Given an episode/scene description, generate an optimized title and description for YouTube, Facebook, and Telegram separately — each platform has a different tone (YouTube: searchable + punchy, Facebook: conversational + shareable, Telegram: short + direct). Include Bangla-flavored hooks where natural. Use plain text with clear line breaks and platform names as labels — never markdown symbols like ** or #.",
  growth:
    "You are Rocky, a community growth analyst for TVR Dubbers, a Bangla BTTH dubbing channel whose goal is building a loyal Bangladeshi audience (not just raw views). You may receive pasted text OR a screenshot image of comments/messages. Read whatever is given (including text visible inside images) and summarize sentiment, recurring requests, and what seems to drive loyalty vs one-off views. Be concise and specific. Do not narrate that you're looking at an image — just analyze it." +
    FORMAT_NOTE,
};

router.post("/rocky/generate", requireAdmin, async (req, res): Promise<void> => {
  if (isRateLimited()) {
    res.status(429).json({ error: "Rocky is cooling down — try again in a few minutes." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("GEMINI_API_KEY not configured");
    res.status(500).json({ error: "Rocky isn't configured yet (missing API key on the server)." });
    return;
  }

  const { mode, message, image, imageMimeType } = req.body as {
    mode?: string;
    message?: string;
    image?: string; // base64, no data: prefix
    imageMimeType?: string;
  };

  if ((!message || !message.trim()) && !image) {
    res.status(400).json({ error: "Message or image is required" });
    return;
  }

  const systemPrompt = SYSTEM_PROMPTS[mode || "chat"] || SYSTEM_PROMPTS.chat;

  const parts: any[] = [];
  if (message && message.trim()) parts.push({ text: message });
  if (image) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType || "image/jpeg",
        data: image,
      },
    });
    if (parts.length === 1) {
      // image only, no caption — give the model something to anchor on
      parts.unshift({ text: "Analyze this screenshot of comments/messages for a Bangla BTTH dubbing channel. Summarize sentiment, recurring requests, and what seems to drive loyalty." });
    }
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, "Gemini API error");
      res.status(502).json({ error: "Rocky's brain (Gemini) returned an error." });
      return;
    }

    const data = (await response.json()) as any;
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ||
      "Rocky didn't return a response — try rephrasing.";

    res.json({ text });
  } catch (err) {
    logger.error({ err }, "Rocky generate failed");
    res.status(500).json({ error: "Something went wrong talking to Rocky's brain." });
  }
});

export default router;
