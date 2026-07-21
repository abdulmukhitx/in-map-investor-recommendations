import { getCatalog } from "../../../lib/catalog-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
  const sector = url.searchParams.get("sector") ?? "All";
  const officialOnly = url.searchParams.get("official") === "true";
  const minScore = Number(url.searchParams.get("minScore") ?? "0");
  const { sites, storage, warning } = await getCatalog();

  const filtered = sites
    .filter((site) => sector === "All" || site.sector === sector)
    .filter((site) => !officialOnly || site.evidenceLevel === "official")
    .filter((site) => site.baseScore >= (Number.isFinite(minScore) ? minScore : 0))
    .filter((site) => {
      if (!query) return true;
      const haystack = `${site.name} ${site.district} ${site.sector} ${site.materials.join(" ")} ${site.bestFor.join(" ")} ${site.searchTerms}`.toLowerCase();
      return query.split(/\s+/).every((term) => haystack.includes(term));
    })
    .sort((a, b) => b.baseScore - a.baseScore);

  return Response.json(
    {
      sites: filtered,
      meta: {
        storage,
        warning: warning ? "Database is warming up; curated source records were served." : null,
        total: sites.length,
        returned: filtered.length,
        officialRecords: sites.filter((site) => site.evidenceLevel === "official").length,
        generatedAt: new Date().toISOString(),
      },
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}

