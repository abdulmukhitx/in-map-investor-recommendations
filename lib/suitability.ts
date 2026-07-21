export type SuitabilityProfile = {
  category: "agriculture" | "manufacturing" | "logistics" | "energy" | "other" | "";
  productKey: string;
  customProduct: string;
  sizeHa: number;
  powerNeed: "low" | "medium" | "high";
  waterNeed: boolean;
  railNeeded: boolean;
};

export type SuitabilityCell = {
  confidence: number;
  area_km2: number;
  ndvi: number;
  ndwi: number;
  ndmi: number;
  ndbi: number;
  bsi: number;
  soy: number;
  rice: number;
  cotton: number;
  vegetables: number;
  solar: number;
  industrial_land: number;
  power_km?: number | null;
  rail_km?: number | null;
  water_km?: number | null;
};

export type SuitabilityMetadata = {
  normalization_percentiles: Record<string, { p10: number; p90: number }>;
};

export type ConstraintCode =
  | "land_unverified"
  | "power_far"
  | "power_unknown"
  | "water_far"
  | "water_unknown"
  | "rail_far"
  | "rail_unknown"
  | "parcel_size_unverified";

export type SuitabilityAnalysis = {
  score: number;
  confidence: number;
  status: "excellent" | "possible" | "weak";
  components: {
    landAndCrop: number;
    electricity: number;
    water: number;
    logistics: number;
  };
  constraints: Array<{ code: ConstraintCode; blocking: boolean; distanceKm?: number }>;
  distances: { powerKm: number | null; railKm: number | null; waterKm: number | null };
  method: "alpha-suitability-v2";
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalized(value: number, key: string, data: SuitabilityMetadata) {
  const range = data.normalization_percentiles[key];
  if (!range || range.p90 <= range.p10) return 50;
  return clamp(((value - range.p10) / (range.p90 - range.p10)) * 100);
}

function distanceScore(distance: number | null, idealKm: number, limitKm: number) {
  if (distance === null) return 30;
  if (distance <= idealKm) return 100;
  if (distance >= limitKm) return 0;
  return clamp(100 * (1 - (distance - idealKm) / (limitKm - idealKm)));
}

function kindFor(profile: SuitabilityProfile) {
  const value = `${profile.productKey} ${profile.customProduct}`.toLowerCase();
  if (/wheat|пшениц|бидай/.test(value)) return "wheat";
  if (/rice|рис|күріш/.test(value)) return "rice";
  if (/soy|соя/.test(value)) return "soy";
  if (/cotton|хлоп|мақта/.test(value)) return "cotton";
  if (/veget|овощ|теплиц|көкөніс|жылыжай/.test(value)) return "vegetables";
  if (/solar|солн|күн/.test(value)) return "solar";
  if (profile.category === "manufacturing") return "factory";
  if (profile.category === "logistics") return "logistics";
  if (profile.category === "energy") return "solar";
  return "custom";
}

export function analyzeSuitability(cell: SuitabilityCell, profile: SuitabilityProfile, data: SuitabilityMetadata): SuitabilityAnalysis {
  const kind = kindFor(profile);
  const ndvi = normalized(cell.ndvi, "ndvi", data);
  const ndwi = normalized(cell.ndwi, "ndwi", data);
  const ndmi = normalized(cell.ndmi, "ndmi", data);
  const ndbi = normalized(cell.ndbi, "ndbi", data);
  const bsi = normalized(cell.bsi, "bsi", data);
  const powerKm = finite(cell.power_km);
  const railKm = finite(cell.rail_km);
  const waterKm = finite(cell.water_km);
  const powerThresholds = profile.powerNeed === "high" ? [4, 18] : profile.powerNeed === "medium" ? [8, 28] : [15, 40];
  const electricity = distanceScore(powerKm, powerThresholds[0], powerThresholds[1]);
  const water = profile.waterNeed ? distanceScore(waterKm, kind === "rice" ? 2 : 5, kind === "rice" ? 14 : 25) : 72;
  const logistics = profile.railNeeded ? distanceScore(railKm, 8, 35) : 72;

  let landAndCrop: number;
  if (kind === "wheat") landAndCrop = clamp(ndvi * 0.4 + (100 - bsi) * 0.2 + (100 - Math.abs(ndmi - 48) * 1.4) * 0.2 + cell.confidence * 0.2);
  else if (kind === "soy") landAndCrop = clamp(cell.soy * 0.9 + ndvi * 0.1);
  else if (kind === "rice") landAndCrop = clamp(cell.rice * 0.82 + ndwi * 0.18);
  else if (kind === "cotton") landAndCrop = clamp(cell.cotton * 0.9 + (100 - Math.abs(ndmi - 42) * 1.2) * 0.1);
  else if (kind === "vegetables") landAndCrop = clamp(cell.vegetables * 0.82 + ndwi * 0.1 + ndvi * 0.08);
  else if (kind === "solar") landAndCrop = clamp(cell.solar * 0.88 + (100 - ndvi) * 0.07 + cell.confidence * 0.05);
  else if (kind === "factory") landAndCrop = clamp(cell.industrial_land * 0.78 + ndbi * 0.22);
  else if (kind === "logistics") landAndCrop = clamp(cell.industrial_land * 0.7 + ndbi * 0.3);
  else landAndCrop = profile.category === "agriculture" ? clamp((cell.soy + cell.cotton + cell.vegetables) / 3 * 0.82 + ndvi * 0.18) : cell.industrial_land;

  const agricultural = profile.category === "agriculture";
  const energy = profile.category === "energy";
  const rawScore = agricultural
    ? landAndCrop * 0.56 + electricity * 0.14 + water * 0.24 + logistics * 0.02 + cell.confidence * 0.04
    : energy
      ? landAndCrop * 0.62 + electricity * 0.3 + logistics * 0.04 + cell.confidence * 0.04
      : landAndCrop * 0.46 + electricity * 0.32 + water * 0.08 + logistics * 0.1 + cell.confidence * 0.04;

  const constraints: SuitabilityAnalysis["constraints"] = [
    { code: "land_unverified", blocking: false },
    { code: "parcel_size_unverified", blocking: profile.sizeHa > 500 },
  ];
  let cap = 100;
  if (powerKm === null) {
    constraints.push({ code: "power_unknown", blocking: profile.powerNeed !== "low" });
    if (profile.powerNeed !== "low") cap = Math.min(cap, 64);
  } else if ((profile.powerNeed === "high" && powerKm > 18) || (profile.powerNeed === "medium" && powerKm > 28)) {
    constraints.push({ code: "power_far", blocking: true, distanceKm: powerKm });
    cap = Math.min(cap, 54);
  }
  if (profile.waterNeed && waterKm === null) {
    constraints.push({ code: "water_unknown", blocking: true });
    cap = Math.min(cap, 54);
  } else if (profile.waterNeed && waterKm !== null && waterKm > (kind === "rice" ? 14 : 25)) {
    constraints.push({ code: "water_far", blocking: true, distanceKm: waterKm });
    cap = Math.min(cap, 49);
  }
  if (profile.railNeeded && railKm === null) {
    constraints.push({ code: "rail_unknown", blocking: true });
    cap = Math.min(cap, 54);
  } else if (profile.railNeeded && railKm !== null && railKm > 35) {
    constraints.push({ code: "rail_far", blocking: true, distanceKm: railKm });
    cap = Math.min(cap, 54);
  }

  const score = clamp(Math.min(rawScore, cap));
  const knownInfrastructure = [powerKm, profile.waterNeed ? waterKm : 0, profile.railNeeded ? railKm : 0].filter((value) => value !== null).length;
  const requiredSignals = 1 + Number(profile.waterNeed) + Number(profile.railNeeded);
  const confidence = clamp(cell.confidence * 0.58 + (knownInfrastructure / requiredSignals) * 27 + 8);
  const status = score >= 75 && !constraints.some((item) => item.blocking) ? "excellent" : score >= 55 ? "possible" : "weak";

  return {
    score,
    confidence,
    status,
    components: { landAndCrop, electricity, water, logistics },
    constraints,
    distances: { powerKm, railKm, waterKm },
    method: "alpha-suitability-v2",
  };
}
