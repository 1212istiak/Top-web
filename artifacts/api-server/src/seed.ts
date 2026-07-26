import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, adminTable, settingsTable, voiceArtistsTable, trailerTable } from "@workspace/db";
import { logger } from "./lib/logger";

export async function seedDatabase(): Promise<void> {
  try {
    // Seed admin (default password: rocky@17)
    const [existingAdmin] = await db.select().from(adminTable).where(eq(adminTable.id, 1));
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash("rocky@17", 12);
      await db.insert(adminTable).values({ id: 1, passwordHash });
      logger.info("Admin seeded with default password");
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
