import { getCatalog } from "../../../lib/catalog-service";

export async function GET() {
  const { sites, storage, warning } = await getCatalog();
  return Response.json({
    status: "ok",
    database: storage,
    records: sites.length,
    liveDiscovery: "overpass",
    cadastralIntegration: "manual-link",
    warning: warning ?? null,
    checkedAt: new Date().toISOString(),
  });
}

