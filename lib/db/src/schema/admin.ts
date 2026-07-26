import { pgTable, text, integer } from "drizzle-orm/pg-core";

export const adminTable = pgTable("admin", {
  id: integer("id").primaryKey().default(1),
  passwordHash: text("password_hash").notNull(),
});

export type Admin = typeof adminTable.$inferSelect;
