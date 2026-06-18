import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

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
