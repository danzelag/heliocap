export function googleMapsServerKey() {
  return (
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_SOLAR_API_KEY?.trim() ||
    ""
  );
}

export function googleSolarApiKey() {
  return (
    process.env.GOOGLE_SOLAR_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export function googleMapsBrowserKey() {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim() ||
    process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export function requireGoogleMapsServerKey() {
  const key = googleMapsServerKey();
  if (!key) {
    throw new Error("GOOGLE_MAPS_SERVER_API_KEY or GOOGLE_MAPS_API_KEY is not configured.");
  }
  return key;
}

export function requireGoogleSolarApiKey() {
  const key = googleSolarApiKey();
  if (!key) {
    throw new Error("GOOGLE_SOLAR_API_KEY, GOOGLE_MAPS_SERVER_API_KEY, or GOOGLE_MAPS_API_KEY is not configured.");
  }
  return key;
}

export async function googleApiError(res: Response, label: string) {
  const body = await res.text().catch(() => "");
  const detail = parseGoogleErrorDetail(body);
  return `${label} failed: ${res.status}${detail ? ` · ${detail}` : ""}`;
}

function parseGoogleErrorDetail(body: string) {
  if (!body) return "";

  try {
    const json = JSON.parse(body) as {
      error?: { status?: string; message?: string };
      status?: string;
      error_message?: string;
    };
    return [
      json.error?.status,
      json.error?.message,
      json.status,
      json.error_message,
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return body.slice(0, 420);
  }
}
