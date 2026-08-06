import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEcosystem, applyEcosystemBonus, type EcosystemFeature } from "../lib/ecosystem";

const profile = {
  category: "manufacturing" as const,
  productKey: "factory",
  customProduct: "завод строительных материалов",
};

function feature(overrides: Partial<EcosystemFeature> = {}): EcosystemFeature {
  return {
    id: "project-1",
    kind: "project",
    name: "Завод строительных материалов",
    latitude: 43.3,
    longitude: 68.4,
    locationPrecision: "exact",
    district: "Сауранский район",
    address: null,
    category: "Промышленность",
    status: "Реализация",
    description: null,
    organization: "ТОО Тест",
    investment: 1_000_000_000,
    jobs: 50,
    sourceUrl: "https://in-map.kz",
    contactName: null,
    contactRole: null,
    phone: null,
    website: null,
    ...overrides,
  };
}

test("nearby matching businesses strengthen the ecosystem signal", () => {
  const nearby = analyzeEcosystem(43.3, 68.4, profile, [feature()]);
  const distant = analyzeEcosystem(40.6, 66.1, profile, [feature()]);
  assert.ok(nearby.score > distant.score);
  assert.ok(nearby.bonus > distant.bonus);
  assert.ok(nearby.bonus <= 7);
});

test("district-only locations are weighted below exact coordinates", () => {
  const exact = analyzeEcosystem(43.3, 68.4, profile, [feature()]);
  const district = analyzeEcosystem(43.3, 68.4, profile, [feature({ locationPrecision: "district" })]);
  assert.ok(exact.score > district.score);
});

test("ecosystem bonus cannot override a blocking suitability constraint", () => {
  assert.equal(applyEcosystemBonus(53, 7, true), 54);
  assert.equal(applyEcosystemBonus(96, 7, false), 100);
});
