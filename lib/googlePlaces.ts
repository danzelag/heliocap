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

const PLACES_BASE_URL = "https://places.googleapis.com/v1";

function getGoogleMapsApiKey() {
  return requireGoogleMapsServerKey();
}

export async function autocompletePlaces(
  input: string,
  sessionToken: string
): Promise<PlaceSuggestion[]> {
  if (input.trim().length < 3) return [];

  const res = await fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
    },
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
  sessionToken?: string
): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    languageCode: "en",
    regionCode: "ca",
  });
  if (sessionToken) params.set("sessionToken", sessionToken);

  const res = await fetch(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}?${params.toString()}`, {
    headers: {
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
      "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location,displayName,types",
    },
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
  };
}

function component(
  components: AddressComponent[],
  type: string,
  preferShort = false
) {
  const match = components.find((item) => item.types?.includes(type));
  return preferShort ? match?.shortText ?? match?.longText ?? "" : match?.longText ?? match?.shortText ?? "";
}
