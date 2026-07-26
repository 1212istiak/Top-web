import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const voiceArtistsTable = pgTable("voice_artists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertVoiceArtistSchema = createInsertSchema(voiceArtistsTable).omit({ id: true });
export type InsertVoiceArtist = z.infer<typeof insertVoiceArtistSchema>;
export type VoiceArtist = typeof voiceArtistsTable.$inferSelect;
