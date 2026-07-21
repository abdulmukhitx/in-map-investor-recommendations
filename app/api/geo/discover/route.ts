type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classify(tags: Record<string, string>) {
  if (tags.power) return "power";
  if (tags.railway) return "rail";
  if (tags.landuse === "quarry" || tags.man_made === "mine" || tags.geological) return "material";
  if (tags.natural === "water" || tags.waterway || tags.landuse === "reservoir") return "water";
  return "industry";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radius = Math.max(1000, Math.min(30000, Number(url.searchParams.get("radius") ?? 20000)));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 39.5 || lat > 45 || lng < 64 || lng > 73) {
    return Response.json({ error: "Coordinates must be inside the supported southern Kazakhstan region" }, { status: 400 });
  }

  const query = `[out:json][timeout:24];(
    nwr(around:${Math.round(radius)},${lat},${lng})["power"~"substation|plant|generator"];
    nwr(around:${Math.round(radius)},${lat},${lng})["railway"~"station|halt|yard|rail"];
    nwr(around:${Math.round(radius)},${lat},${lng})["landuse"="industrial"];
    nwr(around:${Math.round(radius)},${lat},${lng})["landuse"="quarry"];
    nwr(around:${Math.round(radius)},${lat},${lng})["man_made"="works"];
    nwr(around:${Math.round(radius)},${lat},${lng})["natural"="water"];
  );out center 120;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Alpha-Turkistan-Investment-Intelligence/1.0",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(26000),
    });
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    const payload = (await response.json()) as { elements?: OverpassElement[]; osm3s?: { timestamp_osm_base?: string } };
    const features = (payload.elements ?? [])
      .map((element) => {
        const point = element.center ?? (element.lat !== undefined && element.lon !== undefined ? { lat: element.lat, lon: element.lon } : null);
        if (!point) return null;
        const tags = element.tags ?? {};
        const kind = classify(tags);
        return {
          id: `${element.type}-${element.id}`,
          kind,
          name: tags.name ?? tags["name:en"] ?? tags.operator ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1)} feature`,
          latitude: point.lat,
          longitude: point.lon,
          distanceKm: Number(distanceKm(lat, lng, point.lat, point.lon).toFixed(1)),
          detail: tags.voltage ? `${tags.voltage} V` : tags.substance ?? tags.product ?? tags.industrial ?? tags.railway ?? tags.power ?? tags.landuse ?? "Mapped public feature",
          osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 80);

    return Response.json(
      {
        features,
        meta: {
          source: "OpenStreetMap via Overpass API",
          attribution: "© OpenStreetMap contributors",
          observedAt: payload.osm3s?.timestamp_osm_base ?? new Date().toISOString(),
          radiusMeters: radius,
          disclaimer: "Discovered features are screening signals, not utility-capacity or ownership confirmations.",
        },
      },
      { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live discovery unavailable";
    return Response.json({ error: message, features: [], meta: { source: "OpenStreetMap via Overpass API", unavailable: true } }, { status: 502 });
  }
}
