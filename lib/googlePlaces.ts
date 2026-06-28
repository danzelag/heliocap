import { googleApiError, requireGoogleMapsServerKey } from "./googleApi";

export interface PlaceSuggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  streetAddress: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
  isStreetAddress: boolean;
  displayName: string;
  types: string[];
  suggestedIndustry: string | null;
}

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type AutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type PlacePrediction = NonNullable<NonNullable<AutocompleteResponse["suggestions"]>[number]["placePrediction"]>;
type GooglePlacesRequestOptions = {
  referer?: string;
};

const PLACES_BASE_URL = "https://places.googleapis.com/v1";

function getGoogleMapsApiKey() {
  return requireGoogleMapsServerKey();
}

export async function autocompletePlaces(
  input: string,
  sessionToken: string,
  options: GooglePlacesRequestOptions = {}
): Promise<PlaceSuggestion[]> {
  if (input.trim().length < 3) return [];

  const res = await fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: "POST",
    headers: googlePlacesHeaders(
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      options,
      true
    ),
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: "en",
      regionCode: "ca",
      includedRegionCodes: ["ca"],
    }),
  });

  if (!res.ok) {
    throw new Error(await googleApiError(res, "Places autocomplete"));
  }

  const json = (await res.json()) as AutocompleteResponse;

  return (json.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is PlacePrediction => Boolean(prediction))
    .map((prediction) => ({
      placeId: prediction.placeId ?? "",
      text: prediction.text?.text ?? "",
      mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((suggestion): suggestion is PlaceSuggestion => Boolean(suggestion.placeId && suggestion.text));
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
  options: GooglePlacesRequestOptions = {}
): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    languageCode: "en",
    regionCode: "ca",
  });
  if (sessionToken) params.set("sessionToken", sessionToken);

  const res = await fetch(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}?${params.toString()}`, {
    headers: googlePlacesHeaders("id,formattedAddress,addressComponents,location,displayName,types", options),
  });

  if (!res.ok) {
    throw new Error(await googleApiError(res, "Place details"));
  }

  const json = await res.json();
  const components = (json.addressComponents ?? []) as AddressComponent[];
  const streetNumber = component(components, "street_number");
  const route = component(components, "route");
  const city =
    component(components, "locality") ||
    component(components, "sublocality") ||
    component(components, "administrative_area_level_2");
  const province = component(components, "administrative_area_level_1", true);
  const lat = json.location?.latitude;
  const lng = json.location?.longitude;
  const types = Array.isArray(json.types)
    ? json.types.filter((type: unknown): type is string => typeof type === "string")
    : [];

  if (!json.id || !json.formattedAddress || typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("Place details response missing address or location");
  }

  return {
    placeId: json.id,
    formattedAddress: json.formattedAddress,
    streetAddress: [streetNumber, route].filter(Boolean).join(" ") || json.formattedAddress,
    city: city || "",
    province: province || "",
    lat,
    lng,
    isStreetAddress: Boolean(streetNumber && route),
    displayName: typeof json.displayName?.text === "string" ? json.displayName.text : "",
    types,
    suggestedIndustry: suggestIndustry(types, json.displayName?.text),
  };
}

function suggestIndustry(types: string[], displayName?: string) {
  const haystack = `${types.join(" ")} ${displayName ?? ""}`.toLowerCase().replace(/_/g, " ");

  const matches: Array<[string, string[]]> = [
    ["Cold storage", ["cold storage", "refrigerated", "freezer"]],
    ["Warehouse", ["warehouse", "storage", "self storage", "moving", "logistics", "distribution"]],
    ["Manufacturing", ["manufacturing", "factory", "industrial", "machining", "fabrication", "plant"]],
    ["Food processing", ["food processing", "food manufacturer", "bakery", "brewery", "distillery"]],
    ["Retail", ["store", "shopping", "supermarket", "grocery", "retail"]],
    ["Automotive", ["car dealer", "auto", "automotive", "truck", "vehicle repair"]],
    ["Healthcare", ["hospital", "medical", "clinic", "health"]],
    ["Office", ["office", "corporate", "business center"]],
    ["Hospitality", ["hotel", "lodging", "restaurant"]],
    ["School", ["school", "university", "college"]],
  ];

  return matches.find(([, tokens]) => tokens.some((token) => haystack.includes(token)))?.[0] ?? null;
}

function component(
  components: AddressComponent[],
  type: string,
  preferShort = false
) {
  const match = components.find((item) => item.types?.includes(type));
  return preferShort ? match?.shortText ?? match?.longText ?? "" : match?.longText ?? match?.shortText ?? "";
}

function googlePlacesHeaders(
  fieldMask: string,
  options: GooglePlacesRequestOptions,
  includeJson = false
) {
  const headers: Record<string, string> = {
    "X-Goog-Api-Key": getGoogleMapsApiKey(),
    "X-Goog-FieldMask": fieldMask,
  };
  if (includeJson) headers["Content-Type"] = "application/json";

  const referer = normalizeReferer(options.referer);
  if (referer) headers.Referer = referer;

  return headers;
}

export function googlePlacesRefererFromRequest(req: Request) {
  return req.headers.get("referer") ?? req.headers.get("origin") ?? undefined;
}

function normalizeReferer(value?: string) {
  const referer = value?.trim();
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    return url.toString();
  } catch {
    return undefined;
  }
}
