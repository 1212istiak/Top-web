import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const SETTING_KEYS = [
  "websiteTitle",
  "motto",
  "specialFolderThumbnail",
  "specialFolderLabel",
  "countdownTargetDate",
  "facebook",
  "youtube",
  "telegram",
  "instagram",
  "dailymotion",
  "rumble",
  "whatsapp",
  "telegramChannel",
] as const;

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

// GET /settings
router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getAllSettings();
  const result: Record<string, string | undefined> = {};
  for (const key of SETTING_KEYS) {
    result[key] = settings[key] || undefined;
  }
  res.json(result);
});

// PATCH /settings
router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates = parsed.data;
  const entries = Object.entries(updates).filter(([k]) => SETTING_KEYS.includes(k as typeof SETTING_KEYS[number]));

  for (const [key, value] of entries) {
    if (value == null) continue;
    const sanitized = String(value).replace(/<script[^>]*>.*?<\/script>/gi, "").trim();
    // Upsert
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length > 0) {
      await db.update(settingsTable).set({ value: sanitized }).where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value: sanitized });
    }
  }

  const settings = await getAllSettings();
  const result: Record<string, string | undefined> = {};
  for (const k of SETTING_KEYS) {
    result[k] = settings[k] || undefined;
  }
  res.json(result);
});

export default router;
