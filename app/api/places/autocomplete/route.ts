import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { autocompletePlaces } from "@/lib/googlePlaces";

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { input, sessionToken } = await req.json();

  if (typeof input !== "string" || typeof sessionToken !== "string") {
    return NextResponse.json({ error: "input and sessionToken are required" }, { status: 400 });
  }

  try {
    const suggestions = await autocompletePlaces(input, sessionToken);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Places autocomplete failed" },
      { status: 502 }
    );
  }
}
