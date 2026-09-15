import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db, episodesTable } from "@workspace/db";

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

const ACTION_NOTE =
  " If the user explicitly asks you to publish, create, or add a new episode to the website (and gives you the necessary details like title, episode number, and embed URL), call the create_episode function instead of just describing what you would do. If they're missing required details, ask for them in plain text first rather than guessing or calling the function with incomplete info. Only call the function when you have enough real information — never invent placeholder values.";

const SYSTEM_PROMPTS: Record<string, string> = {
  chat:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Help with anything the user asks — content ideas, strategy, analysis, or general questions. Be thorough when needed, concise when not." +
    VOICE_NOTE + ACTION_NOTE,
  scene:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Help the user decide which BTTH scene to dub next — consider trends, fan requests, story arc, character popularity, and engagement potential. Be thorough and specific." +
    VOICE_NOTE,
  titles:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Generate optimized titles and descriptions for the user's dubbed content. Tailor each platform's tone: YouTube (searchable, punchy, SEO-friendly), Facebook (conversational, shareable, emotional hook), Telegram (short, direct, hype). Include Bangla-flavored hooks where natural. Format clearly with platform names as headers.",
  growth:
    "You are Jerin, AI copilot for TVR Dubbers (The Voice of Rockstar'z), a Bangla dubbing group focused on the donghua Battle Through the Heavens (BTTH). The founder is Rocky. Analyze the user's audience data — pasted comments, messages, or screenshots — to identify sentiment, recurring requests, loyal viewer patterns, and growth opportunities specific to a Bangladeshi dubbing audience. Be detailed and actionable." +
    VOICE_NOTE,
};

// Function-calling tools — only offered in "chat" mode. Gemini can propose calling
// these, but never executes them itself; the frontend shows a confirm card and only
// the user's explicit tap triggers the real backend action.
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "create_episode",
        description: "Create and publish a new episode on the TVR Dubbers website.",
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
    ],
  },
];

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

  const { mode, message, image, imageMimeType, model, thinking, videoUrl } = req.body as {
    mode?: string;
    message?: string;
    image?: string;
    imageMimeType?: string;
    model?: string;
    thinking?: boolean;
    videoUrl?: string; // public video URL (YouTube, or a direct file URL) for Gemini to watch
  };

  if ((!message || !message.trim()) && !image && !videoUrl) {
    res.status(400).json({ error: "Message, image, or video URL is required" });
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
  if (videoUrl) {
    parts.push({ file_data: { file_uri: videoUrl } });
    if (!message || !message.trim()) {
      parts.unshift({ text: "Watch this video and suggest an optimized title, description, category/genre, and a curiosity-driven trailer hook, for a Bangla BTTH dubbing channel called TVR Dubbers." });
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
  if ((mode || "chat") === "chat") {
    requestBody.tools = TOOLS;
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
    const responseParts = data?.candidates?.[0]?.content?.parts || [];
    const text = responseParts.filter((p: any) => p.text).map((p: any) => p.text).join("") || "";
    const functionCall = responseParts.find((p: any) => p.functionCall)?.functionCall || null;

    if (!text && !functionCall) {
      res.json({ text: "Jerin didn't return a response — try rephrasing.", model: selectedModel });
      return;
    }

    res.json({
      text: text || (functionCall ? `I'll set that up — confirm below to go ahead.` : ""),
      model: selectedModel,
      functionCall: functionCall ? { name: functionCall.name, args: functionCall.args } : undefined,
    });
  } catch (err) {
    logger.error({ err }, "Jerin generate failed");
    res.status(500).json({ error: "Something went wrong talking to Jerin's brain." });
  }
});

// POST /rocky/execute-action — runs a real action only after the user has
// explicitly confirmed it in the UI. Never called automatically by Gemini itself.
router.post("/rocky/execute-action", requireAdmin, async (req, res): Promise<void> => {
  const { action, args } = req.body as { action?: string; args?: any };

  if (action === "create_episode") {
    const { title, episodeNumber, season, genre, thumbnailUrl, primaryServerUrl, backupServerUrl, isSpecial } = args || {};
    if (!title || !episodeNumber || !primaryServerUrl) {
      res.status(400).json({ error: "title, episodeNumber, and primaryServerUrl are required." });
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
      logger.error({ err }, "Failed to create episode via chat action");
      res.status(500).json({ error: "Couldn't create the episode on your site." });
    }
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
});

export default router;
