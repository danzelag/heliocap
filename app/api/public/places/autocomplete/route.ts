import { NextRequest, NextResponse } from "next/server";
import { autocompletePlaces, googlePlacesRefererFromRequest } from "@/lib/googlePlaces";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "public-places-autocomplete", {
    limit: 40,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many address lookups. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.trim() : "";

  if (input.length < 3 || input.length > 160 || !sessionToken || sessionToken.length > 100) {
    return NextResponse.json({ error: "Enter a valid address search." }, { status: 400 });
  }

  try {
    const suggestions = await autocompletePlaces(input, sessionToken, {
      referer: googlePlacesRefererFromRequest(req),
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Places autocomplete failed" },
      { status: 502 }
    );
  }
}
