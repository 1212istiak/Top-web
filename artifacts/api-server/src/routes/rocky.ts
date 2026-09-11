import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GEMINI_MODEL = "gemini-2.0-flash";
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

const SYSTEM_PROMPTS: Record<string, string> = {
  chat:
    "You are Rocky, a helpful copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). Rocky's founder is Istiak Ahmed. Keep answers practical and concise.",
  scene:
    "You are Rocky, a content strategist for a Bangla BTTH dubbing YouTube/Facebook/Telegram channel called TVR Dubbers. Given the user's notes about what's trending or requested, suggest which BTTH scene(s) to dub next, with brief reasoning. Be concise and practical.",
  titles:
    "You are Rocky, a copywriter for TVR Dubbers, a Bangla BTTH dubbing channel. Given an episode/scene description, generate an optimized title and description for YouTube, Facebook, and Telegram separately — each platform has a different tone (YouTube: searchable + punchy, Facebook: conversational + shareable, Telegram: short + direct). Include Bangla-flavored hooks where natural. Format clearly with headers per platform.",
  growth:
    "You are Rocky, a community growth analyst for TVR Dubbers, a Bangla BTTH dubbing channel whose goal is building a loyal Bangladeshi audience (not just raw views). Given pasted comments or messages, summarize sentiment, recurring requests, and what seems to drive loyalty vs one-off views. Be concise and specific.",
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

  const { mode, message } = req.body as { mode?: string; message?: string };
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const systemPrompt = SYSTEM_PROMPTS[mode || "chat"] || SYSTEM_PROMPTS.chat;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
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
