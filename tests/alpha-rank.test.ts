import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveAlphaRankWeights,
  scoreWithAlphaRank,
  trainAlphaRank,
  type AlphaRankFeatureVector,
  type AlphaRankModel,
  type AlphaRankTrainingLabel,
} from "../lib/alpha-rank";
import type { SuitabilityAnalysis } from "../lib/suitability";

const legacyModel: AlphaRankModel = {
  id: "legacy-v2",
  version: 2,
  method: "pairwise-logistic-ranker",
  labelCount: 42,
  validationAccuracy: 88.9,
  trainedAt: "2026-07-27T21:20:50.987Z",
  weights: {
    global: {
      landAndCrop: 0.016,
      electricity: 0.536,
      water: 0.428,
      logistics: 0.01,
      confidence: 0.01,
    },
    categories: {
      agriculture: {
        landAndCrop: 0.016,
        electricity: 0.536,
        water: 0.428,
        logistics: 0.01,
        confidence: 0.01,
      },
    },
  },
  categoryMetrics: {
    agriculture: { labels: 42, validationAccuracy: 88.9 },
  },
};

const analysis: SuitabilityAnalysis = {
  score: 80,
  confidence: 95,
  status: "excellent",
  components: {
    landAndCrop: 90,
    electricity: 10,
    water: 10,
    logistics: 72,
  },
  constraints: [],
  distances: { powerKm: 10, waterKm: 10, railKm: null },
  method: "alpha-suitability-v2",
};

test("legacy agricultural feedback is guarded and cannot erase the land signal", () => {
  const effective = effectiveAlphaRankWeights(legacyModel, "agriculture");
  assert.ok(effective.reliability > 0);
  assert.ok(effective.reliability < 0.35);
  assert.ok(effective.weights.landAndCrop > 0.4);

  const score = scoreWithAlphaRank(analysis, "agriculture", legacyModel);
  assert.ok(score >= 60);
  assert.ok(score < analysis.score);
});

test("feedback from agriculture never changes an untrained factory category", () => {
  assert.equal(scoreWithAlphaRank(analysis, "manufacturing", legacyModel), analysis.score);
});

test("hard infrastructure constraints remain authoritative", () => {
  const constrained: SuitabilityAnalysis = {
    ...analysis,
    score: 49,
    status: "weak",
    constraints: [{ code: "water_far", blocking: true, distanceKm: 32 }],
  };
  assert.ok(scoreWithAlphaRank(constrained, "agriculture", legacyModel) <= 49);
});

function features(seed: number, offset: number): AlphaRankFeatureVector {
  return {
    landAndCrop: 20 + ((seed * 17 + offset * 11) % 76),
    electricity: 15 + ((seed * 29 + offset * 7) % 81),
    water: 10 + ((seed * 37 + offset * 13) % 86),
    logistics: 18 + ((seed * 43 + offset * 17) % 78),
    confidence: 72 + ((seed * 19 + offset * 5) % 27),
  };
}

function utility(vector: AlphaRankFeatureVector) {
  return vector.landAndCrop * 0.58
    + vector.electricity * 0.14
    + vector.water * 0.22
    + vector.logistics * 0.02
    + vector.confidence * 0.04;
}

function syntheticLabels(count: number): AlphaRankTrainingLabel[] {
  return Array.from({ length: count }, (_, index) => {
    const leftFeatures = features(index + 1, 3);
    const rightFeatures = features(index + 7, 9);
    return {
      category: "agriculture",
      leftFeatures,
      rightFeatures,
      winner: utility(leftFeatures) >= utility(rightFeatures) ? "left" : "right",
    };
  });
}

test("hybrid training is stable, sector-specific and order-independent", () => {
  const labels = syntheticLabels(45);
  const forward = trainAlphaRank(labels, "forward", 3);
  const reversed = trainAlphaRank([...labels].reverse(), "reversed", 3);

  assert.equal(forward.method, "hybrid-pairwise-ranker-v3");
  assert.ok(forward.weights.categories.agriculture);
  assert.equal(forward.weights.categories.manufacturing, undefined);
  assert.ok((forward.categoryMetrics.agriculture?.reliability ?? 0) <= 0.7);

  for (const key of Object.keys(forward.weights.categories.agriculture!) as Array<keyof AlphaRankFeatureVector>) {
    assert.ok(Math.abs(
      forward.weights.categories.agriculture![key] - reversed.weights.categories.agriculture![key],
    ) < 1e-10);
  }
});

test("a category needs enough of its own examples before learning can affect rankings", () => {
  const model = trainAlphaRank(syntheticLabels(29), "small", 3);
  assert.equal(model.weights.categories.agriculture, undefined);
  assert.equal(scoreWithAlphaRank(analysis, "agriculture", model), analysis.score);
});
