type PowerResponse = {
  properties?: { parameter?: Record<string, Record<string, number | string>> };
  header?: { title?: string };
};

function annual(parameters: Record<string, Record<string, number | string>>, key: string) {
  const value = Number(parameters[key]?.ANN);
  return Number.isFinite(value) && value > -900 ? value : null;
}

function annualSolarKwh(parameters: Record<string, Record<string, number | string>>) {
  const valueMj = annual(parameters, "ALLSKY_SFC_SW_DWN");
  return valueMj === null ? null : Number((valueMj / 3.6).toFixed(3));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 39.5 || lat > 46.5 || lon < 65 || lon > 72) {
    return Response.json({ error: "Coordinates are outside the supported region" }, { status: 400 });
  }

  const endpoint = new URL("https://power.larc.nasa.gov/api/temporal/climatology/point");
  endpoint.search = new URLSearchParams({
    parameters: "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,WS10M",
    community: "AG",
    longitude: lon.toFixed(5),
    latitude: lat.toFixed(5),
    format: "JSON",
  }).toString();

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`NASA POWER returned ${response.status}`);
    const payload = await response.json() as PowerResponse;
    const parameters = payload.properties?.parameter ?? {};
    return Response.json({
      climate: {
        temperatureC: annual(parameters, "T2M"),
        precipitationMmDay: annual(parameters, "PRECTOTCORR"),
        solarKwhM2Day: annualSolarKwh(parameters),
        windMs: annual(parameters, "WS10M"),
      },
      meta: {
        source: "NASA POWER Climatology API",
        sourceUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/",
        period: "2001–2020 climatology",
        units: {
          temperatureC: "°C",
          precipitationMmDay: "mm/day",
          solarKwhM2Day: "kWh/m²/day",
          windMs: "m/s",
        },
        limitation: "Climatological context, not a local station measurement or forecast.",
      },
    }, { headers: { "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Climate service unavailable" }, { status: 502 });
  }
}
