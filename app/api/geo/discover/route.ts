type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
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

function detailFor(tags: Record<string, string>) {
  if (tags.voltage) {
    const voltage = Math.max(...tags.voltage.split(";").map(Number).filter(Number.isFinite));
    if (Number.isFinite(voltage)) return voltage >= 1000 ? `${voltage / 1000} kV` : `${voltage} V`;
  }
  return tags.substance ?? tags.product ?? tags.industrial ?? tags.railway ?? tags.waterway ?? tags.power ?? tags.landuse ?? "Mapped public feature";
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
    way(around:${Math.round(radius)},${lat},${lng})["power"~"line|minor_line|cable"];
    way(around:${Math.round(radius)},${lat},${lng})["railway"="rail"];
    way(around:${Math.round(radius)},${lat},${lng})["waterway"~"river|canal"];
  );out tags geom;
  (
    nwr(around:${Math.round(radius)},${lat},${lng})["power"~"substation|plant|generator"];
    nwr(around:${Math.round(radius)},${lat},${lng})["railway"~"station|halt|yard"];
    nwr(around:${Math.round(radius)},${lat},${lng})["landuse"="industrial"];
    nwr(around:${Math.round(radius)},${lat},${lng})["landuse"="quarry"];
    nwr(around:${Math.round(radius)},${lat},${lng})["man_made"="works"];
    nwr(around:${Math.round(radius)},${lat},${lng})["natural"="water"];
  );out tags center 180;`;

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
    const mappedFeatures = (payload.elements ?? [])
      .map((element) => {
        const geometry = element.geometry?.map((item) => [item.lat, item.lon] as [number, number]);
        const geometryCenter = element.geometry?.length
          ? {
              lat: element.geometry.reduce((sum, item) => sum + item.lat, 0) / element.geometry.length,
              lon: element.geometry.reduce((sum, item) => sum + item.lon, 0) / element.geometry.length,
            }
          : null;
        const point = element.center ?? (element.lat !== undefined && element.lon !== undefined ? { lat: element.lat, lon: element.lon } : geometryCenter);
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
          detail: detailFor(tags),
          geometry,
          infrastructureType: tags.power ?? tags.railway ?? tags.waterway ?? tags.landuse ?? tags.man_made ?? tags.natural ?? kind,
          osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

    const lineFeatures = mappedFeatures.filter((feature) => feature.geometry && feature.geometry.length > 1);
    const pointFeatures = mappedFeatures.filter((feature) => !feature.geometry || feature.geometry.length <= 1);
    const nearestLines = ["power", "rail", "water"].flatMap((kind) =>
      lineFeatures
        .filter((feature) => feature.kind === kind)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 40),
    );
    const otherLines = lineFeatures
      .filter((feature) => !["power", "rail", "water"].includes(feature.kind))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);
    const features = [...nearestLines, ...otherLines, ...pointFeatures.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 60)];

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
