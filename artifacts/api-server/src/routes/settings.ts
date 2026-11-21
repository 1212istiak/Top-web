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

// Settings are plain data, never HTML. Text fields have tags stripped; link fields must be http(s).
const LINK_KEYS = new Set(["facebook", "youtube", "telegram", "instagram", "dailymotion", "rumble", "telegramChannel", "specialFolderThumbnail"]);

function stripTags(v: string): string {
  return v.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Returns the cleaned value, or null if it is not acceptable for that key.
function cleanSetting(key: string, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return "";
  if (LINK_KEYS.has(key)) return isHttpUrl(value) ? value : null;
  // WhatsApp is stored either as a phone number or an http(s) link
  if (key === "whatsapp") return isHttpUrl(value) || /^\+?[\d\s-]{6,20}$/.test(value) ? value : null;
  return stripTags(value);
}

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
  const rejected: string[] = [];
  const cleaned: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!SETTING_KEYS.includes(key as typeof SETTING_KEYS[number]) || value == null) continue;
    const sanitized = cleanSetting(key, String(value));
    if (sanitized === null) rejected.push(key);
    else cleaned.push([key, sanitized]);
  }

  // Validate everything first so a bad field never causes a partial save.
  if (rejected.length > 0) {
    res.status(400).json({ error: `These fields must be valid http(s) links: ${rejected.join(", ")}` });
    return;
  }

  for (const [key, sanitized] of cleaned) {
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
