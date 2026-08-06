import type { EcosystemFeature, EcosystemLocationPrecision, EcosystemPayload } from "../../../lib/ecosystem";

const ASSETS_URL = "https://in-map-kazakhstan-trade-2026.chatgpt-edu-7368.chatgpt.site/data/turkestan-assets.json";
const INMAP_API = "https://in-map.kz/api/v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

type RegionAnchor = { territoryId: string; name: string; latitude: number; longitude: number };

const regionAnchors: Record<number, RegionAnchor> = {
  3: { territoryId: "kz.61.10", name: "Түркістан қаласы", latitude: 43.17187, longitude: 68.49904 },
  4: { territoryId: "kz.61.16", name: "Арыс қаласы", latitude: 42.27367, longitude: 67.96681 },
  5: { territoryId: "kz.61.20", name: "Кентау қаласы", latitude: 43.55366, longitude: 68.57754 },
  6: { territoryId: "kz.61.55", name: "Сауран ауданы", latitude: 43.48615, longitude: 68.34863 },
  8: { territoryId: "kz.61.39", name: "Келес ауданы", latitude: 41.33087, longitude: 68.54378 },
  9: { territoryId: "kz.61.40", name: "Қазығұрт ауданы", latitude: 41.88913, longitude: 69.57932 },
  10: { territoryId: "kz.61.44", name: "Мақтаарал ауданы", latitude: 40.76564, longitude: 68.44886 },
  11: { territoryId: "kz.61.46", name: "Ордабасы ауданы", latitude: 42.61291, longitude: 69.16449 },
  12: { territoryId: "kz.61.48", name: "Отырар ауданы", latitude: 42.51631, longitude: 67.49818 },
  14: { territoryId: "kz.61.54", name: "Сарыағаш ауданы", latitude: 41.64838, longitude: 68.73975 },
  18: { territoryId: "kz.61.64", name: "Шардара ауданы", latitude: 41.56819, longitude: 67.57471 },
  19: { territoryId: "kz.61.36", name: "Бәйдібек ауданы", latitude: 43.07479, longitude: 69.50165 },
  20: { territoryId: "kz.61.38", name: "Жетісай ауданы", latitude: 40.87426, longitude: 68.21623 },
  21: { territoryId: "kz.61.52", name: "Сайрам ауданы", latitude: 42.45393, longitude: 69.77518 },
  22: { territoryId: "kz.61.56", name: "Созақ ауданы", latitude: 44.68789, longitude: 68.49394 },
  23: { territoryId: "kz.61.58", name: "Төле би ауданы", latitude: 42.16453, longitude: 70.18053 },
  24: { territoryId: "kz.61.60", name: "Түлкібас ауданы", latitude: 42.57272, longitude: 70.27479 },
};

const territoryAnchors = Object.fromEntries(Object.values(regionAnchors).map((anchor) => [anchor.territoryId, anchor]));

type ApiRegion = { id?: number; name?: string } | null;
type ApiCompany = {
  id: number;
  name?: string;
  display_name?: string;
  activity_type?: string | null;
  legal_address?: string | null;
  actual_address?: string | null;
  status?: string;
  status_label?: string;
  region?: ApiRegion;
  projects_count?: number;
};
type ApiProject = {
  id: number;
  name?: string;
  description?: string | null;
  company_id?: number | null;
  company_name_snapshot?: string | null;
  company?: { name?: string; display_name?: string } | null;
  region?: ApiRegion;
  primary_project_type?: { name?: string } | null;
  status?: string;
  current_status?: string | null;
  total_investment?: string | number | null;
  jobs_count?: number | null;
  geometry?: unknown;
  industrial_zones?: Array<{ name?: string }>;
  prom_zones?: Array<{ name?: string }>;
  sezs?: Array<{ name?: string }>;
  production_plans?: Array<{ product_name?: string; legacy_value?: string | null }>;
  updated_at?: string;
};
type ApiPage<T> = { data?: T[]; meta?: { current_page?: number; last_page?: number; total?: number } };
type AssetRecord = {
  id: string;
  territoryId: string;
  category: string;
  title: string;
  description?: string;
  status?: string;
  facts?: string[];
  bank?: string;
  sourceUrl?: string;
};
type AssetsPayload = { assets?: AssetRecord[]; metadata?: { updatedAt?: string } };

