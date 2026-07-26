import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, adminTable } from "@workspace/db";
import {
  AdminLoginBody,
  ChangeAdminPasswordBody,
} from "@workspace/api-zod";
import { requireAdmin, signAdminToken } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Rate limiting for login: 5 attempts per 15 minutes per IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + window });
    return false;
  }
  if (entry.count >= 5) return true;
  entry.count++;
  return false;
}

// POST /admin/login
router.post("/admin/login", async (req, res): Promise<void> => {
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (isLoginRateLimited(ip)) {
    res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
    return;
  }

  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [admin] = await db.select().from(adminTable).where(eq(adminTable.id, 1));
  if (!admin) {
    req.log.error("Admin record not found in database");
    res.status(500).json({ error: "Admin not configured" });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const token = signAdminToken();
  res.json({ token });
});

// POST /admin/change-password
router.post("/admin/change-password", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ChangeAdminPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [admin] = await db.select().from(adminTable).where(eq(adminTable.id, 1));
  if (!admin) {
    res.status(500).json({ error: "Admin not configured" });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(adminTable).set({ passwordHash: newHash }).where(eq(adminTable.id, 1));

  logger.info("Admin password changed");
  res.json({ success: true });
});

export default router;
