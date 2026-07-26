import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const episodesTable = pgTable("episodes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  season: integer("season").notNull().default(1),
  genre: text("genre"),
  thumbnailUrl: text("thumbnail_url"),
  primaryServerUrl: text("primary_server_url"),
  backupServerUrl: text("backup_server_url"),
  isSpecial: boolean("is_special").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  viewCount: integer("view_count").notNull().default(0),
});

export const insertEpisodeSchema = createInsertSchema(episodesTable).omit({ id: true, createdAt: true, viewCount: true });
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Episode = typeof episodesTable.$inferSelect;
