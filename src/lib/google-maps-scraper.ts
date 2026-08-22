import { isSafeOutboundUrl } from "./security-utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SEARCH_PB =
  "!1s{query}!7i20!10b1" +
  "!12m6!1m1!18b1!2m1!20e3!6m1!114b1" +
  "!17m1!3e1" +
  "!20m57!2m2!1i203!2i100!3m2!2i4!5b1" +
  "!6m6!1m2!1i86!2i86!1m2!1i408!2i240" +
  "!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3" +
  "!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2" +
  "!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0" +
  "!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20";

export interface GoogleMapsRating {
  rating: number;
  reviewCount: number | null;
  placeId: string;
  placeName: string;
  address: string | null;
  mapsUrl: string;
  website: string | null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(private|limited|ltd|pvt|llp|inc|corp|company|co|india)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(companyName: string, placeName: string): boolean {
  const left = normalizeName(companyName);
  const right = normalizeName(placeName);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftTokens = left.split(/\s+/).filter((token) => token.length > 2);
  const rightTokens = new Set(right.split(/\s+/).filter((token) => token.length > 2));
  if (leftTokens.length === 0) return false;
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  return overlap / leftTokens.length >= 0.6;
}

function buildSearchQuery(companyName: string, address?: string | null): string {
  const cityMatch = address?.match(/\b([A-Za-z][A-Za-z\s]{2,40}),\s*(?:Karnataka|Maharashtra|Tamil Nadu|Telangana|Gujarat|Delhi|West Bengal|Uttar Pradesh|Rajasthan|Kerala|Punjab|Haryana|Bihar|Madhya Pradesh|Andhra Pradesh|Odisha|Jharkhand|Assam|Goa)\b/i);
  const city = cityMatch?.[1]?.trim();
  return [companyName, city, "India"].filter(Boolean).join(" ");
}

function buildMapsUrl(placeId: string, lat?: number | null, lng?: number | null, placeName?: string): string {
  const label = encodeURIComponent(placeName ?? "place");
  if (lat && lng) {
    return `https://www.google.com/maps/place/${label}/@${lat},${lng},17z/data=!4m6!3m5!1s${encodeURIComponent(placeId)}!8m2!3d${lat}!4d${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${label}&query_place_id=${encodeURIComponent(placeId)}`;
}

function buildDetailPb(featureId: string): string {
  return (
    `!1m14!1s${featureId}` +
    `!3m9!1m3!1d5000!2d0!3d0!2m0!3m2!1i1024!2i768!4f13.1` +
    `!4m2!3d0!4d0` +
    `!13m1!2m0` +
    `!15m47!1m8!4e2!18m5!3b0!6b0!14b1!17b1!20b1!20e2!4b1` +
    `!10m1!8e3!11m1!3e1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!29b1` +
    `!30m1!2b1!36b1!43b1!52b1!55b1!56m1!1b1` +
    `!65m5!3m4!1m3!1m2!1i224!2i298` +
    `!22m1!1e81!29m0!30m6!3b1!6m1!2b1!7m1!2b1!9b1!32b1!37i771`
  );
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  if (!isSafeOutboundUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-IN,en;q=0.9",
        Referer: "https://www.google.com/maps/",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface ParsedPlace {
  placeId: string;
  placeName: string;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  website: string | null;
}

function extractWebsite(block: string): string | null {
  const match = block.match(/\/url\?q=([^&"\\]+)/);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {
    return null;
  }
  return null;
}

function parsePlacesFromMapResponse(text: string): ParsedPlace[] {
  const places: ParsedPlace[] = [];
  const seen = new Set<string>();

  const placePattern =
    /\[null,null,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\],"(0x[0-9a-f]+:0x[0-9a-f]+)","([^"]+)"/gi;

  for (const match of text.matchAll(placePattern)) {
    const placeId = match[3];
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    const start = Math.max(0, match.index! - 700);
    const end = Math.min(text.length, match.index! + 900);
    const block = text.slice(start, end);
    const ratingMatch = block.match(/\[null,null,null,null,null,null,null,(\d+(?:\.\d+)?)\]/);
    const addressMatch = block.match(/"([^"]{20,200})"\s*,null,null,null,null,null,\[\[\[/);

    places.push({
      placeId,
      placeName: match[4],
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      reviewCount: null,
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
      address: addressMatch?.[1] ?? null,
      website: extractWebsite(block),
    });
  }

  if (places.length > 0) return places;

  const fallbackPattern = /"(0x[0-9a-f]+:0x[0-9a-f]+)","([^"]{2,120})"/gi;
  for (const match of text.matchAll(fallbackPattern)) {
    const placeId = match[1];
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    const start = Math.max(0, match.index! - 700);
    const end = Math.min(text.length, match.index! + 900);
    const block = text.slice(start, end);
    const ratingMatch = block.match(/\[null,null,null,null,null,null,null,(\d+(?:\.\d+)?)\]/);
    const coordMatch = block.match(/\[null,null,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/);

    places.push({
      placeId,
      placeName: match[2],
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      reviewCount: null,
      lat: coordMatch ? parseFloat(coordMatch[1]) : null,
      lng: coordMatch ? parseFloat(coordMatch[2]) : null,
      address: null,
      website: extractWebsite(block),
    });
  }

  return places;
}

async function fetchMapSearchResults(query: string): Promise<ParsedPlace[]> {
  const pb = SEARCH_PB.replace("{query}", encodeURIComponent(query));
  const url = `https://www.google.com/search?tbm=map&hl=en&gl=in&q=${encodeURIComponent(query)}&pb=${encodeURIComponent(pb)}`;
  const text = await fetchText(url, 15000);
  if (!text || !text.includes(")]}'")) return [];
  return parsePlacesFromMapResponse(text);
}

async function fetchPlaceDetails(featureId: string): Promise<ParsedPlace | null> {
  const pb = buildDetailPb(featureId);
  const url = `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  const text = await fetchText(url, 15000);
  if (!text || !text.includes(")]}'")) return null;
  return parsePlacesFromMapResponse(text).find((place) => place.placeId === featureId) ?? null;
}

function pickBestPlace(places: ParsedPlace[], companyName: string): ParsedPlace | null {
  const ranked = places
    .map((place) => {
      let score = 0;
      if (namesMatch(companyName, place.placeName)) score += 5;
      if (place.rating !== null) score += 2;
      if (place.address) score += 1;
      if (place.website) score += 1;
      return { place, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score ? ranked[0].place : places[0] ?? null;
}

export async function fetchGoogleMapsRating(
  companyName: string,
  address?: string | null
): Promise<GoogleMapsRating | null> {
  const query = buildSearchQuery(companyName, address);
  let places = await fetchMapSearchResults(query);
  if (places.length === 0 && address) {
    places = await fetchMapSearchResults(`${companyName} ${address}`);
  }
  if (places.length === 0) {
    places = await fetchMapSearchResults(companyName);
  }

  let place = pickBestPlace(places, companyName);
  if (!place) return null;

  if (place.rating === null) {
    const detailed = await fetchPlaceDetails(place.placeId);
    if (detailed) {
      place = { ...place, ...detailed, placeName: detailed.placeName || place.placeName };
    }
  }

  if (place.rating === null || place.rating < 1 || place.rating > 5) return null;

  return {
    rating: place.rating,
    reviewCount: place.reviewCount,
    placeId: place.placeId,
    placeName: place.placeName,
    address: place.address,
    mapsUrl: buildMapsUrl(place.placeId, place.lat, place.lng, place.placeName),
    website: place.website,
  };
}
