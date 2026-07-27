import { getAlphaRankStatus } from "../../../../lib/model-service";

export async function GET() {
  return Response.json(await getAlphaRankStatus(), { headers: { "Cache-Control": "no-store" } });
}

