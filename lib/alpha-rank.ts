import type { SuitabilityAnalysis, SuitabilityProfile } from "./suitability";

export const ALPHA_RANK_MINIMUM_LABELS = 40;
export const ALPHA_RANK_CATEGORY_MINIMUM_LABELS = 30;
export const ALPHA_RANK_SERVING_METHOD = "alpha-rank-hybrid-v3" as const;
export const ALPHA_RANK_FEATURES = ["landAndCrop", "electricity", "water", "logistics", "confidence"] as const;

export type AlphaRankCategory = Exclude<SuitabilityProfile["category"], "">;
export type AlphaRankFeature = (typeof ALPHA_RANK_FEATURES)[number];
export type AlphaRankFeatureVector = Record<AlphaRankFeature, number>;
export type AlphaRankWeights = Record<AlphaRankFeature, number>;
export type AlphaRankMethod = "pairwise-logistic-ranker" | "hybrid-pairwise-ranker-v3";

type AlphaRankCategoryMetric = {
  labels: number;
  usableLabels?: number;
  validationAccuracy: number;
  baselineAccuracy?: number;
  reliability?: number;
};

export type AlphaRankModel = {
  id: string;
  version: number;
  method: AlphaRankMethod;
  labelCount: number;
  validationAccuracy: number;
  trainedAt: string;
  weights: {
    global: AlphaRankWeights;
    categories: Partial<Record<AlphaRankCategory, AlphaRankWeights>>;
  };
  categoryMetrics: Partial<Record<AlphaRankCategory, AlphaRankCategoryMetric>>;
};

export type AlphaRankStatus = {
  status: "collecting" | "active";
  labelCount: number;
  minimumLabels: number;
  categoryLabelCounts: Partial<Record<AlphaRankCategory, number>>;
  servingMethod: typeof ALPHA_RANK_SERVING_METHOD;
  model: AlphaRankModel | null;
  warning?: string;
};

export type AlphaRankTrainingLabel = {
  category: AlphaRankCategory;
  leftFeatures: AlphaRankFeatureVector;
  rightFeatures: AlphaRankFeatureVector;
  winner: "left" | "right";
};

const GLOBAL_PRIOR: AlphaRankWeights = {
  landAndCrop: 0.5,
  electricity: 0.24,
  water: 0.14,
  logistics: 0.08,
  confidence: 0.04,
};

