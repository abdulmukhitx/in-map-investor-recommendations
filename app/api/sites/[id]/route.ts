import { getCatalog } from "../../../../lib/catalog-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { sites, storage } = await getCatalog();
  const site = sites.find((item) => item.id === id);
  if (!site) return Response.json({ error: "Site not found" }, { status: 404 });
  return Response.json({ site, meta: { storage, generatedAt: new Date().toISOString() } });
}

