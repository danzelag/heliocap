import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { googleMapsBrowserKey } from "@/lib/googleApi";

export async function GET(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const apiKey = googleMapsBrowserKey();

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
