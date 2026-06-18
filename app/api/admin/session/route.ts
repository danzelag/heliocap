import { NextRequest, NextResponse } from "next/server";
import {
  adminAuthConfigured,
  clearAdminSessionCookie,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = stringValue(form.get("email"));
  const password = stringValue(form.get("password"));
  const next = safeNext(stringValue(form.get("next")) || "/admin");

  if (!adminAuthConfigured()) {
    return NextResponse.redirect(new URL(`/login?error=not_configured&next=${encodeURIComponent(next)}`, req.url), 303);
  }

  const result = await verifyAdminCredentials(email, password);
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(result.reason)}&next=${encodeURIComponent(next)}`, req.url),
      303
    );
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  setAdminSessionCookie(res);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearAdminSessionCookie(res);
  return res;
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}
