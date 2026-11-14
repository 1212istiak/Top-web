import { pool } from "@workspace/db";
import { logger } from "./logger";

// Creates Jerin's tables if they don't exist yet. Idempotent and safe to run on every boot,
// so production (Render) never needs a manual `drizzle-kit push` for the chat feature.
export async function ensureJerinTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jerin_sessions (
        id text PRIMARY KEY,
        title text NOT NULL DEFAULT 'New chat',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS jerin_messages (
        id serial PRIMARY KEY,
        session_id text NOT NULL,
        role text NOT NULL,
        text text NOT NULL DEFAULT '',
        attachments jsonb,
        action jsonb,
        sources jsonb,
        thoughts text,
        model text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS jerin_messages_session_idx ON jerin_messages (session_id, id);
      CREATE INDEX IF NOT EXISTS jerin_sessions_updated_idx ON jerin_sessions (updated_at DESC);
      CREATE TABLE IF NOT EXISTS jerin_memory (
        id serial PRIMARY KEY,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS jerin_media (
        id text PRIMARY KEY,
        session_id text,
        mime_type text NOT NULL,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    logger.info("Jerin tables ready");
  } catch (err) {
    logger.error({ err }, "Could not ensure Jerin tables");
  }
}
