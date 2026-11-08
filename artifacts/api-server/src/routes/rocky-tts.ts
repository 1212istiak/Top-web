import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ElevenLabs text-to-speech proxy for Jerin's voice.
// The API key stays on the server (ELEVENLABS_API_KEY) and never reaches the browser.
// eleven_v3 supports Bengali, Hindi and English (eleven_multilingual_v2 does not include Bengali).
const TTS_MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
const MAX_CHARS = 1500; // keep credit usage in check on long replies

router.post("/rocky/tts", requireAdmin, async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    res.status(503).json({ error: "ElevenLabs is not configured (set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)" });
    return;
  }

  const raw = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!raw) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const text = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw;

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
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
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
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
    res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
    res.send(audio);
  } catch (err) {
    logger.error({ err }, "ElevenLabs TTS request crashed");
    res.status(502).json({ error: "Could not reach ElevenLabs" });
  }
});

export default router;
