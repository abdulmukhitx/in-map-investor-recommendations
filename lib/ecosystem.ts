export type EcosystemFeatureKind = "asset" | "company" | "project";
export type EcosystemLocationPrecision = "exact" | "linked_project" | "district";

export type EcosystemFeature = {
  id: string;
  kind: EcosystemFeatureKind;
  name: string;
  latitude: number;
  longitude: number;
  locationPrecision: EcosystemLocationPrecision;
  district: string;
  address: string | null;
  category: string;
  status: string;
  description: string | null;
  organization: string | null;
  investment: number | null;
  jobs: number | null;
  sourceUrl: string;
  contactName: string | null;
  contactRole: string | null;
  phone: string | null;
  website: string | null;
  facts?: string[];
};

export type EcosystemPayload = {
  features: EcosystemFeature[];
  meta: {
    status: "connected" | "partial" | "credentials_required" | "unavailable";
    updatedAt: string;
    assets: number;
    companies: number;
    projects: number;
    exactLocations: number;
    sourceAssets: string;
    sourceApi: string;
    warnings: string[];
  };
};

export type EcosystemProfile = {
  category: "agriculture" | "manufacturing" | "logistics" | "energy" | "other" | "";
  productKey: string;
  customProduct: string;
};

export type NearbyEcosystemFeature = EcosystemFeature & {
  distanceKm: number;
  relevance: number;
};

export type EcosystemAnalysis = {
  score: number;
  bonus: number;
  within50Km: number;
  within100Km: number;
  nearby: NearbyEcosystemFeature[];
};

function radians(value: number) {
  return value * Math.PI / 180;
}

export function ecosystemDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sectorForText(value: string) {
  const text = value.toLowerCase();
  if (/агро|аөk|аөк|ферм|сүт|молок|мяс|ет |тепли|овощ|көкөніс|хлоп|мақта|зерн|бидай|сад|птиц|құс/.test(text)) return "agriculture";
  if (/логист|склад|қойма|транспорт|теміржол|железнод|терминал|дистриб/.test(text)) return "logistics";
  if (/энерг|электр|solar|күн электр|ветр|жел электр|генерац/.test(text)) return "energy";
  if (/завод|зауыт|өндір|производ|промыш|industrial|фабрик|цех|полимер|металл|құрылыс материал/.test(text)) return "manufacturing";
  return "other";
}

function relevanceFor(feature: EcosystemFeature, profile: EcosystemProfile) {
  const statusPenalty = /приост|suspend/i.test(feature.status) ? 0.38 : 1;
  if (!profile.category || profile.category === "other") return 0.76 * statusPenalty;
  const source = `${feature.name} ${feature.category} ${feature.description ?? ""} ${feature.organization ?? ""}`;
  const sector = sectorForText(source);
  if (sector === profile.category) return 1 * statusPenalty;
  if (feature.kind === "asset" && feature.category === "bank_collateral") return 0.82 * statusPenalty;
  if (feature.kind === "project") return 0.68 * statusPenalty;
  if (feature.kind === "company") return 0.58 * statusPenalty;
  return 0.5 * statusPenalty;
}

function distanceSignal(distanceKm: number) {
  if (distanceKm <= 10) return 100;
  if (distanceKm <= 25) return 88;
  if (distanceKm <= 50) return 72;
  if (distanceKm <= 100) return 50;
  if (distanceKm <= 180) return 24;
  return 5;
}

export function analyzeEcosystem(
  latitude: number,
  longitude: number,
  profile: EcosystemProfile,
  features: EcosystemFeature[],
): EcosystemAnalysis {
  if (!features.length) return { score: 0, bonus: 0, within50Km: 0, within100Km: 0, nearby: [] };

  const nearby = features
    .map((feature) => ({
      ...feature,
      distanceKm: ecosystemDistanceKm(latitude, longitude, feature.latitude, feature.longitude),
      relevance: relevanceFor(feature, profile),
    }))
    .filter((feature) => feature.distanceKm <= 220)
    .sort((a, b) => (a.distanceKm / a.relevance) - (b.distanceKm / b.relevance));

  const weightedSignals = nearby.slice(0, 12).map((feature) => {
    const precision = feature.locationPrecision === "district" ? 0.72 : feature.locationPrecision === "linked_project" ? 0.9 : 1;
    return distanceSignal(feature.distanceKm) * feature.relevance * precision;
  });
  const strongest = weightedSignals[0] ?? 0;
  const within50Km = nearby.filter((feature) => feature.distanceKm <= 50).length;
  const within100Km = nearby.filter((feature) => feature.distanceKm <= 100).length;
  const density = Math.min(30, within50Km * 2.2 + Math.max(0, within100Km - within50Km) * 0.75);
  const score = clamp(strongest * 0.7 + density);
  const bonus = score >= 78 ? 7 : score >= 64 ? 5 : score >= 48 ? 3 : score >= 32 ? 1 : 0;

  return { score, bonus, within50Km, within100Km, nearby: nearby.slice(0, 8) };
}

export function applyEcosystemBonus(baseScore: number, bonus: number, hasBlockingConstraint: boolean) {
  const cap = hasBlockingConstraint ? 54 : 100;
  return Math.max(0, Math.min(cap, Math.round(baseScore + bonus)));
}
