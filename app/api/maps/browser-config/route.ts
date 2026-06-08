import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

  return NextResponse.json(
    {
      apiKey,
      earthEnabled: Boolean(apiKey),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    }
  );
}
