import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trailerTable = pgTable("trailer", {
  id: integer("id").primaryKey().default(1),
  title: text("title"),
  genre: text("genre"),
  thumbnailUrl: text("thumbnail_url"),
  primaryServerUrl: text("primary_server_url"),
  backupServerUrl: text("backup_server_url"),
});

export const insertTrailerSchema = createInsertSchema(trailerTable).omit({ id: true });
export type InsertTrailer = z.infer<typeof insertTrailerSchema>;
export type Trailer = typeof trailerTable.$inferSelect;
