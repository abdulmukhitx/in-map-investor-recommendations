"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layer, LayerGroup, Map as LeafletMap } from "leaflet";
import type { CatalogSite } from "../lib/catalog";
import type { DataSourceRecord } from "../lib/data-sources";
import { analyzeSuitability, type ConstraintCode, type SuitabilityAnalysis } from "../lib/suitability";
import "leaflet/dist/leaflet.css";

type Locale = "ru" | "kk";
type Category = "agriculture" | "manufacturing" | "logistics" | "energy" | "other";
type ProductKind = "wheat" | "soy" | "rice" | "cotton" | "vegetables" | "solar" | "factory" | "logistics" | "custom";

type InvestorProfile = {
  category: Category | "";
  productKey: string;
  customProduct: string;
  sizeHa: number;
  powerNeed: "low" | "medium" | "high";
  waterNeed: boolean;
  railNeeded: boolean;
};

type LiveFeature = {
  id: string;
  kind: "power" | "rail" | "industry" | "material" | "water";
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  detail: string;
  geometry?: Array<[number, number]>;
  infrastructureType?: string;
  osmUrl: string;
};

type AgroCellProps = {
  cell_id: string;
  latitude: number;
  longitude: number;
  area_km2: number;
  confidence: number;
  period: string;
  ndvi: number;
  ndwi: number;
  ndre: number;
  ndmi: number;
  ndbi: number;
  bsi: number;
  active_vegetation_pct: number;
  surface_water_pct: number;
  soy: number;
  rice: number;
  cotton: number;
  vegetables: number;
  solar: number;
  industrial_land: number;
  best_crop: string;
  power_km: number | null;
  rail_km: number | null;
  water_km: number | null;
};

type AgroFeature = { type: "Feature"; properties: AgroCellProps; geometry: object };
type AgroCollection = {
  type: "FeatureCollection";
  metadata: {
    source: string;
    method: string;
    limitations: string[];
    normalization_percentiles: Record<string, { p10: number; p90: number }>;
    infrastructure?: { source: string; observed_at: string; counts: Record<string, number>; limitations: string };
  };
  features: AgroFeature[];
};

type RegionalInfrastructure = {
  type: "FeatureCollection";
  metadata: { observed_at?: string; counts?: Record<string, number> };
  features: Array<{
    type: "Feature";
    properties: { kind: string; name?: string; voltage_kv?: number; detail?: string };
    geometry: { type: "Point" | "LineString"; coordinates: [number, number] | Array<[number, number]> };
  }>;
};

type ClimateContext = {
  temperatureC: number | null;
  precipitationMmDay: number | null;
  solarKwhM2Day: number | null;
  windMs: number | null;
};

type AiAdvice = {
  title: string;
  summary: string;
  pluses: string[];
  minuses: string[];
  nextSteps: string[];
  provider: "groq" | "rules";
  model?: string;
};

type FreeLandPayload = {
  records: Array<{
    id: string;
    district: string;
    areaThousandHa: number | null;
    description: string;
  }>;
  meta: {
    status: "credentials_required" | "connected" | "connected_with_warning" | "unavailable";
    version?: string;
    historical?: boolean;
    sourceUrl: string;
    limitation: string;
    warning?: { ru: string; kk: string };
    error?: string;
  };
};

const localizedSourceTitles: Partial<Record<string, Record<Locale, string>>> = {
  "alpha-sentinel-2025": {
    ru: "Спутниковые индексы Alpha Turkistan",
    kk: "Alpha Turkistan спутниктік индекстері",
  },
  "osm-overpass": {
    ru: "Электричество, дороги и вода — OpenStreetMap",
    kk: "Электр, жолдар және су — OpenStreetMap",
  },
  "nasa-power": {
    ru: "Температура и осадки — NASA POWER",
    kk: "Температура және жауын-шашын — NASA POWER",
  },
  "egov-free-land": {
    ru: "Свободные земли — eGov",
    kk: "Бос жерлер — eGov",
  },
};

function localizedSourceTitle(source: DataSourceRecord, locale: Locale) {
  return localizedSourceTitles[source.id]?.[locale] ?? source.title;
}

const initialProfile: InvestorProfile = {
  category: "",
  productKey: "",
  customProduct: "",
  sizeHa: 100,
  powerNeed: "medium",
  waterNeed: true,
  railNeeded: false,
};

