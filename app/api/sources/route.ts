import { dataSources, sourceSummary } from "../../../lib/data-sources";

export async function GET() {
  const sources = dataSources.map((source) => source.id === "egov-free-land" && process.env.EGOV_API_KEY
    ? {
      ...source,
      status: "connected" as const,
      access: "Official API connected; records are validated before display",
    }
    : source);
  return Response.json(
    { sources, meta: { ...sourceSummary(), connected: sources.filter((source) => source.status === "connected").length } },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
