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

export async function crisStatus(): Promise<{ configured: boolean; updatedAt: Date | null }> {
  const c = await prisma.crisCredential.findFirst();
  return { configured: !!c, updatedAt: c?.updatedAt ?? null };
}
