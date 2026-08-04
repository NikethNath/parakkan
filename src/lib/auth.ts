import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const COOKIE = "hpcl_session";
// Sessions are short, and absolute — not extended by activity, so a login left
// open always dies on its own. The outlet shares one phone between staff, and a
// session that outlived a shift meant the next person's sheet was filed under
// the previous person's name. Employees get one shift's worth; admin and the
// read-only accountant get a little longer for desk work, but not a workday.
const EMPLOYEE_MAX_AGE = 60 * 60 * 2; // 2 hours
const STAFF_MAX_AGE = 60 * 60 * 3; // 3 hours — admin + accountant

export const sessionMaxAge = (role: Role): number =>
  role === "EMPLOYEE" ? EMPLOYEE_MAX_AGE : STAFF_MAX_AGE;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  uid: number;
  role: Role;
  name: string;
  username: string;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const maxAge = sessionMaxAge(user.role);
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      uid: Number(payload.uid),
      role: payload.role as Role,
      name: String(payload.name),
      username: String(payload.username),
    };
  } catch {
    return null;
  }
}

/** Server-component guard: ensures a logged-in user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Where each role lands after login (and when bounced off a page it can't see). */
export function homeFor(role: Role): string {
  return role === "ADMIN" ? "/admin" : role === "ACCOUNTANT" ? "/accounts" : "/employee";
}

/** Server-component guard: ensures an ADMIN or redirects. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect(homeFor(user.role));
  return user;
}

/** Server-component guard for the accounts area: ACCOUNTANT (or an ADMIN
 *  having a look) — everyone else is sent to their own home. */
export async function requireAccountant(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ACCOUNTANT" && user.role !== "ADMIN") redirect(homeFor(user.role));
  return user;
}
