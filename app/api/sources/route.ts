import { dataSources, sourceSummary } from "../../../lib/data-sources";

export async function GET() {
  const sources = dataSources.map((source) => {
    if (source.id === "egov-free-land" && process.env.EGOV_API_KEY) return {
      ...source,
      status: "connected" as const,
      access: "Official API connected; records are validated before display",
    };
    if (source.id === "inmap-business-api" && process.env.INMAP_API_TOKEN) return {
      ...source,
      status: "connected" as const,
      access: "Server-side Bearer API connected; token is never sent to the browser",
    };
    return source;
  });
  return Response.json(
    { sources, meta: { ...sourceSummary(), connected: sources.filter((source) => source.status === "connected").length } },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
