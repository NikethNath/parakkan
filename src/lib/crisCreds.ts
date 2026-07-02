import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * CRIS portal credentials are stored AES-256-GCM encrypted at rest (single row).
 * Plaintext only ever exists in memory during a fetch. Never logged.
 */

export async function setCrisCredentials(username: string, password: string) {
  const encUsername = encrypt(username);
  const encPassword = encrypt(password);
  const existing = await prisma.crisCredential.findFirst();
  if (existing) {
    await prisma.crisCredential.update({
      where: { id: existing.id },
      data: { encUsername, encPassword },
    });
  } else {
    await prisma.crisCredential.create({ data: { encUsername, encPassword } });
  }
}

export async function getCrisCredentials(): Promise<{
  username: string;
  password: string;
} | null> {
  const c = await prisma.crisCredential.findFirst();
  if (!c) return null;
  return { username: decrypt(c.encUsername), password: decrypt(c.encPassword) };
}

/**
 * Login config for the scraper. Prefers the pre-authenticated dealer link
 * (CRIS_LOGIN_URL — a secret, set in .env / droplet env, never committed) and
 * falls back to the stored username/password. Shape is spread straight into
 * fetchDailySalesReport(). Returns null when nothing is configured.
 */
export async function getCrisLogin(): Promise<
  { loginUrl?: string; username?: string; password?: string; sapCode?: string } | null
> {
  const sapCode = process.env.CRIS_SAP_CODE || undefined;

  const loginUrl = process.env.CRIS_LOGIN_URL;
  if (loginUrl) return { loginUrl, sapCode };

  const c = await prisma.crisCredential.findFirst();
  if (!c) return null;
  const username = decrypt(c.encUsername);
  return { username, password: decrypt(c.encPassword), sapCode: sapCode || username };
}

export async function crisStatus(): Promise<{ configured: boolean; updatedAt: Date | null }> {
  // Configured either by the dealer link (env) or stored credentials (DB).
  if (process.env.CRIS_LOGIN_URL) return { configured: true, updatedAt: null };
  const c = await prisma.crisCredential.findFirst();
  return { configured: !!c, updatedAt: c?.updatedAt ?? null };
}