const text = {
  ru: {
    subtitle: "Навигатор для инвестора",
    region: "Туркестанская область",
    editProject: "Изменить проект",
    project: "Ваш проект",
    bestZones: "Лучшие зоны",
    bestZonesHint: "Чем выше оценка, тем лучше исходные условия для проекта.",
    mapTitle: "Карта пригодности",
    mapLoading: "Загружаем карту и спутниковые данные…",
    mapError: "Карта временно недоступна",
    excellent: "Лучше всего",
    possible: "Можно рассматривать",
    weak: "Слабая зона",
    clickHint: "Нажмите на зону, чтобы увидеть плюсы и минусы",
    power: "Электричество",
    rail: "Железная дорога",
    water: "Вода и каналы",
    selectedZone: "Выбранная зона",
    why: "Что здесь хорошо и что мешает",
    pluses: "Плюсы",
    minuses: "Минусы и риски",
    steps: "Что проверить дальше",
    checking: "Готовим понятное заключение…",
    ownership: "Земля и собственник",
    ownershipUnknown: "По этой зоне собственник не подтверждён",
    cadastral: "Проверить участок в кадастре ↗",
    nearbySite: "Ближайшая инвестиционная площадка",
    indicators: "Показать технические показатели",
    vegetation: "Состояние растительности",
    moisture: "Влага",
    builtDry: "Застройка / сухая почва",
    dataQuality: "Качество данных",
    download: "Скачать краткое заключение",
    dataNote: "Это предварительный отбор. Перед вложением нужны кадастр, анализ почвы, вода и технические условия на подключение.",
    wizardTitle: "Что вы хотите открыть или производить?",
    wizardLead: "Ответьте на несколько простых вопросов — мы покажем подходящие зоны на карте.",
    language: "Язык",
    step: "Шаг",
    of: "из",
    categoryQuestion: "Выберите направление проекта",
    productQuestion: "Что именно вы хотите производить?",
    productHint: "Можно выбрать готовый вариант или описать свой.",
    ownVariant: "Свой вариант",
    ownPlaceholder: "Например: мукомольный завод, теплица, производство кирпича…",
    needsQuestion: "Что важно для проекта?",
    landArea: "Сколько земли нужно, гектаров",
    powerNeed: "Потребность в электричестве",
    low: "Небольшая",
    medium: "Средняя",
    high: "Высокая",
    waterNeed: "Нужна постоянная вода или орошение",
    railNeed: "Нужна железная дорога рядом",
    back: "Назад",
    next: "Далее",
    showMap: "Показать лучшие зоны",
    change: "Изменить",
    zonesFound: "подходящих зон",
    source: "Спутник Sentinel‑2 за 2025 год + открытая инфраструктура",
    aiRules: "Понятная модель оценки",
    aiGroq: "Заключение Groq AI",
  },
  kk: {
    subtitle: "Инвесторға арналған навигатор",
    region: "Түркістан облысы",
    editProject: "Жобаны өзгерту",
    project: "Сіздің жобаңыз",
    bestZones: "Үздік аймақтар",
    bestZonesHint: "Баға жоғары болған сайын жобаның бастапқы жағдайы жақсырақ.",
    mapTitle: "Жарамдылық картасы",
    mapLoading: "Карта мен спутниктік деректер жүктелуде…",
    mapError: "Карта уақытша қолжетімсіз",
    excellent: "Ең қолайлы",
    possible: "Қарастыруға болады",
    weak: "Қолайсыз аймақ",
    clickHint: "Артықшылықтары мен тәуекелдерін көру үшін аймақты басыңыз",
    power: "Электр желісі",
    rail: "Теміржол",
    water: "Су және каналдар",
    selectedZone: "Таңдалған аймақ",
    why: "Бұл жердің артықшылықтары мен кедергілері",
    pluses: "Артықшылықтары",
    minuses: "Кемшіліктері мен тәуекелдері",
    steps: "Келесі тексерулер",
    checking: "Түсінікті қорытынды дайындалуда…",
    ownership: "Жер және меншік иесі",
    ownershipUnknown: "Бұл аймақтың меншік иесі расталмаған",
    cadastral: "Кадастрдан тексеру ↗",
    nearbySite: "Ең жақын инвестициялық алаң",
    indicators: "Техникалық көрсеткіштерді көрсету",
    vegetation: "Өсімдік жағдайы",
    moisture: "Ылғал",
    builtDry: "Құрылыс / құрғақ топырақ",
    dataQuality: "Деректер сапасы",
    download: "Қысқаша қорытындыны жүктеу",
    dataNote: "Бұл — алдын ала іріктеу. Инвестиция алдында кадастр, топырақ талдауы, су және электрге қосылу шарттары қажет.",
    wizardTitle: "Не ашқыңыз немесе өндіргіңіз келеді?",
    wizardLead: "Бірнеше қарапайым сұраққа жауап беріңіз — картадан қолайлы аймақтарды көрсетеміз.",
    language: "Тіл",
    step: "Қадам",
    of: "ішінен",
    categoryQuestion: "Жоба бағытын таңдаңыз",
    productQuestion: "Нақты не өндіргіңіз келеді?",
    productHint: "Дайын нұсқаны таңдаңыз немесе өз ойыңызды жазыңыз.",
    ownVariant: "Өз нұсқаңыз",
    ownPlaceholder: "Мысалы: ұн зауыты, жылыжай, кірпіш өндірісі…",
    needsQuestion: "Жоба үшін не маңызды?",
    landArea: "Қажетті жер көлемі, гектар",
    powerNeed: "Электр қуатына қажеттілік",
    low: "Төмен",
    medium: "Орташа",
    high: "Жоғары",
    waterNeed: "Тұрақты су немесе суару қажет",
    railNeed: "Жақын жерде теміржол қажет",
    back: "Артқа",
    next: "Әрі қарай",
    showMap: "Үздік аймақтарды көрсету",
    change: "Өзгерту",
    zonesFound: "қолайлы аймақ",
    source: "2025 жылғы Sentinel‑2 спутнигі + ашық инфрақұрылым",
    aiRules: "Түсінікті бағалау моделі",
    aiGroq: "Groq AI қорытындысы",
  },
};

const categories: Array<{ id: Category; icon: string; ru: string; kk: string; ruHint: string; kkHint: string }> = [
  { id: "agriculture", icon: "🌾", ru: "Сельское хозяйство", kk: "Ауыл шаруашылығы", ruHint: "Пшеница, рис, соя, овощи", kkHint: "Бидай, күріш, соя, көкөніс" },
  { id: "manufacturing", icon: "🏭", ru: "Производство", kk: "Өндіріс", ruHint: "Завод, переработка, стройматериалы", kkHint: "Зауыт, өңдеу, құрылыс материалдары" },
  { id: "logistics", icon: "🚚", ru: "Логистика", kk: "Логистика", ruHint: "Склад, холодильник, распределение", kkHint: "Қойма, тоңазытқыш, тарату" },
  { id: "energy", icon: "☀️", ru: "Энергетика", kk: "Энергетика", ruHint: "Солнечная, ветровая, биогаз", kkHint: "Күн, жел, биогаз" },
  { id: "other", icon: "✦", ru: "Другой проект", kk: "Басқа жоба", ruHint: "Опишите свою идею", kkHint: "Өз идеяңызды жазыңыз" },
];

const products: Record<Category, Array<{ id: string; ru: string; kk: string }>> = {
  agriculture: [
    { id: "wheat", ru: "Пшеница", kk: "Бидай" },
    { id: "rice", ru: "Рис", kk: "Күріш" },
    { id: "soy", ru: "Соя", kk: "Соя" },
    { id: "cotton", ru: "Хлопок", kk: "Мақта" },
    { id: "vegetables", ru: "Овощи и теплица", kk: "Көкөніс және жылыжай" },
  ],
  manufacturing: [
    { id: "food", ru: "Пищевая переработка", kk: "Тамақ өнімдерін өңдеу" },
    { id: "textile", ru: "Текстиль", kk: "Тоқыма өндірісі" },
    { id: "building", ru: "Стройматериалы", kk: "Құрылыс материалдары" },
    { id: "factory", ru: "Другой завод", kk: "Басқа зауыт" },
  ],
  logistics: [
    { id: "warehouse", ru: "Складской комплекс", kk: "Қойма кешені" },
    { id: "cold", ru: "Холодильный склад", kk: "Тоңазытқыш қойма" },
    { id: "distribution", ru: "Распределительный центр", kk: "Тарату орталығы" },
  ],
  energy: [
    { id: "solar", ru: "Солнечная электростанция", kk: "Күн электр станциясы" },
    { id: "wind", ru: "Ветровая электростанция", kk: "Жел электр станциясы" },
    { id: "biogas", ru: "Биогаз", kk: "Биогаз" },
  ],
  other: [],
};

function distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function productKind(profile: InvestorProfile): ProductKind {
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
  if (profile.category === "agriculture") return "custom";
  return "custom";
}

