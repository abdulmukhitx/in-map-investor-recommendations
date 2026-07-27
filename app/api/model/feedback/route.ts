import { count } from "drizzle-orm";
import { getDb } from "../../../../db";
import { modelTrainingLabels } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ALPHA_RANK_FEATURES, type AlphaRankFeatureVector, type AlphaRankTrainingLabel } from "../../../../lib/alpha-rank";
import { isModelExpert } from "../../../../lib/model-auth";

type FeedbackBody = {
  category?: string;
  product?: string;
  project?: unknown;
  left?: { cellId?: string; features?: AlphaRankFeatureVector };
  right?: { cellId?: string; features?: AlphaRankFeatureVector };
  winner?: "left" | "right";
  note?: string;
};

const categories = new Set(["agriculture", "manufacturing", "logistics", "energy", "other"]);

function validFeatures(value: unknown): value is AlphaRankFeatureVector {
  if (!value || typeof value !== "object") return false;
  return ALPHA_RANK_FEATURES.every((key) => {
    const feature = (value as Record<string, unknown>)[key];
    return typeof feature === "number" && Number.isFinite(feature) && feature >= 0 && feature <= 100;
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to label training examples." }, { status: 401 });
  if (!isModelExpert(user)) return Response.json({ error: "This account is not on the model-expert allowlist." }, { status: 403 });

  let body: FeedbackBody;
  try {
    body = await request.json() as FeedbackBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.category || !categories.has(body.category) || !body.winner) {
    return Response.json({ error: "Category and winner are required." }, { status: 400 });
  }
  if (!body.left?.cellId || !body.right?.cellId || body.left.cellId === body.right.cellId) {
    return Response.json({ error: "Two different zones are required." }, { status: 400 });
  }
  if (!validFeatures(body.left.features) || !validFeatures(body.right.features)) {
    return Response.json({ error: "The feature vectors are invalid." }, { status: 400 });
  }

  try {
    const db = await getDb();
    await db.insert(modelTrainingLabels).values({
      id: crypto.randomUUID(),
      expertEmail: user.email,
      category: body.category,
      product: String(body.product ?? "").slice(0, 160),
      projectJson: JSON.stringify(body.project ?? {}),
      leftCellId: body.left.cellId,
      rightCellId: body.right.cellId,
      leftFeaturesJson: JSON.stringify(body.left.features),
      rightFeaturesJson: JSON.stringify(body.right.features),
      winner: body.winner,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : null,
      createdAt: new Date(),
    });
    const [{ total }] = await db.select({ total: count() }).from(modelTrainingLabels);
    return Response.json({ ok: true, labelCount: Number(total) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Training storage unavailable" }, { status: 503 });
  }
}

