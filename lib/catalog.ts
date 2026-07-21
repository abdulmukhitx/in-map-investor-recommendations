export type Sector = "Manufacturing" | "Agro" | "Logistics" | "Energy" | "Tourism";
export type EvidenceLevel = "official" | "registry" | "discovered";

export type InfrastructureFact = {
  key: "power" | "gas" | "water" | "wastewater" | "road" | "rail";
  label: string;
  value: string;
  confirmed: boolean;
};

export type FitSignal = {
  label: string;
  value: number;
  rationale: string;
};

export type CatalogSite = {
  id: string;
  name: string;
  district: string;
  sector: Sector;
  availability: string;
  ownershipStatus: string;
  evidenceLevel: EvidenceLevel;
  locationAccuracy: "exact" | "approximate";
  areaHa: number;
  latitude: number;
  longitude: number;
  baseScore: number;
  powerMw: number | null;
  hasRail: boolean;
  description: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  infrastructure: InfrastructureFact[];
  materials: string[];
  fit: FitSignal[];
  bestFor: string[];
  risks: string[];
  searchTerms: string;
  updatedAt: string;
};

const officialSezSource = "https://invest.gov.kz/doing-business-here/fez-and/the-list-of-sez-and/";
const regionalSezSource = "https://turkestan.invest.gov.kz/doing-business-here/special-economic-zone/";