function productName(profile: InvestorProfile, locale: Locale) {
  if (profile.customProduct.trim()) return profile.customProduct.trim();
  const option = profile.category ? products[profile.category].find((item) => item.id === profile.productKey) : undefined;
  return option?.[locale] ?? (locale === "ru" ? "Новый проект" : "Жаңа жоба");
}

function scoreCell(cell: AgroCellProps, profile: InvestorProfile, data: AgroCollection) {
  return analyzeSuitability(cell, profile, data.metadata).score;
}

function zoneClass(score: number) {
  if (score >= 75) return "excellent";
  if (score >= 55) return "possible";
  return "weak";
}

function zoneColor(score: number) {
  if (score >= 75) return "#16835d";
  if (score >= 55) return "#e4a72e";
  return "#c95f52";
}

function constraintLabel(code: ConstraintCode, locale: Locale, distanceKm?: number) {
  const distance = distanceKm === undefined ? "" : ` · ${distanceKm.toFixed(1)} км`;
  const ru: Record<ConstraintCode, string> = {
    land_unverified: "Свободный участок и собственник ещё не подтверждены",
    parcel_size_unverified: "Наличие единого участка нужного размера не подтверждено",
    power_far: `Электросеть далеко для выбранной мощности${distance}`,
    power_unknown: "Расстояние до электросети не определено",
    water_far: `Река или канал далеко${distance}`,
    water_unknown: "Ближайшая вода не определена",
    rail_far: `Железная дорога далеко${distance}`,
    rail_unknown: "Ближайшая железная дорога не определена",
  };
  const kk: Record<ConstraintCode, string> = {
    land_unverified: "Бос телім мен меншік иесі әлі расталмаған",
    parcel_size_unverified: "Қажетті көлемдегі біртұтас телім расталмаған",
    power_far: `Таңдалған қуат үшін электр желісі алыс${distance}`,
    power_unknown: "Электр желісіне дейінгі қашықтық анықталмаған",
    water_far: `Өзен немесе канал алыс${distance}`,
    water_unknown: "Ең жақын су нысаны анықталмаған",
    rail_far: `Теміржол алыс${distance}`,
    rail_unknown: "Ең жақын теміржол анықталмаған",
  };
  return (locale === "ru" ? ru : kk)[code];
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const agroLayerRef = useRef<LayerGroup | null>(null);
  const boundaryLayerRef = useRef<LayerGroup | null>(null);
  const siteLayerRef = useRef<LayerGroup | null>(null);
  const regionalLayerRef = useRef<LayerGroup | null>(null);
  const liveLayerRef = useRef<LayerGroup | null>(null);

  const [locale, setLocale] = useState<Locale>("ru");
  const [wizardOpen, setWizardOpen] = useState(true);
  const [wizardStep, setWizardStep] = useState(1);
  const [profile, setProfile] = useState<InvestorProfile>(initialProfile);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [agroData, setAgroData] = useState<AgroCollection | null>(null);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [regionalInfrastructure, setRegionalInfrastructure] = useState<RegionalInfrastructure | null>(null);
  const [sources, setSources] = useState<DataSourceRecord[]>([]);
  const [selectedCell, setSelectedCell] = useState<AgroCellProps | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [liveFeatures, setLiveFeatures] = useState<LiveFeature[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [discoveryCellId, setDiscoveryCellId] = useState("");
  const [visibleNetworks, setVisibleNetworks] = useState({ power: true, rail: true, water: true });
  const [aiAdvice, setAiAdvice] = useState<AiAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [climate, setClimate] = useState<ClimateContext | null>(null);
  const [climateLoading, setClimateLoading] = useState(false);
  const [freeLand, setFreeLand] = useState<FreeLandPayload | null>(null);

  const t = text[locale];
  const currentProduct = productName(profile, locale);

  const rankedCells = useMemo(() => {
    if (!agroData || !analysisReady) return [];
    return agroData.features
      .map((feature) => {
        const analysis = analyzeSuitability(feature.properties, profile, agroData.metadata);
        return { cell: feature.properties, score: analysis.score, analysis };
      })
      .sort((a, b) => b.score - a.score);
  }, [agroData, analysisReady, profile]);

  const selectedAnalysis = useMemo<SuitabilityAnalysis | null>(() => {
    if (!selectedCell || !agroData) return null;
    return analyzeSuitability(selectedCell, profile, agroData.metadata);
  }, [agroData, profile, selectedCell]);
  const selectedScore = selectedAnalysis?.score ?? 0;

  const nearestSite = useMemo(() => {
    if (!selectedCell || !sites.length) return null;
    const site = [...sites].sort((a, b) => distanceBetween(selectedCell.latitude, selectedCell.longitude, a.latitude, a.longitude) - distanceBetween(selectedCell.latitude, selectedCell.longitude, b.latitude, b.longitude))[0];
    return { site, distance: distanceBetween(selectedCell.latitude, selectedCell.longitude, site.latitude, site.longitude) };
  }, [selectedCell, sites]);

  const networkCounts = useMemo(() => ({
    power: (regionalInfrastructure?.metadata.counts?.power_line ?? regionalInfrastructure?.features.filter((feature) => feature.properties.kind === "power_line").length ?? 0),
    rail: liveFeatures.filter((feature) => feature.kind === "rail").length,
    water: liveFeatures.filter((feature) => feature.kind === "water").length,
  }), [liveFeatures, regionalInfrastructure]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/data/agro-suitability.geojson", { signal: controller.signal }).then((response) => response.json() as Promise<AgroCollection>),
      fetch("/api/sites", { signal: controller.signal }).then((response) => response.json() as Promise<{ sites: CatalogSite[] }>),
      fetch("/data/region-infrastructure.geojson", { signal: controller.signal }).then((response) => response.json() as Promise<RegionalInfrastructure>),
      fetch("/api/sources", { signal: controller.signal }).then((response) => response.json() as Promise<{ sources: DataSourceRecord[] }>),
      fetch("/api/land/free", { signal: controller.signal }).then((response) => response.json() as Promise<FreeLandPayload>),
    ]).then(([agro, catalog, infrastructure, sourceCatalog, freeLandPayload]) => {
      setAgroData(agro);
      setSites(catalog.sites ?? []);
      setRegionalInfrastructure(infrastructure);
      setSources(sourceCatalog.sources ?? []);
      setFreeLand(freeLandPayload);
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Regional data unavailable", error);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    async function initializeMap() {
      if (!mapContainer.current || mapRef.current) return;
      try {
        const L = await import("leaflet");
        if (!active || !mapContainer.current) return;
        leafletRef.current = L;
        const map = L.map(mapContainer.current, { zoomControl: false, minZoom: 5, maxZoom: 16, preferCanvas: true }).setView([42.35, 68.55], 7);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors", crossOrigin: true }).addTo(map);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        boundaryLayerRef.current = L.layerGroup().addTo(map);
        agroLayerRef.current = L.layerGroup().addTo(map);
        siteLayerRef.current = L.layerGroup().addTo(map);
        regionalLayerRef.current = L.layerGroup().addTo(map);
        liveLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 120);
        setMapStatus("ready");
      } catch {
        setMapStatus("error");
      }
    }
    initializeMap();
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = boundaryLayerRef.current;
    if (!L || !layer || mapStatus !== "ready") return;
    const controller = new AbortController();
    fetch("/data/turkistan-boundary.geojson", { signal: controller.signal })
      .then((response) => response.json())
      .then((boundary) => {
        if (controller.signal.aborted) return;
        layer.clearLayers();
        L.geoJSON(boundary, { style: { color: "#16453e", weight: 2, opacity: 0.8, fillOpacity: 0 } }).addTo(layer);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [mapStatus]);

  const selectCell = useCallback((cell: AgroCellProps, fly = true) => {
    setSelectedCell(cell);
    if (fly) mapRef.current?.flyTo([cell.latitude, cell.longitude], Math.max(mapRef.current.getZoom(), 8), { duration: 0.6 });
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = agroLayerRef.current;
    if (!L || !layer || !agroData || !analysisReady || mapStatus !== "ready") return;
    layer.clearLayers();
    const safeProduct = escapeHtml(currentProduct);
    L.geoJSON(agroData as never, {
      style: (feature) => {
        const cell = (feature?.properties ?? {}) as AgroCellProps;
        const score = scoreCell(cell, profile, agroData);
        const active = selectedCell?.cell_id === cell.cell_id;
        return {
          color: active ? "#143f39" : "#ffffff",
          weight: active ? 3 : 0.7,
          opacity: active ? 1 : 0.65,
          fillColor: zoneColor(score),
          fillOpacity: active ? 0.78 : 0.6,
        };
      },
      onEachFeature: (feature, mapLayer: Layer) => {
        const cell = (feature.properties ?? {}) as AgroCellProps;
        const score = scoreCell(cell, profile, agroData);
        const level = score >= 75 ? t.excellent : score >= 55 ? t.possible : t.weak;
        mapLayer.bindTooltip(`<strong>${safeProduct}: ${score}/100</strong><br>${escapeHtml(level)}<br>${escapeHtml(t.clickHint)}`, { sticky: true });
        mapLayer.on("click", () => selectCell(cell));
      },
    }).addTo(layer);
  }, [agroData, analysisReady, currentProduct, mapStatus, profile, selectCell, selectedCell?.cell_id, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !agroData || !analysisReady || mapStatus !== "ready") return;
    const handleClick = (event: { latlng: { lat: number; lng: number } }) => {
      const nearest = [...agroData.features].sort((a, b) => distanceBetween(event.latlng.lat, event.latlng.lng, a.properties.latitude, a.properties.longitude) - distanceBetween(event.latlng.lat, event.latlng.lng, b.properties.latitude, b.properties.longitude))[0]?.properties;
      if (nearest) selectCell(nearest, false);
    };
    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [agroData, analysisReady, mapStatus, selectCell]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = siteLayerRef.current;
    if (!L || !layer || mapStatus !== "ready") return;
    layer.clearLayers();
    sites.forEach((site) => {
      const marker = L.circleMarker([site.latitude, site.longitude], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#0f5d52", fillOpacity: 0.95 });
      marker.bindTooltip(`<strong>${escapeHtml(site.name)}</strong><br>${escapeHtml(locale === "ru" ? "Инвестиционная площадка" : "Инвестициялық алаң")}`);
      marker.addTo(layer);
    });
  }, [locale, mapStatus, sites]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = regionalLayerRef.current;
    if (!L || !layer || !regionalInfrastructure || mapStatus !== "ready") return;
    layer.clearLayers();
    if (!visibleNetworks.power) return;
    regionalInfrastructure.features.forEach((feature) => {
      const geometry = feature.geometry;
      const label = `${escapeHtml(feature.properties.name ?? (locale === "ru" ? "Объект электросети" : "Электр желісі нысаны"))}${feature.properties.voltage_kv ? ` · ${feature.properties.voltage_kv} kV` : ""}`;
      if (geometry.type === "LineString") {
        const coordinates = geometry.coordinates as Array<[number, number]>;
        L.polyline(coordinates.map(([longitude, latitude]) => [latitude, longitude]), {
          color: feature.properties.voltage_kv && feature.properties.voltage_kv >= 110 ? "#d97810" : "#eea13d",
          weight: feature.properties.voltage_kv && feature.properties.voltage_kv >= 110 ? 2.5 : 1.4,
          opacity: 0.76,
        }).bindTooltip(label, { sticky: true }).addTo(layer);
      } else {
        const [longitude, latitude] = geometry.coordinates as [number, number];
        L.circleMarker([latitude, longitude], { radius: 3.5, color: "#fff", weight: 1, fillColor: "#d97810", fillOpacity: 0.9 })
          .bindTooltip(label)
          .addTo(layer);
      }
    });
  }, [locale, mapStatus, regionalInfrastructure, visibleNetworks.power]);

  const discoverInfrastructure = useCallback(async (cell: AgroCellProps) => {
    setLiveLoading(true);
    setDiscoveryCellId("");
    try {
      const params = new URLSearchParams({ lat: String(cell.latitude), lng: String(cell.longitude), radius: "30000" });
      const response = await fetch(`/api/geo/discover?${params}`);
      const payload = (await response.json()) as { features?: LiveFeature[] };
      setLiveFeatures(response.ok ? payload.features ?? [] : []);
    } catch {
      setLiveFeatures([]);
    } finally {
      setLiveLoading(false);
      setDiscoveryCellId(cell.cell_id);
    }
  }, []);

  useEffect(() => {
    if (!selectedCell || !analysisReady) return;
    const timer = window.setTimeout(() => discoverInfrastructure(selectedCell), 250);
    return () => window.clearTimeout(timer);
  }, [analysisReady, discoverInfrastructure, selectedCell]);

  useEffect(() => {
    if (!selectedCell || !analysisReady) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setClimateLoading(true);
      setClimate(null);
      try {
        const params = new URLSearchParams({ lat: String(selectedCell.latitude), lon: String(selectedCell.longitude) });
        const response = await fetch(`/api/climate?${params}`, { signal: controller.signal });
        if (response.ok) {
          const payload = await response.json() as { climate?: ClimateContext };
          setClimate(payload.climate ?? null);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setClimate(null);
      } finally {
        if (!controller.signal.aborted) setClimateLoading(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [analysisReady, selectedCell]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = liveLayerRef.current;
    if (!L || !layer || mapStatus !== "ready") return;
    layer.clearLayers();
    liveFeatures.filter((feature) => feature.kind in visibleNetworks && visibleNetworks[feature.kind as keyof typeof visibleNetworks]).forEach((feature) => {
      const label = `${escapeHtml(feature.name)} · ${escapeHtml(feature.detail)}`;
      const color = feature.kind === "power" ? "#e9901a" : feature.kind === "rail" ? "#394d4a" : "#2387b7";
      if (feature.geometry && feature.geometry.length > 1) {
        const path = L.polyline(feature.geometry, { color, weight: feature.kind === "power" ? 4 : 2.5, opacity: 0.9, dashArray: feature.kind === "rail" ? "8 5" : undefined });
        path.bindTooltip(label, { sticky: true });
        path.addTo(layer);
      } else {
        const symbol = feature.kind === "power" ? "⚡" : feature.kind === "rail" ? "R" : "W";
        const icon = L.divIcon({ className: "network-marker-shell", html: `<div class="network-marker ${feature.kind}">${symbol}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        L.marker([feature.latitude, feature.longitude], { icon }).bindTooltip(label).addTo(layer);
      }
    });
  }, [liveFeatures, mapStatus, visibleNetworks]);

  useEffect(() => {
    if (!analysisReady || !rankedCells.length || selectedCell) return;
    const timer = window.setTimeout(() => selectCell(rankedCells[0].cell, true), 0);
    return () => window.clearTimeout(timer);
  }, [analysisReady, rankedCells, selectCell, selectedCell]);

  useEffect(() => {
    if (!selectedCell || !selectedAnalysis || !analysisReady || discoveryCellId !== selectedCell.cell_id || liveLoading) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiLoading(true);
      setAiAdvice(null);
      try {
        const response = await fetch("/api/ai/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            locale,
            profile: { ...profile, product: productName(profile, locale), kind: productKind(profile) },
            zone: { ...selectedCell, score: selectedScore, decisionConfidence: selectedAnalysis.confidence, constraints: selectedAnalysis.constraints },
            infrastructure: selectedAnalysis.distances,
            climate,
            nearbySite: nearestSite ? { name: nearestSite.site.name, distanceKm: Number(nearestSite.distance.toFixed(1)), ownershipStatus: nearestSite.site.ownershipStatus } : null,
          }),
        });
        if (!response.ok) throw new Error("Advisor unavailable");
        setAiAdvice(await response.json() as AiAdvice);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setAiAdvice(null);
      } finally {
        if (!controller.signal.aborted) setAiLoading(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [analysisReady, climate, discoveryCellId, liveLoading, locale, nearestSite, profile, selectedAnalysis, selectedCell, selectedScore]);

  function completeWizard() {
    setAnalysisReady(true);
    setSelectedCell(null);
    setAiAdvice(null);
    setWizardOpen(false);
    window.setTimeout(() => mapRef.current?.invalidateSize(), 100);
  }

  function chooseCategory(category: Category) {
    setProfile((state) => ({ ...state, category, productKey: "", customProduct: "", waterNeed: category === "agriculture", railNeeded: category === "logistics" }));
  }

  function canContinue() {
    if (wizardStep === 1) return Boolean(profile.category);
    if (wizardStep === 2) return Boolean(profile.productKey || profile.customProduct.trim());
    return true;
  }

  function downloadBrief() {
    if (!selectedCell || !selectedAnalysis || !aiAdvice) return;
    const content = [
      `ALPHA TURKISTAN — ${currentProduct}`,
      `${t.selectedZone}: ${selectedCell.cell_id} (${selectedCell.latitude.toFixed(4)}, ${selectedCell.longitude.toFixed(4)})`,
      `${locale === "ru" ? "Оценка" : "Баға"}: ${selectedScore}/100`,
      `${locale === "ru" ? "Уверенность данных" : "Деректер сенімділігі"}: ${selectedAnalysis.confidence}/100`,
      `${locale === "ru" ? "Электросеть" : "Электр желісі"}: ${selectedAnalysis.distances.powerKm ?? "?"} км`,
      `${locale === "ru" ? "Вода/канал" : "Су/канал"}: ${selectedAnalysis.distances.waterKm ?? "?"} км`,
      `${locale === "ru" ? "Железная дорога" : "Теміржол"}: ${selectedAnalysis.distances.railKm ?? "?"} км`,
      "",
      aiAdvice.summary,
      "",
      t.pluses.toUpperCase(),
      ...aiAdvice.pluses.map((item) => `+ ${item}`),
      "",
      t.minuses.toUpperCase(),
      ...aiAdvice.minuses.map((item) => `- ${item}`),
      "",
      t.steps.toUpperCase(),
      ...aiAdvice.nextSteps.map((item, index) => `${index + 1}. ${item}`),
      "",
      locale === "ru" ? "ОГРАНИЧЕНИЯ ДАННЫХ" : "ДЕРЕКТЕР ШЕКТЕУЛЕРІ",
      ...selectedAnalysis.constraints.map((item) => `- ${constraintLabel(item.code, locale, item.distanceKm)}`),
      "",
      t.dataNote,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `alpha-turkistan-${selectedCell.cell_id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const category = profile.category ? categories.find((item) => item.id === profile.category) : null;
  const goodZones = rankedCells.filter((item) => item.analysis.status === "excellent").length;
  const connectedSources = sources.filter((source) => source.status === "connected").length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><img src="/turkistan-invest-logo.png" alt="" /></span><div><strong>TURKISTAN INVEST</strong><small>{t.subtitle}</small></div></div>
        <div className="region"><span>●</span><div><small>{locale === "ru" ? "Регион" : "Өңір"}</small><strong>{t.region}</strong></div></div>
        <div className="top-actions">
          <div className="language-switch" aria-label={t.language}><button type="button" className={locale === "ru" ? "active" : ""} onClick={() => setLocale("ru")}>РУС</button><button type="button" className={locale === "kk" ? "active" : ""} onClick={() => setLocale("kk")}>ҚАЗ</button></div>
          {analysisReady && <button type="button" className="edit-project" onClick={() => { setWizardStep(1); setWizardOpen(true); }}>{t.editProject}</button>}
        </div>
      </header>

      <section className="investor-workspace">
        <aside className="project-panel">
          <div className="panel-scroll">
            <span className="eyebrow">{t.project}</span>
            <h1>{analysisReady ? currentProduct : t.wizardTitle}</h1>
            {analysisReady ? <>
              <div className="project-summary">
                <span>{category?.icon}</span>
                <div><strong>{category?.[locale]}</strong><small>{profile.sizeHa} {locale === "ru" ? "га земли" : "га жер"} · {t[profile.powerNeed]}</small></div>
              </div>
              <button type="button" className="plain-link" onClick={() => { setWizardStep(1); setWizardOpen(true); }}>{t.change}</button>
              <div className="panel-divider" />
              <div className="section-heading"><div><span className="eyebrow">{t.bestZones}</span><strong>{goodZones} {t.zonesFound}</strong></div><small>{t.bestZonesHint}</small></div>
              <div className="top-zone-list">
                {rankedCells.slice(0, 4).map((item, index) => <button type="button" key={item.cell.cell_id} className={selectedCell?.cell_id === item.cell.cell_id ? "active" : ""} onClick={() => selectCell(item.cell)}><span className="rank">{index + 1}</span><div><strong>{locale === "ru" ? "Зона" : "Аймақ"} {item.cell.cell_id}</strong><small>{item.analysis.constraints.some((constraint) => constraint.blocking) ? (locale === "ru" ? "Есть критическое условие" : "Маңызды шарт бар") : `${locale === "ru" ? "уверенность" : "сенімділік"} ${item.analysis.confidence}%`}</small></div><b>{item.score}</b></button>)}
              </div>
              <div className="data-source"><span>◎</span><p><strong>{locale === "ru" ? "На чём основана карта" : "Карта неге негізделген"}</strong><small>{t.source}</small></p></div>
              <details className="source-catalog">
                <summary>{locale === "ru" ? `Источники данных: ${connectedSources} подключено / ${sources.length} изучено` : `Дереккөздер: ${connectedSources} қосылды / ${sources.length} зерттелді`}</summary>
                <div>{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span className={`source-status ${source.status}`} /> <strong>{localizedSourceTitle(source, locale)}</strong><small>{source.status === "connected" ? (locale === "ru" ? "используется сейчас" : "қазір қолданылады") : source.status === "credentials_required" ? (locale === "ru" ? "нужен API-ключ" : "API кілті қажет") : source.status === "offline_pipeline" ? (locale === "ru" ? "готово к офлайн-интеграции" : "офлайн біріктіруге дайын") : (locale === "ru" ? "официальная проверка" : "ресми тексеру")}</small></a>)}</div>
              </details>
            </> : <p className="empty-copy">{t.wizardLead}</p>}
          </div>
        </aside>

        <section className="map-stage" aria-label={locale === "ru" ? "Интерактивная карта лучших зон" : "Үздік аймақтардың интерактивті картасы"}>
          <div ref={mapContainer} className="map-container" />
          {mapStatus !== "ready" && <div className="map-loading"><strong>{mapStatus === "error" ? t.mapError : t.mapLoading}</strong></div>}
          {analysisReady && <>
            <div className="map-project-title"><span>{t.mapTitle}</span><strong>{currentProduct}</strong><small>{rankedCells.length} {locale === "ru" ? "проанализированных зон" : "талданған аймақ"}</small></div>
            <div className="network-controls">
              {(["power", "rail", "water"] as const).map((kind) => <button type="button" key={kind} className={`${kind} ${visibleNetworks[kind] ? "active" : ""}`} aria-pressed={visibleNetworks[kind]} onClick={() => setVisibleNetworks((state) => ({ ...state, [kind]: !state[kind] }))}><i />{t[kind]} <b>{liveLoading ? "…" : networkCounts[kind]}</b></button>)}
            </div>
            <div className="map-legend"><span><i className="excellent" />{t.excellent} 75–100</span><span><i className="possible" />{t.possible} 55–74</span><span><i className="weak" />{t.weak} 0–54</span></div>
          </>}
        </section>

        <aside className="advice-panel">
          <div className="advice-scroll">
            {selectedCell && selectedAnalysis && analysisReady ? <>
              <div className="zone-heading"><div><span className="eyebrow">{t.selectedZone} · {selectedCell.cell_id}</span><h2>{t.why}</h2><small>{selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)}</small></div><div className={`score-badge ${zoneClass(selectedScore)}`}><strong>{selectedScore}</strong><span>/100</span></div></div>
              <div className={`plain-verdict ${selectedAnalysis.status}`}><strong>{selectedAnalysis.status === "excellent" ? t.excellent : selectedAnalysis.status === "possible" ? t.possible : t.weak}</strong><span>{locale === "ru" ? `уверенность ${selectedAnalysis.confidence}%` : `сенімділік ${selectedAnalysis.confidence}%`}</span></div>

              <section className="connected-data-overview">
                <div className="connected-data-heading">
                  <h3>{locale === "ru" ? "Подключённые данные" : "Қосылған деректер"}</h3>
                  <span>{locale === "ru" ? "обновляются" : "жаңартылады"}</span>
                </div>
                <div className="connected-data-grid">
                  <div className={`connected-data-item groq ${aiAdvice?.provider === "rules" ? "fallback" : ""}`}><i /><small>Groq AI</small><strong>{aiLoading ? (locale === "ru" ? "Проверяем…" : "Тексерілуде…") : aiAdvice?.provider === "groq" ? (locale === "ru" ? "Работает" : "Жұмыс істейді") : (locale === "ru" ? "Резервный режим" : "Қосалқы режим")}</strong></div>
                  <div className={`connected-data-item egov ${freeLand?.meta.status ?? "loading"}`}><i /><small>eGov · {locale === "ru" ? "земли" : "жерлер"}</small><strong>{!freeLand ? (locale === "ru" ? "Загружаем…" : "Жүктелуде…") : freeLand.records.length ? `${freeLand.records.length} ${locale === "ru" ? "записей" : "жазба"}` : freeLand.meta.status === "credentials_required" ? (locale === "ru" ? "Нужен API-ключ" : "API кілті қажет") : freeLand.meta.status === "unavailable" ? (locale === "ru" ? "Нет ответа" : "Жауап жоқ") : (locale === "ru" ? "Подключён" : "Қосылды")}</strong></div>
                  <div className={`connected-data-item climate ${!climateLoading && !climate ? "unavailable" : ""}`}><i /><small>{locale === "ru" ? "Температура" : "Температура"}</small><strong>{climateLoading ? "…" : climate?.temperatureC !== null && climate?.temperatureC !== undefined ? `${climate.temperatureC.toFixed(1)} °C` : "—"}</strong></div>
                  <div className={`connected-data-item climate ${!climateLoading && !climate ? "unavailable" : ""}`}><i /><small>{locale === "ru" ? "Осадки" : "Жауын-шашын"}</small><strong>{climateLoading ? "…" : climate?.precipitationMmDay !== null && climate?.precipitationMmDay !== undefined ? `${climate.precipitationMmDay.toFixed(1)} ${locale === "ru" ? "мм/сут" : "мм/тәул"}` : "—"}</strong></div>
                </div>
                <p>{locale === "ru" ? "Климат: NASA POWER, средние значения 2001–2020 (не прогноз)." : "Климат: NASA POWER, 2001–2020 орташа мәндері (болжам емес)."}</p>
              </section>

              <section className="score-breakdown">
                <div className="breakdown-title"><h3>{locale === "ru" ? "Из чего состоит оценка" : "Баға неден тұрады"}</h3><small>alpha-suitability-v2</small></div>
                {([
                  [locale === "ru" ? "Земля и культура" : "Жер және дақыл", selectedAnalysis.components.landAndCrop],
                  [t.power, selectedAnalysis.components.electricity],
                  [t.water, selectedAnalysis.components.water],
                  [locale === "ru" ? "Логистика" : "Логистика", selectedAnalysis.components.logistics],
                ] as Array<[string, number]>).map(([label, value]) => <div className="score-component" key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}</strong></div>)}
              </section>

              <section className="constraint-section">
                <h3>{locale === "ru" ? "Что ограничивает вывод" : "Қорытындыны не шектейді"}</h3>
                {selectedAnalysis.constraints.map((constraint) => <p className={constraint.blocking ? "blocking" : "caution"} key={constraint.code}><b>{constraint.blocking ? "!" : "i"}</b>{constraintLabel(constraint.code, locale, constraint.distanceKm)}</p>)}
              </section>
              {aiLoading || !aiAdvice ? <div className="advice-loading"><span /><strong>{t.checking}</strong></div> : <>
                <div className="ai-source"><span>✦</span><div><strong>{aiAdvice.title}</strong><small>{aiAdvice.provider === "groq" ? t.aiGroq : t.aiRules}</small></div></div>
                <p className="advice-summary">{aiAdvice.summary}</p>
                <section className="human-list plus"><h3><span>+</span>{t.pluses}</h3>{aiAdvice.pluses.map((item) => <p key={item}>{item}</p>)}</section>
                <section className="human-list minus"><h3><span>!</span>{t.minuses}</h3>{aiAdvice.minuses.map((item) => <p key={item}>{item}</p>)}</section>
                <section className="next-steps"><h3>{t.steps}</h3>{aiAdvice.nextSteps.map((item, index) => <p key={item}><b>{index + 1}</b>{item}</p>)}</section>
              </>}

              <section className="facts-section">
                <h3>{locale === "ru" ? "Что находится рядом" : "Жақын жерде не бар"}</h3>
                <div className="fact-row"><span className="fact-icon power">⚡</span><div><small>{t.power}</small><strong>{selectedAnalysis.distances.powerKm !== null ? `${selectedAnalysis.distances.powerKm} км` : locale === "ru" ? "Нет данных" : "Дерек жоқ"}</strong><em>{locale === "ru" ? "до нанесённой линии/подстанции; мощность не подтверждена" : "картадағы желіге/қосалқы станцияға дейін; қуат расталмаған"}</em></div></div>
                <div className="fact-row"><span className="fact-icon water">≈</span><div><small>{t.water}</small><strong>{selectedAnalysis.distances.waterKm !== null ? `${selectedAnalysis.distances.waterKm} км` : locale === "ru" ? "Нет данных" : "Дерек жоқ"}</strong><em>{locale === "ru" ? "до нанесённой реки/канала; расход и право не подтверждены" : "картадағы өзенге/каналға дейін; шығын мен құқық расталмаған"}</em></div></div>
                <div className="fact-row"><span className="fact-icon rail">═</span><div><small>{t.rail}</small><strong>{selectedAnalysis.distances.railKm !== null ? `${selectedAnalysis.distances.railKm} км` : locale === "ru" ? "Нет данных" : "Дерек жоқ"}</strong><em>{locale === "ru" ? "до нанесённой железнодорожной линии" : "картадағы теміржол желісіне дейін"}</em></div></div>
              </section>

              <section className="climate-section">
                <div><h3>{locale === "ru" ? "Климатический фон" : "Климаттық жағдай"}</h3><a href="https://power.larc.nasa.gov/docs/services/api/temporal/climatology/" target="_blank" rel="noreferrer">NASA POWER ↗</a></div>
                {climateLoading ? <p>{locale === "ru" ? "Загружаем климатологию…" : "Климатология жүктелуде…"}</p> : climate ? <div className="climate-grid"><span><small>{locale === "ru" ? "Температура" : "Температура"}</small><strong>{climate.temperatureC?.toFixed(1) ?? "—"} °C</strong></span><span><small>{locale === "ru" ? "Осадки" : "Жауын-шашын"}</small><strong>{climate.precipitationMmDay?.toFixed(1) ?? "—"} {locale === "ru" ? "мм/сут" : "мм/тәул"}</strong></span><span><small>{locale === "ru" ? "Солнце" : "Күн"}</small><strong>{climate.solarKwhM2Day?.toFixed(1) ?? "—"} {locale === "ru" ? "кВт·ч/м²/сут" : "кВт·сағ/м²/тәул"}</strong></span><span><small>{locale === "ru" ? "Ветер 10 м" : "10 м жел"}</small><strong>{climate.windMs?.toFixed(1) ?? "—"} м/с</strong></span></div> : <p>{locale === "ru" ? "Сервис временно недоступен; оценка не подменена выдуманными значениями." : "Сервис уақытша қолжетімсіз; баға ойдан шығарылған мәндермен алмастырылмады."}</p>}
                <p>{locale === "ru" ? "Средние климатические значения за 2001–2020 годы, не прогноз погоды." : "2001–2020 жылдардағы орташа климаттық мәндер, ауа райы болжамы емес."}</p>
              </section>

              <section className="ownership-section">
                <h3>{t.ownership}</h3>
                <div><span>▱</span><p><strong>{t.ownershipUnknown}</strong>{nearestSite && <small>{t.nearbySite}: {nearestSite.site.name} · {nearestSite.distance.toFixed(1)} км</small>}</p></div>
                {freeLand ? <details className="free-land-data">
                  <summary>
                    <span className={`free-land-dot ${freeLand.meta.status}`} />
                    {freeLand.records.length
                      ? (locale === "ru" ? `eGov подключён · ${freeLand.records.length} районных записей` : `eGov қосылды · ${freeLand.records.length} аудандық жазба`)
                      : (locale === "ru" ? "Статус официальных данных eGov" : "eGov ресми деректерінің күйі")}
                  </summary>
                  <div>
                    {freeLand.meta.warning && <p className="free-land-warning">{freeLand.meta.warning[locale]}</p>}
                    {freeLand.meta.status === "credentials_required" && <p className="free-land-empty">{locale === "ru" ? "Для получения записей нужен серверный API-ключ eGov." : "Жазбаларды алу үшін серверлік eGov API кілті қажет."}</p>}
                    {freeLand.meta.status === "unavailable" && <p className="free-land-empty">{locale === "ru" ? "Сервис eGov временно не ответил. Оценка зоны не подменяется выдуманными сведениями." : "eGov қызметі уақытша жауап бермеді. Аймақ бағасы ойдан шығарылған деректермен алмастырылмайды."}</p>}
                    {freeLand.records.length > 0 && <div className="free-land-list">
                      {freeLand.records.map((record) => <span key={record.id}><strong>{record.district}</strong><small>{record.areaThousandHa !== null ? `${record.areaThousandHa.toLocaleString(locale === "ru" ? "ru-RU" : "kk-KZ", { maximumFractionDigits: 2 })} ${locale === "ru" ? "тыс. га" : "мың га"}` : "—"}</small></span>)}
                    </div>}
                    <small className="free-land-limitation">{locale === "ru" ? "В наборе нет координат и кадастровых границ, поэтому эти записи нельзя честно показать точками на карте." : "Жинақта координаттар мен кадастрлық шекаралар жоқ, сондықтан бұл жазбаларды картада нүкте ретінде дұрыс көрсету мүмкін емес."}</small>
                  </div>
                </details> : <p className="free-land-loading">{locale === "ru" ? "Проверяем официальный источник eGov…" : "eGov ресми дереккөзі тексерілуде…"}</p>}
                <a href="https://map.gov4c.kz/egkn/" target="_blank" rel="noreferrer">{t.cadastral}</a>
                <a href="https://data.egov.kz/datasets/view?index=turkistan_oblysy_boiynsha_bos_" target="_blank" rel="noreferrer">{locale === "ru" ? "Открыть официальный список свободных земель ↗" : "Бос жерлердің ресми тізімін ашу ↗"}</a>
              </section>

              <details className="technical-details"><summary>{t.indicators}</summary><div className="technical-grid"><div><span>NDVI · {t.vegetation}</span><strong>{selectedCell.ndvi.toFixed(3)}</strong></div><div><span>NDWI · {t.moisture}</span><strong>{selectedCell.ndwi.toFixed(3)}</strong></div><div><span>NDBI · {t.builtDry}</span><strong>{selectedCell.ndbi.toFixed(3)}</strong></div><div><span>{t.dataQuality}</span><strong>{selectedCell.confidence}%</strong></div></div></details>
              <p className="screening-note">{t.dataNote}</p>
            </> : <div className="no-zone"><span>↖</span><strong>{t.wizardTitle}</strong><p>{t.wizardLead}</p></div>}
          </div>
          {selectedCell && aiAdvice && <button type="button" className="download-brief" onClick={downloadBrief}>{t.download} ↓</button>}
        </aside>
      </section>

      {wizardOpen && <div className="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <section className="wizard-card">
          <div className="wizard-top"><div className="wizard-brand"><span className="brand-mark"><img src="/turkistan-invest-logo.png" alt="" /></span><div><strong>TURKISTAN INVEST</strong><small>{t.subtitle}</small></div></div><div className="language-switch"><button type="button" className={locale === "ru" ? "active" : ""} onClick={() => setLocale("ru")}>РУС</button><button type="button" className={locale === "kk" ? "active" : ""} onClick={() => setLocale("kk")}>ҚАЗ</button></div></div>
          <div className="wizard-progress"><span>{t.step} {wizardStep} {t.of} 3</span><i><b style={{ width: `${wizardStep / 3 * 100}%` }} /></i></div>
          <div className="wizard-copy"><h2 id="wizard-title">{wizardStep === 1 ? t.categoryQuestion : wizardStep === 2 ? t.productQuestion : t.needsQuestion}</h2><p>{wizardStep === 1 ? t.wizardLead : wizardStep === 2 ? t.productHint : locale === "ru" ? "Эти ответы помогут учесть инфраструктуру и масштаб." : "Бұл жауаптар инфрақұрылым мен ауқымды ескеруге көмектеседі."}</p></div>

          {wizardStep === 1 && <div className="category-grid">{categories.map((item) => <button type="button" key={item.id} className={profile.category === item.id ? "active" : ""} onClick={() => chooseCategory(item.id)}><span>{item.icon}</span><div><strong>{item[locale]}</strong><small>{locale === "ru" ? item.ruHint : item.kkHint}</small></div><i>›</i></button>)}</div>}

          {wizardStep === 2 && <div className="product-step"><div className="product-grid">{profile.category && products[profile.category].map((item) => <button type="button" key={item.id} className={profile.productKey === item.id && !profile.customProduct ? "active" : ""} onClick={() => setProfile((state) => ({ ...state, productKey: item.id, customProduct: "" }))}>{item[locale]}</button>)}</div><label className="custom-product"><span>{t.ownVariant}</span><textarea value={profile.customProduct} onChange={(event) => setProfile((state) => ({ ...state, customProduct: event.target.value, productKey: event.target.value ? "" : state.productKey }))} placeholder={t.ownPlaceholder} rows={3} /></label></div>}

          {wizardStep === 3 && <div className="needs-grid"><label><span>{t.landArea}</span><input type="number" min="1" max="10000" value={profile.sizeHa} onChange={(event) => setProfile((state) => ({ ...state, sizeHa: Math.max(1, Number(event.target.value)) }))} /></label><fieldset><legend>{t.powerNeed}</legend><div className="segmented">{(["low", "medium", "high"] as const).map((level) => <button type="button" key={level} className={profile.powerNeed === level ? "active" : ""} onClick={() => setProfile((state) => ({ ...state, powerNeed: level }))}>{t[level]}</button>)}</div></fieldset><label className="check-line"><input type="checkbox" checked={profile.waterNeed} onChange={(event) => setProfile((state) => ({ ...state, waterNeed: event.target.checked }))} /><span><b>≈</b>{t.waterNeed}</span></label><label className="check-line"><input type="checkbox" checked={profile.railNeeded} onChange={(event) => setProfile((state) => ({ ...state, railNeeded: event.target.checked }))} /><span><b>═</b>{t.railNeed}</span></label></div>}

          <div className="wizard-actions"><button type="button" className="back-button" disabled={wizardStep === 1} onClick={() => setWizardStep((step) => Math.max(1, step - 1))}>{t.back}</button>{wizardStep < 3 ? <button type="button" className="primary-button" disabled={!canContinue()} onClick={() => setWizardStep((step) => Math.min(3, step + 1))}>{t.next} →</button> : <button type="button" className="primary-button" onClick={completeWizard}>{t.showMap} →</button>}</div>
        </section>
      </div>}
    </main>
  );
}
