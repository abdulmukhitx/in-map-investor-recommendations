import { analyzeSuitability, type SuitabilityCell, type SuitabilityMetadata, type SuitabilityProfile } from "../../../lib/suitability";

type RequestBody = {
  cell?: SuitabilityCell;
  profile?: SuitabilityProfile;
  metadata?: SuitabilityMetadata;
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.cell || !body.profile || !body.metadata?.normalization_percentiles) {
    return Response.json({ error: "cell, profile and normalization metadata are required" }, { status: 400 });
  }
  return Response.json(analyzeSuitability(body.cell, body.profile, body.metadata), { headers: { "Cache-Control": "no-store" } });
}
