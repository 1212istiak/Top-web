import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ElevenLabs text-to-speech proxy for Jerin's voice.
// The API key stays on the server (ELEVENLABS_API_KEY) and never reaches the browser.
//
// eleven_v3 is the only ElevenLabs model that officially supports Bengali (Flash v2.5 and
// Multilingual v2 do not), and it handles Bangla + English in one sentence, so we keep it and
// tune the *input* for it instead:
//  - the text is cleaned (markdown, links, emoji and [square-bracket] text are removed, because v3
//    treats [brackets] as audio tags and would act them out instead of reading them)
//  - the client sends sentence-sized chunks so audio starts early, and v3 keeps the voice stable
//    inside each chunk
//  - the Bangla danda (।) is kept as the sentence terminator, which v3 reads with correct prosody
//  - "Natural" stability (0.5) is v3's most consistent setting for Bangla; override with env vars
const TTS_MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
const STABILITY = Number(process.env.ELEVENLABS_STABILITY ?? 0.5);
const SIMILARITY = Number(process.env.ELEVENLABS_SIMILARITY ?? 0.75);
const MAX_CHARS = 2500;

// Tiny in-memory cache so replaying a sentence is instant and costs no extra credits.
const CACHE_MAX = 80;
const cache = new Map<string, Buffer>();

export function cleanForVoice(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ") // code blocks are not read aloud
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, "$1") // markdown links → their label
    .replace(/https?:\/\/\S+/g, " ") // bare URLs sound terrible
    .replace(/\[[^\]]*\]/g, " ") // v3 audio-tag syntax
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/^\s*\|?[-:| ]{3,}\|?\s*$/gm, " ") // table rules
    .replace(/\|/g, ", ")
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

router.post("/rocky/tts", requireAdmin, async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    res.status(503).json({ error: "ElevenLabs is not configured (set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)" });
    return;
  }

  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  const cleaned = cleanForVoice(raw);
  if (!cleaned) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const text = cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) : cleaned;

  const key = createHash("sha1").update(`${voiceId}|${TTS_MODEL}|${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // refresh recency
    res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600", "X-Jerin-Cache": "hit" });
    res.send(hit);
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: { stability: STABILITY, similarity_boost: SIMILARITY },
        }),
      },
    );

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      logger.error({ status: upstream.status, detail: detail.slice(0, 300) }, "ElevenLabs TTS failed");
      res.status(502).json({ error: `ElevenLabs error (${upstream.status})` });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    cache.set(key, audio);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" });
    res.send(audio);
  } catch (err) {
    logger.error({ err }, "ElevenLabs TTS request crashed");
    res.status(502).json({ error: "Could not reach ElevenLabs" });
  }
});

export default router;