let cached: { expiresAt: number; payload: EcosystemPayload } | null = null;

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value: unknown, maximum = 240) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1).trim()}…` : normalized;
}

function geometryCentroid(value: unknown): { latitude: number; longitude: number } | null {
  const points: Array<{ latitude: number; longitude: number }> = [];
  function visit(item: unknown) {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") return;
    const object = item as Record<string, unknown>;
    const latitude = finiteNumber(object.lat ?? object.latitude);
    const longitude = finiteNumber(object.lng ?? object.lon ?? object.longitude);
    if (latitude !== null && longitude !== null && latitude >= 40 && latitude <= 46.5 && longitude >= 65 && longitude <= 71.5) {
      points.push({ latitude, longitude });
    }
    if (object.coordinates) visit(object.coordinates);
    if (object.geometry) visit(object.geometry);
  }
  visit(value);
  if (!points.length) return null;
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

function regionLocation(region: ApiRegion) {
  return region?.id ? regionAnchors[region.id] ?? null : null;
}

function statusLabel(status: string | undefined, fallback: string | null | undefined) {
  if (status === "launched") return "Запущен";
  if (status === "implementation") return "Реализация";
  if (status === "plan") return "Планируется";
  if (status === "suspended") return "Приостановлен";
  if (status === "active") return "Действующая компания";
  if (fallback?.trim()) return fallback.trim();
  return status || "Статус не указан";
}

async function fetchApiPage<T>(path: string, token: string, page: number) {
  const endpoint = new URL(`${INMAP_API}/${path}`);
  endpoint.searchParams.set("per_page", "100");
  endpoint.searchParams.set("page", String(page));
  if (path === "projects") endpoint.searchParams.set("archived", "0");
  if (path === "companies") endpoint.searchParams.set("status", "active");
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<ApiPage<T>>;
}

async function fetchAllPages<T>(path: string, token: string) {
  const first = await fetchApiPage<T>(path, token, 1);
  const lastPage = Math.min(20, Math.max(1, first.meta?.last_page ?? 1));
  if (lastPage === 1) return first.data ?? [];
  const rest = await Promise.all(Array.from({ length: lastPage - 1 }, (_, index) => fetchApiPage<T>(path, token, index + 2)));
  return [first, ...rest].flatMap((page) => page.data ?? []);
}

function normalizeProject(project: ApiProject): EcosystemFeature | null {
  const exact = geometryCentroid(project.geometry);
  const anchor = regionLocation(project.region);
  const location = exact ?? anchor;
  if (!location) return null;
  const zone = [...(project.sezs ?? []), ...(project.industrial_zones ?? []), ...(project.prom_zones ?? [])]
    .map((item) => clean(item.name, 80)).filter(Boolean).join(", ");
  const production = (project.production_plans ?? []).slice(0, 2)
    .map((item) => [clean(item.product_name, 100), clean(item.legacy_value, 80)].filter(Boolean).join(" · ")).filter(Boolean).join("; ");
  return {
    id: `project-${project.id}`,
    kind: "project",
    name: clean(project.name, 180) ?? `Инвестиционный проект №${project.id}`,
    latitude: location.latitude,
    longitude: location.longitude,
    locationPrecision: exact ? "exact" : "district",
    district: clean(project.region?.name, 100) ?? anchor?.name ?? "Туркестанская область",
    address: zone || (exact ? `Координаты API: ${exact.latitude.toFixed(5)}, ${exact.longitude.toFixed(5)}` : null),
    category: clean(project.primary_project_type?.name, 100) ?? "Инвестиционный проект",
    status: statusLabel(project.status, project.current_status),
    description: clean(project.description, 260) ?? clean(production, 260),
    organization: clean(project.company?.display_name ?? project.company?.name ?? project.company_name_snapshot, 160),
    investment: finiteNumber(project.total_investment),
    jobs: finiteNumber(project.jobs_count),
    sourceUrl: "https://in-map.kz",
  };
}

function normalizeCompany(company: ApiCompany, projects: ApiProject[]): EcosystemFeature | null {
  if (!(company.activity_type || company.actual_address || company.legal_address || company.region)) return null;
  const linked = projects.find((project) => project.company_id === company.id);
  const exact = linked ? geometryCentroid(linked.geometry) : null;
  const anchor = regionLocation(company.region) ?? regionLocation(linked?.region ?? null);
  const location = exact ?? anchor;
  if (!location) return null;
  const precision: EcosystemLocationPrecision = exact ? "linked_project" : "district";
  return {
    id: `company-${company.id}`,
    kind: "company",
    name: clean(company.display_name ?? company.name, 180) ?? `Компания №${company.id}`,
    latitude: location.latitude,
    longitude: location.longitude,
    locationPrecision: precision,
    district: clean(company.region?.name ?? linked?.region?.name, 100) ?? anchor?.name ?? "Туркестанская область",
    address: clean(company.actual_address ?? company.legal_address, 220),
    category: clean(company.activity_type, 160) ?? "Действующий бизнес",
    status: statusLabel(company.status, company.status_label),
    description: company.projects_count ? `Связано проектов: ${company.projects_count}` : null,
    organization: null,
    investment: null,
    jobs: null,
    sourceUrl: "https://in-map.kz",
  };
}

function normalizeAsset(asset: AssetRecord): EcosystemFeature | null {
  const anchor = territoryAnchors[asset.territoryId];
  if (!anchor) return null;
  return {
    id: `asset-${asset.id}`,
    kind: "asset",
    name: clean(asset.title, 180) ?? asset.id,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    locationPrecision: "district",
    district: anchor.name,
    address: clean(asset.description, 220),
    category: asset.category,
    status: clean(asset.status, 100) ?? "Доступный актив",
    description: clean(asset.description, 260),
    organization: clean(asset.bank, 120),
    investment: null,
    jobs: null,
    sourceUrl: asset.sourceUrl || ASSETS_URL,
    facts: (asset.facts ?? []).filter((item): item is string => typeof item === "string").slice(0, 4),
  };
}

async function buildPayload(): Promise<EcosystemPayload> {
  const warnings: string[] = [];
  const token = process.env.INMAP_API_TOKEN?.trim();
  let assets: AssetRecord[] = [];
  let companies: ApiCompany[] = [];
  let projects: ApiProject[] = [];
  let assetsConnected = false;
  let apiConnected = false;
  let assetsUpdatedAt: string | undefined;

  const assetsPromise = fetch(ASSETS_URL, { signal: AbortSignal.timeout(14000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`assets returned ${response.status}`);
      const payload = await response.json() as AssetsPayload;
      assets = payload.assets ?? [];
      assetsUpdatedAt = payload.metadata?.updatedAt;
      assetsConnected = true;
    })
    .catch(() => warnings.push("Каталог активов временно недоступен."));

  const apiPromise = token
    ? Promise.all([fetchAllPages<ApiCompany>("companies", token), fetchAllPages<ApiProject>("projects", token)])
      .then(([companyData, projectData]) => {
        companies = companyData;
        projects = projectData;
        apiConnected = true;
      })
      .catch(() => warnings.push("API компаний и проектов временно недоступен."))
    : Promise.resolve(warnings.push("Для API компаний и проектов не настроен серверный токен.")).then(() => undefined);

  await Promise.all([assetsPromise, apiPromise]);

  const projectFeatures = projects.map(normalizeProject).filter((item): item is EcosystemFeature => Boolean(item));
  const companyFeatures = companies.map((company) => normalizeCompany(company, projects)).filter((item): item is EcosystemFeature => Boolean(item));
  const assetFeatures = assets.map(normalizeAsset).filter((item): item is EcosystemFeature => Boolean(item));
  const features = [...projectFeatures, ...companyFeatures, ...assetFeatures];
  const status: EcosystemPayload["meta"]["status"] = assetsConnected && apiConnected
    ? "connected"
    : features.length
      ? (token ? "partial" : "credentials_required")
      : "unavailable";

  return {
    features,
    meta: {
      status,
      updatedAt: assetsUpdatedAt || new Date().toISOString().slice(0, 10),
      assets: assetFeatures.length,
      companies: companyFeatures.length,
      projects: projectFeatures.length,
      exactLocations: features.filter((feature) => feature.locationPrecision !== "district").length,
      sourceAssets: ASSETS_URL,
      sourceApi: INMAP_API,
      warnings,
    },
  };
}

export async function GET() {
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } });
  }
  const payload = await buildPayload();
  if (payload.features.length) cached = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
  return Response.json(payload, {
    status: payload.meta.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" },
  });
}
