import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ADMIN_COOKIE = "amberfield_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function adminAuthConfigured() {
  return Boolean(
    adminEmail() &&
      (adminPassword() ||
        (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim())) &&
      sessionSecret()
  );
}

export async function hasAdminSession() {
  const cookieStore = await cookies();
  return isValidAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function requireAdminPage() {
  if (!adminAuthConfigured() || !(await hasAdminSession())) {
    redirect("/login?next=/admin");
  }
}

export function requireAdminApi(req: NextRequest) {
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "Admin login is not configured." }, { status: 503 });
  }

  if (!isValidAdminSession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export type AdminCredentialCheck =
  | { ok: true; provider: "env" | "supabase" }
  | { ok: false; reason: "invalid_credentials" | "supabase_auth_unavailable" | "supabase_auth_failed" };

export async function verifyAdminCredentials(email: string, password: string): Promise<AdminCredentialCheck> {
  const normalizedEmail = email.trim().toLowerCase();
  const expectedEmail = adminEmail();
  if (!expectedEmail || !password || !safeEqual(normalizedEmail, expectedEmail)) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const legacyPassword = adminPassword();
  if (legacyPassword && safeEqual(password, legacyPassword)) {
    return { ok: true, provider: "env" };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    return { ok: false, reason: "supabase_auth_unavailable" };
  }

  const { data, error } = await supabase().auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error || !data.user?.email) {
    return { ok: false, reason: "supabase_auth_failed" };
  }

  if (!safeEqual(data.user.email.trim().toLowerCase(), expectedEmail)) {
    return { ok: false, reason: "invalid_credentials" };
  }

  return { ok: true, provider: "supabase" };
}

export function createAdminSessionCookie() {
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `v1.${expires}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

export function setAdminSessionCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, createAdminSessionCookie(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function isValidAdminSession(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 5) return false;

  const signature = parts.pop();
  const payload = parts.join(".");
  const expires = Number(parts[1]);
  if (!signature || !Number.isFinite(expires) || expires <= Date.now()) return false;
  return safeEqual(signature, sign(payload));
}

function sign(value: string) {
  const secret = sessionSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

function adminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}
