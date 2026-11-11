import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, adminTable, settingsTable, voiceArtistsTable, trailerTable } from "@workspace/db";
import { logger } from "./lib/logger";

export async function seedDatabase(): Promise<void> {
  try {
    // Seed admin on first run only. Password comes from ADMIN_INITIAL_PASSWORD;
    // if it is not set, a random one is generated and logged once.
    const [existingAdmin] = await db.select().from(adminTable).where(eq(adminTable.id, 1));
    if (!existingAdmin) {
      const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
      const initialPassword = envPassword || randomBytes(12).toString("base64url");
      const passwordHash = await bcrypt.hash(initialPassword, 12);
      await db.insert(adminTable).values({ id: 1, passwordHash });
      if (envPassword) {
        logger.info("Admin seeded from ADMIN_INITIAL_PASSWORD");
      } else {
        logger.warn(
          `ADMIN_INITIAL_PASSWORD not set. Generated one-time admin password: ${initialPassword} (change it in the admin panel)`,
        );
      }
    }

    // Seed trailer record
    const [existingTrailer] = await db.select().from(trailerTable).where(eq(trailerTable.id, 1));
    if (!existingTrailer) {
      await db.insert(trailerTable).values({ id: 1 });
      logger.info("Trailer record seeded");
    }

    // Seed default settings
    const defaultSettings: Array<[string, string]> = [
      ["websiteTitle", "TVR Dubbers"],
      ["motto", "We Believe in Quality"],
      ["specialFolderThumbnail", ""],
      ["specialFolderLabel", "Special Episode"],
      ["countdownTargetDate", ""],
      ["facebook", "https://www.facebook.com/dubtvr"],
      ["youtube", "https://youtube.com/@tvr_dubbers"],
      ["telegram", "https://t.me/TVR_Dubbers"],
      ["instagram", ""],
      ["dailymotion", ""],
      ["rumble", ""],
      ["whatsapp", "01950241724"],
      ["telegramChannel", "https://t.me/TVR_Dubbers"],
    ];

    for (const [key, value] of defaultSettings) {
      const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
      if (!existing) {
        await db.insert(settingsTable).values({ key, value });
      }
    }
    logger.info("Settings seeded");

    // Seed voice artists
    const existingArtists = await db.select().from(voiceArtistsTable);
    if (existingArtists.length === 0) {
      const artists = [
        "Md Afsin", "Argho Shekhar", "Yousa Mahin", "Redwan Ahmed",
        "Amjad Hussain", "Meherima Jahan", "Saurav Talukder",
        "Shehzana Rahman", "Bushrath Jahan", "Kamonika Paul", "Sabrina Ahmed",
      ];
      for (let i = 0; i < artists.length; i++) {
        await db.insert(voiceArtistsTable).values({ name: artists[i], displayOrder: i });
      }
      logger.info({ count: artists.length }, "Voice artists seeded");
    }
  } catch (err) {
    logger.error({ err }, "Database seeding failed");
  }
}
