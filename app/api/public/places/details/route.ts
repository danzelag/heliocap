import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails, googlePlacesRefererFromRequest } from "@/lib/googlePlaces";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "public-places-details", {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many address verifications. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.trim() : undefined;

  if (!placeId || placeId.length > 220) {
    return NextResponse.json({ error: "Choose a valid address result." }, { status: 400 });
  }

  try {
    const place = await getPlaceDetails(placeId, sessionToken, {
      referer: googlePlacesRefererFromRequest(req),
    });
    return NextResponse.json({ place });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Place details failed" },
      { status: 502 }
    );
  }
}
