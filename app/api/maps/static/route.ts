import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const zoom = Number(req.nextUrl.searchParams.get("zoom") ?? "18");
  const size = req.nextUrl.searchParams.get("size") ?? "960x540";
  const maptype = req.nextUrl.searchParams.get("maptype") ?? "satellite";
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!key) {
    return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not configured" }, { status: 500 });
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(Math.max(1, Math.min(21, zoom))),
    size,
    maptype,
    scale: "2",
    key,
  });

  const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);
  if (!res.ok) {
    return NextResponse.json({ error: `Static Maps failed: ${res.status}` }, { status: 502 });
  }

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": res.headers.get("content-type") ?? "image/png",
    },
  });
}
