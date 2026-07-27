import type { SuitabilityAnalysis, SuitabilityProfile } from "./suitability";

export const ALPHA_RANK_MINIMUM_LABELS = 40;
export const ALPHA_RANK_FEATURES = ["landAndCrop", "electricity", "water", "logistics", "confidence"] as const;

export type AlphaRankCategory = Exclude<SuitabilityProfile["category"], "">;
export type AlphaRankFeature = (typeof ALPHA_RANK_FEATURES)[number];
export type AlphaRankFeatureVector = Record<AlphaRankFeature, number>;
export type AlphaRankWeights = Record<AlphaRankFeature, number>;

export type AlphaRankModel = {
  id: string;
  version: number;
  method: "pairwise-logistic-ranker";
  labelCount: number;
  validationAccuracy: number;
  trainedAt: string;
  weights: {
    global: AlphaRankWeights;
    categories: Partial<Record<AlphaRankCategory, AlphaRankWeights>>;
  };
  categoryMetrics: Partial<Record<AlphaRankCategory, { labels: number; validationAccuracy: number }>>;
};

export type AlphaRankStatus = {
  status: "collecting" | "active";
  labelCount: number;
  minimumLabels: number;
  model: AlphaRankModel | null;
  warning?: string;
};

export type AlphaRankTrainingLabel = {
  category: AlphaRankCategory;
  leftFeatures: AlphaRankFeatureVector;
  rightFeatures: AlphaRankFeatureVector;
  winner: "left" | "right";
};

const INITIAL_WEIGHTS: AlphaRankWeights = {
  landAndCrop: 0.52,
  electricity: 0.24,
  water: 0.14,
  logistics: 0.06,
  confidence: 0.04,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeWeights(weights: AlphaRankWeights): AlphaRankWeights {
  const total = ALPHA_RANK_FEATURES.reduce((sum, key) => sum + Math.max(0.01, weights[key]), 0);
  return Object.fromEntries(ALPHA_RANK_FEATURES.map((key) => [key, Math.max(0.01, weights[key]) / total])) as AlphaRankWeights;
}

export function featureVectorFromAnalysis(analysis: SuitabilityAnalysis): AlphaRankFeatureVector {
  return {
    landAndCrop: analysis.components.landAndCrop,
    electricity: analysis.components.electricity,
    water: analysis.components.water,
    logistics: analysis.components.logistics,
    confidence: analysis.confidence,
  };
}

export function scoreWithAlphaRank(
  analysis: SuitabilityAnalysis,
  category: SuitabilityProfile["category"],
  model: AlphaRankModel | null,
) {
  if (!model || !category) return analysis.score;
  const vector = featureVectorFromAnalysis(analysis);
  const weights = model.weights.categories[category] ?? model.weights.global;
  const learnedScore = ALPHA_RANK_FEATURES.reduce((sum, key) => sum + vector[key] * weights[key], 0);
  let cap = 100;
  if (analysis.constraints.some((item) => item.blocking && item.code === "water_far")) cap = 49;
  else if (analysis.constraints.some((item) => item.blocking)) cap = 54;
  return clampScore(Math.min(learnedScore, cap));
}

export function statusForAlphaRankScore(score: number, analysis: SuitabilityAnalysis): SuitabilityAnalysis["status"] {
  if (score >= 75 && !analysis.constraints.some((item) => item.blocking)) return "excellent";
  if (score >= 55) return "possible";
  return "weak";
}

function dot(weights: AlphaRankWeights, difference: AlphaRankFeatureVector) {
  return ALPHA_RANK_FEATURES.reduce((sum, key) => sum + weights[key] * difference[key], 0);
}

function trainingDifference(label: AlphaRankTrainingLabel): AlphaRankFeatureVector {
  const winner = label.winner === "left" ? label.leftFeatures : label.rightFeatures;
  const loser = label.winner === "left" ? label.rightFeatures : label.leftFeatures;
  return Object.fromEntries(ALPHA_RANK_FEATURES.map((key) => [key, (winner[key] - loser[key]) / 100])) as AlphaRankFeatureVector;
}

function accuracy(weights: AlphaRankWeights, labels: AlphaRankTrainingLabel[]) {
  if (!labels.length) return 0;
  const correct = labels.filter((label) => dot(weights, trainingDifference(label)) > 0).length;
  return Math.round((correct / labels.length) * 1000) / 10;
}

function trainWeights(labels: AlphaRankTrainingLabel[]) {
  const validation = labels.filter((_, index) => index % 5 === 0);
  const training = labels.filter((_, index) => index % 5 !== 0);
  const examples = training.length ? training : labels;
  let weights = { ...INITIAL_WEIGHTS };

  for (let epoch = 0; epoch < 700; epoch += 1) {
    const learningRate = 0.09 * (1 - epoch / 900);
    for (const label of examples) {
      const difference = trainingDifference(label);
      const margin = dot(weights, difference) * 5;
      const probability = 1 / (1 + Math.exp(-margin));
      const next = { ...weights };
      for (const key of ALPHA_RANK_FEATURES) {
        const regularization = 0.025 * (weights[key] - INITIAL_WEIGHTS[key]);
        next[key] = Math.max(0.01, weights[key] + learningRate * ((1 - probability) * difference[key] * 5 - regularization));
      }
      weights = normalizeWeights(next);
    }
  }

  const evaluation = validation.length >= 3 ? validation : labels;
  return { weights, validationAccuracy: accuracy(weights, evaluation) };
}

export function trainAlphaRank(labels: AlphaRankTrainingLabel[], id: string, version: number): AlphaRankModel {
  const globalResult = trainWeights(labels);
  const categories: AlphaRankModel["weights"]["categories"] = {};
  const categoryMetrics: AlphaRankModel["categoryMetrics"] = {};

  for (const category of ["agriculture", "manufacturing", "logistics", "energy", "other"] as const) {
    const categoryLabels = labels.filter((label) => label.category === category);
    if (categoryLabels.length < 12) continue;
    const result = trainWeights(categoryLabels);
    categories[category] = result.weights;
    categoryMetrics[category] = { labels: categoryLabels.length, validationAccuracy: result.validationAccuracy };
  }

  return {
    id,
    version,
    method: "pairwise-logistic-ranker",
    labelCount: labels.length,
    validationAccuracy: globalResult.validationAccuracy,
    trainedAt: new Date().toISOString(),
    weights: { global: globalResult.weights, categories },
    categoryMetrics,
  };
}

