import { dataSources, sourceSummary } from "../../../lib/data-sources";

export async function GET() {
  return Response.json(
    { sources: dataSources, meta: sourceSummary() },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
