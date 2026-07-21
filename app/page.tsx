"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layer, LayerGroup, Map as LeafletMap } from "leaflet";
import type { CatalogSite } from "../lib/catalog";
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
};

type AgroFeature = { type: "Feature"; properties: AgroCellProps; geometry: object };
type AgroCollection = {
  type: "FeatureCollection";
  metadata: {
    source: string;
    method: string;
    limitations: string[];
    normalization_percentiles: Record<string, { p10: number; p90: number }>;
  };
  features: AgroFeature[];
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

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

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

function normalized(value: number, key: string, data: AgroCollection) {
  const range = data.metadata.normalization_percentiles[key];
  if (!range || range.p90 <= range.p10) return 50;
  return clamp(((value - range.p10) / (range.p90 - range.p10)) * 100);
}

function scoreCell(cell: AgroCellProps, profile: InvestorProfile, data: AgroCollection, sites: CatalogSite[]) {
  const kind = productKind(profile);
  const ndvi = normalized(cell.ndvi, "ndvi", data);
  const ndwi = normalized(cell.ndwi, "ndwi", data);
  const ndmi = normalized(cell.ndmi, "ndmi", data);
  const ndbi = normalized(cell.ndbi, "ndbi", data);
  const bsi = normalized(cell.bsi, "bsi", data);
  const nearestSiteDistance = sites.length
    ? Math.min(...sites.map((site) => distanceBetween(cell.latitude, cell.longitude, site.latitude, site.longitude)))
    : 50;
  const infrastructureProxy = clamp(100 - nearestSiteDistance * 2.1);

  if (kind === "wheat") return clamp(ndvi * 0.4 + (100 - bsi) * 0.2 + (100 - Math.abs(ndmi - 48) * 1.4) * 0.2 + cell.confidence * 0.2);
  if (kind === "soy") return clamp(cell.soy * 0.88 + infrastructureProxy * 0.12);
  if (kind === "rice") return clamp(cell.rice * 0.82 + ndwi * 0.12 + infrastructureProxy * 0.06);
  if (kind === "cotton") return clamp(cell.cotton * 0.86 + infrastructureProxy * 0.14);
  if (kind === "vegetables") return clamp(cell.vegetables * 0.78 + ndwi * 0.1 + infrastructureProxy * 0.12);
  if (kind === "solar") return clamp(cell.solar * 0.82 + infrastructureProxy * 0.18);
  if (kind === "factory") return clamp(cell.industrial_land * 0.62 + infrastructureProxy * 0.38);
  if (kind === "logistics") return clamp(cell.industrial_land * 0.48 + ndbi * 0.18 + infrastructureProxy * 0.34);
  const agriculturalAverage = (cell.soy + cell.cotton + cell.vegetables) / 3;
  return clamp(profile.category === "agriculture" ? agriculturalAverage * 0.82 + ndvi * 0.18 : cell.industrial_land * 0.55 + infrastructureProxy * 0.45);
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

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const agroLayerRef = useRef<LayerGroup | null>(null);
  const boundaryLayerRef = useRef<LayerGroup | null>(null);
  const siteLayerRef = useRef<LayerGroup | null>(null);
  const liveLayerRef = useRef<LayerGroup | null>(null);

  const [locale, setLocale] = useState<Locale>("ru");
  const [wizardOpen, setWizardOpen] = useState(true);
  const [wizardStep, setWizardStep] = useState(1);
  const [profile, setProfile] = useState<InvestorProfile>(initialProfile);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [agroData, setAgroData] = useState<AgroCollection | null>(null);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [selectedCell, setSelectedCell] = useState<AgroCellProps | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [liveFeatures, setLiveFeatures] = useState<LiveFeature[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [discoveryCellId, setDiscoveryCellId] = useState("");
  const [visibleNetworks, setVisibleNetworks] = useState({ power: true, rail: true, water: true });
  const [aiAdvice, setAiAdvice] = useState<AiAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const t = text[locale];
  const currentProduct = productName(profile, locale);

  const rankedCells = useMemo(() => {
    if (!agroData || !analysisReady) return [];
    return agroData.features
      .map((feature) => ({ cell: feature.properties, score: scoreCell(feature.properties, profile, agroData, sites) }))
      .sort((a, b) => b.score - a.score);
  }, [agroData, analysisReady, profile, sites]);

  const selectedScore = useMemo(() => {
    if (!selectedCell || !agroData) return 0;
    return scoreCell(selectedCell, profile, agroData, sites);
  }, [agroData, profile, selectedCell, sites]);

  const nearestSite = useMemo(() => {
    if (!selectedCell || !sites.length) return null;
    const site = [...sites].sort((a, b) => distanceBetween(selectedCell.latitude, selectedCell.longitude, a.latitude, a.longitude) - distanceBetween(selectedCell.latitude, selectedCell.longitude, b.latitude, b.longitude))[0];
    return { site, distance: distanceBetween(selectedCell.latitude, selectedCell.longitude, site.latitude, site.longitude) };
  }, [selectedCell, sites]);

  const nearestInfrastructure = useMemo(() => {
    const nearest = (kind: LiveFeature["kind"]) => liveFeatures.filter((feature) => feature.kind === kind).sort((a, b) => a.distanceKm - b.distanceKm)[0];
    return { power: nearest("power"), rail: nearest("rail"), water: nearest("water") };
  }, [liveFeatures]);

  const networkCounts = useMemo(() => ({
    power: liveFeatures.filter((feature) => feature.kind === "power").length,
    rail: liveFeatures.filter((feature) => feature.kind === "rail").length,
    water: liveFeatures.filter((feature) => feature.kind === "water").length,
  }), [liveFeatures]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/data/agro-suitability.geojson", { signal: controller.signal }).then((response) => response.json() as Promise<AgroCollection>),
      fetch("/api/sites", { signal: controller.signal }).then((response) => response.json() as Promise<{ sites: CatalogSite[] }>),
    ]).then(([agro, catalog]) => {
      setAgroData(agro);
      setSites(catalog.sites ?? []);
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
        const score = scoreCell(cell, profile, agroData, sites);
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
        const score = scoreCell(cell, profile, agroData, sites);
        const level = score >= 75 ? t.excellent : score >= 55 ? t.possible : t.weak;
        mapLayer.bindTooltip(`<strong>${safeProduct}: ${score}/100</strong><br>${escapeHtml(level)}<br>${escapeHtml(t.clickHint)}`, { sticky: true });
        mapLayer.on("click", () => selectCell(cell));
      },
    }).addTo(layer);
  }, [agroData, analysisReady, currentProduct, mapStatus, profile, selectCell, selectedCell?.cell_id, sites, t]);

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
    selectCell(rankedCells[0].cell, true);
  }, [analysisReady, rankedCells, selectCell, selectedCell]);

  useEffect(() => {
    if (!selectedCell || !analysisReady || discoveryCellId !== selectedCell.cell_id || liveLoading) return;
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
            zone: { ...selectedCell, score: selectedScore },
            infrastructure: {
              powerKm: nearestInfrastructure.power?.distanceKm ?? null,
              railKm: nearestInfrastructure.rail?.distanceKm ?? null,
              waterKm: nearestInfrastructure.water?.distanceKm ?? null,
            },
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
  }, [analysisReady, discoveryCellId, liveLoading, locale, nearestInfrastructure, nearestSite, profile, selectedCell, selectedScore]);

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
    if (!selectedCell || !aiAdvice) return;
    const content = [
      `ALPHA TURKISTAN — ${currentProduct}`,
      `${t.selectedZone}: ${selectedCell.cell_id} (${selectedCell.latitude.toFixed(4)}, ${selectedCell.longitude.toFixed(4)})`,
      `${locale === "ru" ? "Оценка" : "Баға"}: ${selectedScore}/100`,
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
  const goodZones = rankedCells.filter((item) => item.score >= 75).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">A</span><div><strong>ALPHA TURKISTAN</strong><small>{t.subtitle}</small></div></div>
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
                {rankedCells.slice(0, 4).map((item, index) => <button type="button" key={item.cell.cell_id} className={selectedCell?.cell_id === item.cell.cell_id ? "active" : ""} onClick={() => selectCell(item.cell)}><span className="rank">{index + 1}</span><div><strong>{locale === "ru" ? "Зона" : "Аймақ"} {item.cell.cell_id}</strong><small>{item.cell.latitude.toFixed(3)}, {item.cell.longitude.toFixed(3)}</small></div><b>{item.score}</b></button>)}
              </div>
              <div className="data-source"><span>◎</span><p><strong>{locale === "ru" ? "На чём основана карта" : "Карта неге негізделген"}</strong><small>{t.source}</small></p></div>
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
            {selectedCell && analysisReady ? <>
              <div className="zone-heading"><div><span className="eyebrow">{t.selectedZone} · {selectedCell.cell_id}</span><h2>{t.why}</h2><small>{selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)}</small></div><div className={`score-badge ${zoneClass(selectedScore)}`}><strong>{selectedScore}</strong><span>/100</span></div></div>
              <div className={`plain-verdict ${zoneClass(selectedScore)}`}><strong>{selectedScore >= 75 ? t.excellent : selectedScore >= 55 ? t.possible : t.weak}</strong><span>{currentProduct}</span></div>
              {aiLoading || !aiAdvice ? <div className="advice-loading"><span /><strong>{t.checking}</strong></div> : <>
                <div className="ai-source"><span>✦</span><div><strong>{aiAdvice.title}</strong><small>{aiAdvice.provider === "groq" ? t.aiGroq : t.aiRules}</small></div></div>
                <p className="advice-summary">{aiAdvice.summary}</p>
                <section className="human-list plus"><h3><span>+</span>{t.pluses}</h3>{aiAdvice.pluses.map((item) => <p key={item}>{item}</p>)}</section>
                <section className="human-list minus"><h3><span>!</span>{t.minuses}</h3>{aiAdvice.minuses.map((item) => <p key={item}>{item}</p>)}</section>
                <section className="next-steps"><h3>{t.steps}</h3>{aiAdvice.nextSteps.map((item, index) => <p key={item}><b>{index + 1}</b>{item}</p>)}</section>
              </>}

              <section className="facts-section">
                <h3>{locale === "ru" ? "Что находится рядом" : "Жақын жерде не бар"}</h3>
                <div className="fact-row"><span className="fact-icon power">⚡</span><div><small>{t.power}</small><strong>{nearestInfrastructure.power ? `${nearestInfrastructure.power.distanceKm} ${locale === "ru" ? "км" : "км"}` : locale === "ru" ? "Не найдено в радиусе 30 км" : "30 км радиуста табылмады"}</strong></div></div>
                <div className="fact-row"><span className="fact-icon water">≈</span><div><small>{t.water}</small><strong>{nearestInfrastructure.water ? `${nearestInfrastructure.water.distanceKm} км` : locale === "ru" ? "Не найдено в радиусе 30 км" : "30 км радиуста табылмады"}</strong></div></div>
                <div className="fact-row"><span className="fact-icon rail">═</span><div><small>{t.rail}</small><strong>{nearestInfrastructure.rail ? `${nearestInfrastructure.rail.distanceKm} км` : locale === "ru" ? "Не найдено в радиусе 30 км" : "30 км радиуста табылмады"}</strong></div></div>
              </section>

              <section className="ownership-section"><h3>{t.ownership}</h3><div><span>▱</span><p><strong>{t.ownershipUnknown}</strong>{nearestSite && <small>{t.nearbySite}: {nearestSite.site.name} · {nearestSite.distance.toFixed(1)} км</small>}</p></div><a href="https://map.gov4c.kz/egkn/" target="_blank" rel="noreferrer">{t.cadastral}</a></section>

              <details className="technical-details"><summary>{t.indicators}</summary><div className="technical-grid"><div><span>NDVI · {t.vegetation}</span><strong>{selectedCell.ndvi.toFixed(3)}</strong></div><div><span>NDWI · {t.moisture}</span><strong>{selectedCell.ndwi.toFixed(3)}</strong></div><div><span>NDBI · {t.builtDry}</span><strong>{selectedCell.ndbi.toFixed(3)}</strong></div><div><span>{t.dataQuality}</span><strong>{selectedCell.confidence}%</strong></div></div></details>
              <p className="screening-note">{t.dataNote}</p>
            </> : <div className="no-zone"><span>↖</span><strong>{t.wizardTitle}</strong><p>{t.wizardLead}</p></div>}
          </div>
          {selectedCell && aiAdvice && <button type="button" className="download-brief" onClick={downloadBrief}>{t.download} ↓</button>}
        </aside>
      </section>

      {wizardOpen && <div className="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <section className="wizard-card">
          <div className="wizard-top"><div className="wizard-brand"><span className="brand-mark">A</span><div><strong>ALPHA TURKISTAN</strong><small>{t.subtitle}</small></div></div><div className="language-switch"><button type="button" className={locale === "ru" ? "active" : ""} onClick={() => setLocale("ru")}>РУС</button><button type="button" className={locale === "kk" ? "active" : ""} onClick={() => setLocale("kk")}>ҚАЗ</button></div></div>
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