const CATEGORY_PRIORS: Record<AlphaRankCategory, AlphaRankWeights> = {
  agriculture: {
    landAndCrop: 0.56,
    electricity: 0.14,
    water: 0.24,
    logistics: 0.02,
    confidence: 0.04,
  },
  manufacturing: {
    landAndCrop: 0.46,
    electricity: 0.32,
    water: 0.08,
    logistics: 0.1,
    confidence: 0.04,
  },
  logistics: {
    landAndCrop: 0.37,
    electricity: 0.24,
    water: 0.04,
    logistics: 0.31,
    confidence: 0.04,
  },
  energy: {
    landAndCrop: 0.6,
    electricity: 0.31,
    water: 0.01,
    logistics: 0.04,
    confidence: 0.04,
  },
  other: {
    landAndCrop: 0.45,
    electricity: 0.3,
    water: 0.09,
    logistics: 0.1,
    confidence: 0.06,
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampScore(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function normalizeWeights(weights: AlphaRankWeights, floor = 0.005): AlphaRankWeights {
  const total = ALPHA_RANK_FEATURES.reduce((sum, key) => sum + Math.max(floor, weights[key]), 0);
  return Object.fromEntries(ALPHA_RANK_FEATURES.map((key) => [key, Math.max(floor, weights[key]) / total])) as AlphaRankWeights;
}

function mixWeights(prior: AlphaRankWeights, learned: AlphaRankWeights, reliability: number): AlphaRankWeights {
  return normalizeWeights(Object.fromEntries(
    ALPHA_RANK_FEATURES.map((key) => [key, prior[key] * (1 - reliability) + learned[key] * reliability]),
  ) as AlphaRankWeights);
}

export function categoryPrior(category: AlphaRankCategory): AlphaRankWeights {
  return { ...CATEGORY_PRIORS[category] };
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

function legacyReliability(metric: AlphaRankCategoryMetric) {
  const evidence = Math.min(0.7, metric.labels / (metric.labels + 100));
  const quality = clamp((metric.validationAccuracy - 52) / 30, 0, 1);
  return evidence * quality * 0.85;
}

export function effectiveAlphaRankWeights(model: AlphaRankModel, category: AlphaRankCategory) {
  const prior = CATEGORY_PRIORS[category];
  const learned = model.weights.categories[category];
  const metric = model.categoryMetrics[category];
  if (!learned || !metric || metric.labels < ALPHA_RANK_CATEGORY_MINIMUM_LABELS) {
    return { weights: { ...prior }, reliability: 0 };
  }
  const reliability = clamp(metric.reliability ?? legacyReliability(metric), 0, 0.7);
  return { weights: mixWeights(prior, learned, reliability), reliability };
}

function scoreCap(analysis: SuitabilityAnalysis) {
  if (analysis.constraints.some((item) => item.blocking && item.code === "water_far")) return 49;
  if (analysis.constraints.some((item) => item.blocking)) return 54;
  return 100;
}

export function scoreWithAlphaRank(
  analysis: SuitabilityAnalysis,
  category: SuitabilityProfile["category"],
  model: AlphaRankModel | null,
) {
  if (!model || !category) return analysis.score;
  const vector = featureVectorFromAnalysis(analysis);
  const learned = model.weights.categories[category];
  const { reliability } = effectiveAlphaRankWeights(model, category);

  // An untrained category always keeps its transparent sector formula. This
  // prevents agricultural feedback from silently changing factory rankings.
  if (!learned || reliability <= 0) return analysis.score;

  const learnedScore = ALPHA_RANK_FEATURES.reduce((sum, key) => sum + vector[key] * learned[key], 0);
  const hybridScore = analysis.score * (1 - reliability) + learnedScore * reliability;
  const dataConfidence = clamp(analysis.confidence / 100, 0, 1);
  const confidenceGuard = 0.55 + dataConfidence * 0.45;
  const calibratedScore = analysis.score + (hybridScore - analysis.score) * confidenceGuard;
  return clampScore(Math.min(calibratedScore, scoreCap(analysis)));
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

function usefulLabels(labels: AlphaRankTrainingLabel[]) {
  const signalCounts = new Map<string, number>();
  return labels.filter((label) => {
    const difference = trainingDifference(label);
    const totalSignal = ALPHA_RANK_FEATURES.reduce((sum, key) => sum + Math.abs(difference[key]), 0);
    if (totalSignal < 0.06) return false;
    const signature = ALPHA_RANK_FEATURES.map((key) => Math.round(difference[key] * 50)).join("|");
    const count = signalCounts.get(signature) ?? 0;
    signalCounts.set(signature, count + 1);
    return count < 3;
  });
}

function accuracy(weights: AlphaRankWeights, labels: AlphaRankTrainingLabel[]) {
  if (!labels.length) return 0;
  const correct = labels.reduce((sum, label) => {
    const margin = dot(weights, trainingDifference(label));
    return sum + (Math.abs(margin) < 1e-9 ? 0.5 : margin > 0 ? 1 : 0);
  }, 0);
  return Math.round((correct / labels.length) * 1000) / 10;
}

function fitWeights(labels: AlphaRankTrainingLabel[], prior: AlphaRankWeights) {
  const examples = usefulLabels(labels);
  if (!examples.length) return { ...prior };
  let weights = { ...prior };

  // Full-batch optimisation makes the result stable when labels are inserted in
  // a different order. Regularisation keeps small datasets close to the
  // business prior instead of allowing one feature to collapse to zero.
  for (let epoch = 0; epoch < 900; epoch += 1) {
    const gradient = Object.fromEntries(ALPHA_RANK_FEATURES.map((key) => [key, 0])) as AlphaRankWeights;
    for (const label of examples) {
      const difference = trainingDifference(label);
      const margin = dot(weights, difference) * 6;
      const probability = 1 / (1 + Math.exp(-margin));
      for (const key of ALPHA_RANK_FEATURES) gradient[key] += (1 - probability) * difference[key] * 6;
    }
    const learningRate = 0.16 * (1 - epoch / 1200);
    const next = { ...weights };
    for (const key of ALPHA_RANK_FEATURES) {
      const averageGradient = gradient[key] / examples.length;
      const priorPull = (prior[key] - weights[key]) * 0.18;
      next[key] = weights[key] + learningRate * (averageGradient + priorPull);
    }
    weights = normalizeWeights(next);
  }
  return weights;
}

function crossValidatedMetrics(labels: AlphaRankTrainingLabel[], prior: AlphaRankWeights) {
  const examples = usefulLabels(labels);
  if (examples.length < 8) {
    const weights = fitWeights(examples, prior);
    return {
      weights,
      usableLabels: examples.length,
      validationAccuracy: accuracy(weights, examples),
      baselineAccuracy: accuracy(prior, examples),
    };
  }

  const folds = Math.min(5, Math.max(2, Math.floor(examples.length / 8)));
  let learnedCorrect = 0;
  let baselineCorrect = 0;
  let evaluated = 0;
  for (let fold = 0; fold < folds; fold += 1) {
    const training = examples.filter((_, index) => index % folds !== fold);
    const validation = examples.filter((_, index) => index % folds === fold);
    const foldWeights = fitWeights(training, prior);
    learnedCorrect += accuracy(foldWeights, validation) * validation.length;
    baselineCorrect += accuracy(prior, validation) * validation.length;
    evaluated += validation.length;
  }

  return {
    weights: fitWeights(examples, prior),
    usableLabels: examples.length,
    validationAccuracy: Math.round((learnedCorrect / evaluated) * 10) / 10,
    baselineAccuracy: Math.round((baselineCorrect / evaluated) * 10) / 10,
  };
}

function learnedReliability(labels: number, validationAccuracy: number, baselineAccuracy: number) {
  const evidence = Math.min(0.7, labels / (labels + 100));
  const quality = clamp((validationAccuracy - 52) / 30, 0, 1);
  const improvement = clamp(0.5 + (validationAccuracy - baselineAccuracy) / 20, 0.25, 1);
  return Math.round(evidence * quality * improvement * 1000) / 1000;
}

export function trainAlphaRank(labels: AlphaRankTrainingLabel[], id: string, version: number): AlphaRankModel {
  const globalResult = crossValidatedMetrics(labels, GLOBAL_PRIOR);
  const categories: AlphaRankModel["weights"]["categories"] = {};
  const categoryMetrics: AlphaRankModel["categoryMetrics"] = {};

  for (const category of ["agriculture", "manufacturing", "logistics", "energy", "other"] as const) {
    const categoryLabels = labels.filter((label) => label.category === category);
    if (categoryLabels.length < ALPHA_RANK_CATEGORY_MINIMUM_LABELS) continue;
    const result = crossValidatedMetrics(categoryLabels, CATEGORY_PRIORS[category]);
    categories[category] = result.weights;
    categoryMetrics[category] = {
      labels: categoryLabels.length,
      usableLabels: result.usableLabels,
      validationAccuracy: result.validationAccuracy,
      baselineAccuracy: result.baselineAccuracy,
      reliability: learnedReliability(result.usableLabels, result.validationAccuracy, result.baselineAccuracy),
    };
  }

  return {
    id,
    version,
    method: "hybrid-pairwise-ranker-v3",
    labelCount: labels.length,
    validationAccuracy: globalResult.validationAccuracy,
    trainedAt: new Date().toISOString(),
    weights: { global: globalResult.weights, categories },
    categoryMetrics,
  };
}
