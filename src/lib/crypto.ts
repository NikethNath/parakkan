import crypto from "crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest (the CRIS portal
 * credentials). The 32-byte key comes from env SECRET_KEY (hex). Output format
 * is `iv:authTag:ciphertext`, all hex.
 *
 * NEVER log the plaintext or the key.
 */

function getKey(): Buffer {
  const hex = process.env.SECRET_KEY ?? "";
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "SECRET_KEY must be 32 bytes as 64 hex chars (generate: openssl rand -hex 32)",
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed ciphertext");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
