import { type ProjectNeed, rankForProject } from "../../../lib/catalog";
import { getCatalog } from "../../../lib/catalog-service";

export async function POST(request: Request) {
  let need: ProjectNeed;
  try {
    need = (await request.json()) as ProjectNeed;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const landHa = Number(need.landHa ?? 0);
  const powerMw = Number(need.powerMw ?? 0);
  if (landHa < 0 || landHa > 2000 || powerMw < 0 || powerMw > 500) {
    return Response.json({ error: "Project requirements are outside supported limits" }, { status: 400 });
  }

  const { sites, storage } = await getCatalog();
  const recommendations = sites
    .map((site) => ({ site, ...rankForProject(site, { ...need, landHa, powerMw }) }))
    .sort((a, b) => b.score - a.score);

  return Response.json({
    recommendations,
    meta: {
      storage,
      model: "alpha-fit-v1",
      method: "Explainable weighted decision model",
      disclaimer: "Scores support screening only and do not replace cadastral, utility or environmental due diligence.",
      generatedAt: new Date().toISOString(),
    },
  });
}

