import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ALLOWED_MODELS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"] as const;
type GeminiModel = typeof ALLOWED_MODELS[number];

// Stay under free-tier RPM cap (rolling 60s window)
let requestLog: number[] = [];
function isRateLimited(): boolean {
  const now = Date.now();
  requestLog = requestLog.filter((t) => now - t < 60_000);
  if (requestLog.length >= 18) return true;
  requestLog.push(now);
  return false;
}

const VOICE_NOTE =
  " Keep responses concise and avoid heavy markdown symbols like **, *, #, or backticks since this reply may be read aloud.";

const SYSTEM_PROMPTS: Record<string, string> = {
  chat:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Help with anything the user asks — content ideas, strategy, analysis, or general questions. Be thorough when needed, concise when not." +
    VOICE_NOTE,
  scene:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Help the user decide which BTTH scene to dub next — consider trends, fan requests, story arc, character popularity, and engagement potential. Be thorough and specific." +
    VOICE_NOTE,
  titles:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Generate optimized titles and descriptions for the user's dubbed content. Tailor each platform's tone: YouTube (searchable, punchy, SEO-friendly), Facebook (conversational, shareable, emotional hook), Telegram (short, direct, hype). Include Bangla-flavored hooks where natural. Format clearly with platform names as headers.",
  growth:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Analyze the user's audience data — pasted comments, messages, or screenshots — to identify sentiment, recurring requests, loyal viewer patterns, and growth opportunities specific to a Bangladeshi dubbing audience. Be detailed and actionable." +
    VOICE_NOTE,
};

router.post("/rocky/generate", requireAdmin, async (req, res): Promise<void> => {
  if (isRateLimited()) {
    res.status(429).json({ error: "Jerin is cooling down — you've hit the free-tier request limit for this minute. Try again shortly." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("GEMINI_API_KEY not configured");
    res.status(500).json({ error: "Jerin isn't configured yet (missing API key on the server)." });
    return;
  }

  const { mode, message, image, imageMimeType, model, thinking } = req.body as {
    mode?: string;
    message?: string;
    image?: string;
    imageMimeType?: string;
    model?: string;
    thinking?: boolean;
  };

  if ((!message || !message.trim()) && !image) {
    res.status(400).json({ error: "Message or image is required" });
    return;
  }

  // Validate model — whitelist only, never trust raw user input for API calls
  const selectedModel: GeminiModel = ALLOWED_MODELS.includes(model as GeminiModel)
    ? (model as GeminiModel)
    : "gemini-3.8-flash";

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
  const systemPrompt = SYSTEM_PROMPTS[mode || "chat"] || SYSTEM_PROMPTS.chat;

  const parts: any[] = [];
  if (message && message.trim()) parts.push({ text: message });
  if (image) {
    parts.push({ inlineData: { mimeType: imageMimeType || "image/jpeg", data: image } });
    if (parts.length === 1) {
      parts.unshift({ text: "Analyze this screenshot of comments/messages for a Bangla BTTH dubbing channel. Summarize sentiment, recurring requests, and what seems to drive loyalty." });
    }
  }

  // Build request body — disable thinking when Quick mode is selected
  const requestBody: any = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts }],
  };
  if (thinking === false) {
    requestBody.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
  }

  try {
    const response = await fetch(`${geminiUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, "Gemini API error");

      let friendlyError = "Jerin's brain (Gemini) returned an error.";
      if (response.status === 429) {
        const retryMatch = errText.match(/retry in ([\d.]+)s/i);
        const seconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;
        friendlyError = seconds
          ? `Free tier limit hit — try again in about ${seconds} seconds.`
          : "Free tier request limit hit for this minute — wait a bit and try again.";
      } else if (response.status === 404) {
        friendlyError = `Model ${selectedModel} isn't available on your key — try switching to a different model in Jerin's settings.`;
      } else if (response.status === 503) {
        friendlyError = "Gemini is overloaded right now — try again in a moment.";
      } else if (response.status === 400) {
        friendlyError = "That request wasn't formatted right for Gemini — try shortening it or removing the image.";
      }

      res.status(502).json({ error: friendlyError });
      return;
    }

    const data = (await response.json()) as any;
    const text =
      data?.candidates?.[0]?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("") ||
      "Jerin didn't return a response — try rephrasing.";

    res.json({ text, model: selectedModel });
  } catch (err) {
    logger.error({ err }, "Jerin generate failed");
    res.status(500).json({ error: "Something went wrong talking to Jerin's brain." });
  }
});

export default router;
