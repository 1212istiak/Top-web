import { pgTable, text, serial, timestamp, jsonb, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export interface JerinAttachment {
  kind: "image" | "video" | "audio" | "document";
  name: string;
  mimeType: string;
  /** Gemini Files API URI (valid ~48h). Absent for inline voice notes. */
  fileUri?: string;
  /** Epoch ms when the file was uploaded to Gemini, used to skip expired files in history. */
  uploadedAt?: number;
  /** Small data-URL preview (images / video poster) kept so old chats still show something. */
  thumb?: string;
  /** Set for images Jerin generated; served from jerin_media. */
  mediaId?: string;
  generated?: boolean;
}

export interface JerinAction {
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "confirmed" | "cancelled" | "failed";
  result?: string;
}

export const jerinSessionsTable = pgTable("jerin_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New chat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jerinMessagesTable = pgTable("jerin_messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // "user" | "model"
  text: text("text").notNull().default(""),
  attachments: jsonb("attachments").$type<JerinAttachment[]>(),
  action: jsonb("action").$type<JerinAction>(),
  sources: jsonb("sources").$type<{ title: string; uri: string }[]>(),
  thoughts: text("thoughts"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jerinMemoryTable = pgTable("jerin_memory", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jerinMediaTable = pgTable("jerin_media", {
  id: text("id").primaryKey(),
  sessionId: text("session_id"),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JerinSession = typeof jerinSessionsTable.$inferSelect;
export type JerinMessage = typeof jerinMessagesTable.$inferSelect;
export type JerinMemory = typeof jerinMemoryTable.$inferSelect;
