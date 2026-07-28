import { count, desc, eq, max } from "drizzle-orm";
import { getDb } from "../db";
import { modelTrainingLabels, modelVersions } from "../db/schema";
import {
  ALPHA_RANK_MINIMUM_LABELS,
  ALPHA_RANK_SERVING_METHOD,
  type AlphaRankCategory,
  type AlphaRankFeatureVector,
  type AlphaRankModel,
  type AlphaRankStatus,
  type AlphaRankTrainingLabel,
  trainAlphaRank,
} from "./alpha-rank";

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToModel(row: typeof modelVersions.$inferSelect): AlphaRankModel | null {
  const weights = parseJson<AlphaRankModel["weights"]>(row.weightsJson);
  const metrics = parseJson<Pick<AlphaRankModel, "validationAccuracy" | "categoryMetrics">>(row.metricsJson);
  if (!weights || !metrics) return null;
  return {
    id: row.id,
    version: row.version,
    method: row.method === "hybrid-pairwise-ranker-v3" ? "hybrid-pairwise-ranker-v3" : "pairwise-logistic-ranker",
    labelCount: row.labelCount,
    validationAccuracy: metrics.validationAccuracy,
    trainedAt: row.createdAt.toISOString(),
    weights,
    categoryMetrics: metrics.categoryMetrics,
  };
}

export async function getAlphaRankStatus(): Promise<AlphaRankStatus> {
  try {
    const db = await getDb();
    const [{ total }] = await db.select({ total: count() }).from(modelTrainingLabels);
    const categoryRows = await db
      .select({ category: modelTrainingLabels.category, total: count() })
      .from(modelTrainingLabels)
      .groupBy(modelTrainingLabels.category);
    const categoryLabelCounts = Object.fromEntries(
      categoryRows.map((row) => [row.category, Number(row.total)]),
    ) as Partial<Record<AlphaRankCategory, number>>;
    const [activeRow] = await db.select().from(modelVersions).where(eq(modelVersions.status, "active")).orderBy(desc(modelVersions.version)).limit(1);
    const model = activeRow ? rowToModel(activeRow) : null;
    return {
      status: model ? "active" : "collecting",
      labelCount: Number(total),
      minimumLabels: ALPHA_RANK_MINIMUM_LABELS,
      categoryLabelCounts,
      servingMethod: ALPHA_RANK_SERVING_METHOD,
      model,
    };
  } catch (error) {
    return {
      status: "collecting",
      labelCount: 0,
      minimumLabels: ALPHA_RANK_MINIMUM_LABELS,
      categoryLabelCounts: {},
      servingMethod: ALPHA_RANK_SERVING_METHOD,
      model: null,
      warning: error instanceof Error ? error.message : "Model storage unavailable",
    };
  }
}

export async function trainAndActivateAlphaRank(expertEmail: string) {
  const db = await getDb();
  const rows = await db.select().from(modelTrainingLabels).orderBy(modelTrainingLabels.createdAt);
  const labels = rows.flatMap((row): AlphaRankTrainingLabel[] => {
    const leftFeatures = parseJson<AlphaRankFeatureVector>(row.leftFeaturesJson);
    const rightFeatures = parseJson<AlphaRankFeatureVector>(row.rightFeaturesJson);
    if (!leftFeatures || !rightFeatures || (row.winner !== "left" && row.winner !== "right")) return [];
    return [{ category: row.category as AlphaRankTrainingLabel["category"], leftFeatures, rightFeatures, winner: row.winner }];
  });
  if (labels.length < ALPHA_RANK_MINIMUM_LABELS) {
    throw new Error(`Need at least ${ALPHA_RANK_MINIMUM_LABELS} verified comparisons`);
  }

  const [{ latest }] = await db.select({ latest: max(modelVersions.version) }).from(modelVersions);
  const version = Number(latest ?? 0) + 1;
  const id = `alpha-rank-v${version}-${Date.now()}`;
  const model = trainAlphaRank(labels, id, version);
  await db.update(modelVersions).set({ status: "archived" }).where(eq(modelVersions.status, "active"));
  await db.insert(modelVersions).values({
    id,
    version,
    status: "active",
    method: model.method,
    weightsJson: JSON.stringify(model.weights),
    metricsJson: JSON.stringify({ validationAccuracy: model.validationAccuracy, categoryMetrics: model.categoryMetrics }),
    labelCount: model.labelCount,
    trainedByEmail: expertEmail,
    createdAt: new Date(model.trainedAt),
  });
  return model;
}