export const seedSites: CatalogSite[] = [
  {
    id: "turan-orangai-365",
    name: "TURAN · Orangai industrial subzone",
    district: "Orangai, Turkistan district",
    sector: "Manufacturing",
    availability: "Apply through SEZ operator",
    ownershipStatus: "Temporary land-use pathway up to 25 years",
    evidenceLevel: "official",
    locationAccuracy: "approximate",
    areaHa: 365,
    latitude: 43.225,
    longitude: 68.305,
    baseScore: 93,
    powerMw: 50,
    hasRail: true,
    description: "The largest documented TURAN industrial subzone. Official investment material lists completed industrial utilities and a one-stop application route through the SEZ operator.",
    sourceTitle: "KAZAKH INVEST · TURAN SEZ",
    sourceUrl: officialSezSource,
    sourceCheckedAt: "2026-07-21",
    infrastructure: [
      { key: "power", label: "Electricity", value: "50 MW", confirmed: true },
      { key: "gas", label: "Gas", value: "5,000 m³/hour", confirmed: true },
      { key: "water", label: "Water", value: "1,200 m³/day", confirmed: true },
      { key: "wastewater", label: "Sewerage", value: "1,200 m³/day", confirmed: true },
      { key: "rail", label: "Rail connection", value: "3.9 km", confirmed: true },
      { key: "road", label: "Highway connection", value: "4 km", confirmed: true },
    ],
    materials: ["limestone", "gypsum", "cotton", "construction materials"],
    fit: [
      { label: "Infrastructure", value: 96, rationale: "Documented power, gas, water, sewerage, rail and highway connections." },
      { label: "Market access", value: 89, rationale: "Near Turkistan city with regional road and rail access." },
      { label: "Land pathway", value: 91, rationale: "SEZ operator provides a formal application and lease pathway; parcel availability must be confirmed." },
      { label: "Evidence quality", value: 98, rationale: "Capacity and area are sourced from KAZAKH INVEST." },
    ],
    bestFor: ["building materials", "textiles", "food processing", "metal products"],
    risks: ["Exact free-parcel inventory is not published through an open API", "Connection conditions and tariffs require operator confirmation"],
    searchTerms: "orangai turan factory industrial manufacturing textile cotton limestone gypsum building materials food processing",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "turan-kentau-35",
    name: "TURAN · Kentau brownfield",
    district: "Kentau city",
    sector: "Manufacturing",
    availability: "Apply through SEZ operator",
    ownershipStatus: "SEZ brownfield land-use pathway",
    evidenceLevel: "official",
    locationAccuracy: "approximate",
    areaHa: 35,
    latitude: 43.535,
    longitude: 68.52,
    baseScore: 84,
    powerMw: 6,
    hasRail: true,
    description: "A documented 35-hectare brownfield subzone in Kentau with existing electricity, water, sewerage and rail access. Environmental due diligence is essential for any heavy-industry proposal.",
    sourceTitle: "KAZAKH INVEST · TURAN SEZ",
    sourceUrl: officialSezSource,
    sourceCheckedAt: "2026-07-21",
    infrastructure: [
      { key: "power", label: "Electricity", value: "6 MW", confirmed: true },
      { key: "water", label: "Water", value: "3,238 m³/day", confirmed: true },
      { key: "wastewater", label: "Sewerage", value: "1,900 m³/day", confirmed: true },
      { key: "rail", label: "Rail connection", value: "2.9 km", confirmed: true },
      { key: "road", label: "Highway connection", value: "4.5 km", confirmed: true },
    ],
    materials: ["polymetal ore", "limestone", "coal", "industrial components"],
    fit: [
      { label: "Infrastructure", value: 86, rationale: "Existing brownfield networks and rail access reduce initial infrastructure work." },
      { label: "Market access", value: 74, rationale: "Connected to Turkistan, but farther from the main southern consumer corridor." },
      { label: "Land pathway", value: 80, rationale: "SEZ route exists, while current free-space status needs operator confirmation." },
      { label: "Evidence quality", value: 97, rationale: "Area and capacities are documented by KAZAKH INVEST." },
    ],
    bestFor: ["metal products", "equipment repair", "mineral processing", "industrial components"],
    risks: ["Environmental baseline assessment is required", "Exact building condition and remediation cost are not published"],
    searchTerms: "kentau brownfield factory manufacturing metal ore limestone coal repair equipment",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "turan-turkistan-180",
    name: "TURAN · Turkistan industrial subzone",
    district: "Turkistan city",
    sector: "Manufacturing",
    availability: "Apply through SEZ operator",
    ownershipStatus: "Temporary SEZ land-use pathway",
    evidenceLevel: "official",
    locationAccuracy: "approximate",
    areaHa: 180,
    latitude: 43.28,
    longitude: 68.34,
    baseScore: 92,
    powerMw: 30,
    hasRail: true,
    description: "A documented industrial subzone in Turkistan city with strong electricity, gas and technical-water capacity. It is the strongest city-adjacent option for medium-scale processing and manufacturing.",
    sourceTitle: "KAZAKH INVEST · TURAN SEZ",
    sourceUrl: officialSezSource,
    sourceCheckedAt: "2026-07-21",
    infrastructure: [
      { key: "power", label: "Electricity", value: "5 + 25 MW", confirmed: true },
      { key: "gas", label: "Gas", value: "3,800 m³/hour", confirmed: true },
      { key: "water", label: "Drinking water", value: "70 m³/day", confirmed: true },
      { key: "water", label: "Technical water", value: "570 m³/hour", confirmed: true },
      { key: "wastewater", label: "Sewerage", value: "300 m³/hour", confirmed: true },
      { key: "rail", label: "Rail track", value: "1.4 km", confirmed: true },
    ],
    materials: ["cotton", "fruit", "vegetables", "gypsum", "limestone"],
    fit: [
      { label: "Infrastructure", value: 95, rationale: "Documented power, gas and high technical-water capacity." },
      { label: "Market access", value: 94, rationale: "City-adjacent location with workforce, services and regional transport." },
      { label: "Land pathway", value: 88, rationale: "Formal SEZ application route exists; parcel-level availability is not open data." },
      { label: "Evidence quality", value: 98, rationale: "Infrastructure figures are published by KAZAKH INVEST." },
    ],
    bestFor: ["food processing", "textiles", "building materials", "light manufacturing"],
    risks: ["Parcel boundaries shown as an approximate point until official GIS geometry is connected", "Final utility connection study remains project-specific"],
    searchTerms: "turkistan 180 greenfield factory textile cotton food processing building materials gas technical water",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "turan-airport-967",
    name: "TURAN · Airport subzone",
    district: "Turkistan airport area",
    sector: "Logistics",
    availability: "Operator confirmation required",
    ownershipStatus: "SEZ subzone · parcel status not published",
    evidenceLevel: "official",
    locationAccuracy: "approximate",
    areaHa: 967,
    latitude: 43.313,
    longitude: 68.55,
    baseScore: 80,
    powerMw: null,
    hasRail: false,
    description: "The official TURAN structure includes a 967-hectare airport subzone. It is a strategic logistics candidate, but public materials do not publish parcel availability or full utility capacity.",
    sourceTitle: "Invest in Turkistan · SEZ and IZ",
    sourceUrl: regionalSezSource,
    sourceCheckedAt: "2026-07-21",
    infrastructure: [
      { key: "road", label: "Airport access", value: "International airport adjacency", confirmed: true },
      { key: "power", label: "Electricity", value: "Capacity to confirm", confirmed: false },
      { key: "water", label: "Water", value: "Capacity to confirm", confirmed: false },
    ],
    materials: ["air cargo", "tourism supply", "cold-chain potential"],
    fit: [
      { label: "Infrastructure", value: 68, rationale: "Airport access is strong; detailed utility capacity is not published." },
      { label: "Market access", value: 93, rationale: "Direct air connectivity and proximity to Turkistan city." },
      { label: "Land pathway", value: 72, rationale: "The subzone is official, while parcel availability must be confirmed." },
      { label: "Evidence quality", value: 90, rationale: "Area and subzone status are official; site-level detail is incomplete." },
    ],
    bestFor: ["air cargo", "cold storage", "tourism supply", "high-value light assembly"],
    risks: ["No open parcel inventory", "Airport land-use and height restrictions require review"],
    searchTerms: "airport logistics cargo cold chain tourism warehouse assembly turkistan",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "shardara-industrial-zone",
    name: "Shardara industrial zone",
    district: "Shardara district",
    sector: "Agro",
    availability: "Current availability to confirm",
    ownershipStatus: "Industrial-zone record · cadastral check required",
    evidenceLevel: "registry",
    locationAccuracy: "approximate",
    areaHa: 35,
    latitude: 41.254,
    longitude: 67.97,
    baseScore: 76,
    powerMw: null,
    hasRail: false,
    description: "A regional industrial-zone candidate close to irrigated agriculture and the Shardara reservoir. The zone appears in industrial-zone registries, but current land and utility availability require direct confirmation.",
    sourceTitle: "QazIndustry · Current industrial zones registry",
    sourceUrl: "https://sez.qazindustry.gov.kz/ru/report/iz",
    sourceCheckedAt: "2026-07-21",
    infrastructure: [
      { key: "water", label: "Water context", value: "Reservoir and irrigation network nearby", confirmed: false },
      { key: "power", label: "Power", value: "Live map discovery + operator confirmation", confirmed: false },
      { key: "road", label: "Road", value: "Regional road access", confirmed: false },
    ],
    materials: ["vegetables", "fish", "crop residue", "solar resource"],
    fit: [
      { label: "Infrastructure", value: 66, rationale: "Regional access exists, but capacities need confirmation." },
      { label: "Market access", value: 61, rationale: "Longer distance to major markets and rail." },
      { label: "Land pathway", value: 70, rationale: "Industrial-zone status is documented; current parcel status is not." },
      { label: "Evidence quality", value: 72, rationale: "Registry evidence exists, but fresh operator data is needed." },
    ],
    bestFor: ["food processing", "aquaculture", "solar energy", "cold storage"],
    risks: ["Current free land is unverified", "Rail logistics are comparatively weak"],
    searchTerms: "shardara agro agriculture fish vegetables solar energy cold storage reservoir",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "maktaaral-industrial-zone",
    name: "Maktaaral industrial-zone candidate",
    district: "Maktaaral / Zhetisay district",
    sector: "Agro",
    availability: "Current availability to confirm",
    ownershipStatus: "Industrial-zone record · cadastral check required",
    evidenceLevel: "registry",
    locationAccuracy: "approximate",
    areaHa: 0,
    latitude: 40.775,
    longitude: 68.33,
    baseScore: 74,
    powerMw: null,
    hasRail: true,
    description: "A high-feedstock agro-processing location in the cotton-growing south. The platform treats it as a candidate until the operator supplies a current parcel schedule and cadastral evidence.",
    sourceTitle: "QazIndustry · Current industrial zones registry",
    sourceUrl: "https://sez.qazindustry.gov.kz/ru/report/iz",
    sourceCheckedAt: "2026-07-21",
    infrastructure: [
      { key: "rail", label: "Rail", value: "Zhetisay-area rail access · verify live", confirmed: false },
      { key: "water", label: "Water context", value: "Irrigation network nearby", confirmed: false },
      { key: "power", label: "Power", value: "Capacity to confirm", confirmed: false },
    ],
    materials: ["cotton", "melons", "vegetables", "crop residue"],
    fit: [
      { label: "Infrastructure", value: 64, rationale: "Transport and irrigation context are promising, with capacities unverified." },
      { label: "Market access", value: 77, rationale: "Close to the Uzbekistan border and southern agricultural corridor." },
      { label: "Land pathway", value: 55, rationale: "Industrial-zone record exists; current area and parcel status are missing." },
      { label: "Evidence quality", value: 62, rationale: "Requires an updated operator and cadastral record." },
    ],
    bestFor: ["cotton processing", "textiles", "food processing", "biomass"],
    risks: ["Area and free-parcel status are not confirmed", "Cross-border and irrigation constraints require project review"],
    searchTerms: "maktaaral zhetisay agro cotton textile melons vegetables biomass processing",
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
];

export type ProjectNeed = {
  sector?: string;
  landHa?: number;
  powerMw?: number;
  needsRail?: boolean;
  material?: string;
};

export function rankForProject(site: CatalogSite, need: ProjectNeed) {
  let score = site.baseScore;
  const reasons: string[] = [];

  if (need.sector && need.sector !== "All") {
    if (site.sector.toLowerCase() === need.sector.toLowerCase()) {
      score += 8;
      reasons.push(`Strong ${need.sector.toLowerCase()} sector match`);
    } else if (need.sector === "Manufacturing" && site.bestFor.some((item) => /processing|textile|materials|assembly|metal/i.test(item))) {
      score += 4;
      reasons.push("Compatible processing/manufacturing profile");
    } else {
      score -= 5;
    }
  }

  if (need.landHa && need.landHa > 0) {
    if (site.areaHa >= need.landHa) {
      score += 5;
      reasons.push(`Documented zone area exceeds ${need.landHa} ha`);
    } else if (site.areaHa === 0) {
      score -= 8;
      reasons.push("Area requires operator confirmation");
    } else {
      score -= Math.min(22, Math.round((need.landHa - site.areaHa) / 4));
    }
  }

  if (need.powerMw && need.powerMw > 0) {
    if (site.powerMw !== null && site.powerMw >= need.powerMw) {
      score += 6;
      reasons.push(`Published power capacity covers ${need.powerMw} MW requirement`);
    } else if (site.powerMw === null) {
      score -= 9;
      reasons.push("Published power capacity unavailable");
    } else {
      score -= Math.min(20, Math.ceil(need.powerMw - site.powerMw));
    }
  }

  if (need.needsRail) {
    if (site.hasRail) {
      score += 5;
      reasons.push("Rail access is documented or recorded");
    } else {
      score -= 12;
    }
  }

  if (need.material?.trim()) {
    const material = need.material.trim().toLowerCase();
    if (`${site.materials.join(" ")} ${site.searchTerms}`.toLowerCase().includes(material)) {
      score += 8;
      reasons.push(`${need.material.trim()} appears in the site supply context`);
    } else {
      score -= 3;
    }
  }

  if (site.evidenceLevel === "official") score += 3;
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 4) };
}
