import { pgTable, text, serial, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reactionsTable = pgTable("reactions", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  reactionType: text("reaction_type").notNull(),
}, (t) => [
  unique("reactions_episode_visitor").on(t.episodeId, t.visitorId),
]);

export const insertReactionSchema = createInsertSchema(reactionsTable).omit({ id: true });
export type InsertReaction = z.infer<typeof insertReactionSchema>;
export type Reaction = typeof reactionsTable.$inferSelect;
