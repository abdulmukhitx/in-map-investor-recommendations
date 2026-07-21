function firstArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["data", "items", "result", "records"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

export async function GET() {
  const source = {
    title: "Free land in Turkistan Region",
    sourceUrl: "https://data.egov.kz/datasets/view?index=turkistan_oblysy_boiynsha_bos_",
    api: "https://data.egov.kz/api/v4/turkistan_oblysy_boiynsha_bos_/v14",
    limitation: "The official dataset contains text locations and areas, not cadastral parcel polygons.",
  };
  const apiKey = process.env.EGOV_API_KEY;
  if (!apiKey) {
    return Response.json({ records: [], meta: { ...source, status: "credentials_required" } }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const endpoint = new URL(source.api);
    endpoint.searchParams.set("apiKey", apiKey);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Open Data API returned ${response.status}`);
    const payload = await response.json();
    return Response.json({ records: firstArray(payload).slice(0, 500), meta: { ...source, status: "connected" } }, { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (error) {
    return Response.json({ records: [], meta: { ...source, status: "unavailable", error: error instanceof Error ? error.message : "Dataset unavailable" } }, { status: 502 });
  }
}
