import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/googlePlaces";

export async function POST(req: NextRequest) {
  const { placeId, sessionToken } = await req.json();

  if (typeof placeId !== "string") {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  try {
    const place = await getPlaceDetails(placeId, typeof sessionToken === "string" ? sessionToken : undefined);
    return NextResponse.json({ place });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Place details failed" },
      { status: 502 }
    );
  }
}
