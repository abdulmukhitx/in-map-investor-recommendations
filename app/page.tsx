"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layer, LayerGroup, Map as LeafletMap } from "leaflet";
import type { CatalogSite, ProjectNeed, Sector } from "../lib/catalog";
import "leaflet/dist/leaflet.css";

type SitesMeta = {
  storage: "d1" | "seed";
  total: number;
  returned: number;
  officialRecords: number;
  generatedAt: string;
  warning: string | null;
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

type LiveMeta = {
  source?: string;
  observedAt?: string;
  disclaimer?: string;
  unavailable?: boolean;
};

type Recommendation = { score: number; reasons: string[] };

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

type AgroFeature = { type: "Feature"; id?: string; properties: AgroCellProps; geometry: object };
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

type MapMode = "electricity" | "soy" | "rice" | "cotton" | "vegetables" | "ndvi" | "ndwi" | "ndbi";
type AdviceProject = "soy" | "rice" | "cotton" | "vegetables" | "solar" | "factory";

const sectors: Array<"All" | Sector> = ["All", "Agro", "Manufacturing", "Logistics", "Energy", "Tourism"];
const sectorLabels: Record<string, string> = { All: "All", Agro: "Agro", Manufacturing: "Factory", Logistics: "Logistics", Energy: "Energy", Tourism: "Tourism" };
const liveKinds: LiveFeature["kind"][] = ["power", "rail", "industry", "material", "water"];
const mapModes: Array<{ id: MapMode; label: string; short: string }> = [
  { id: "electricity", label: "Power grid / Электросеть", short: "Power" },
  { id: "soy", label: "Soy / Соя", short: "Soy" },
  { id: "rice", label: "Rice / Рис", short: "Rice" },
  { id: "cotton", label: "Cotton / Хлопок", short: "Cotton" },
  { id: "vegetables", label: "Vegetables / Овощи", short: "Vegetables" },
  { id: "ndvi", label: "NDVI vegetation", short: "NDVI" },
  { id: "ndwi", label: "NDWI water", short: "NDWI" },
  { id: "ndbi", label: "NDBI built / dry", short: "NDBI" },
];

const adviceLabels: Record<AdviceProject, string> = {
  soy: "Soy processing / Соя",
  rice: "Rice farming / Рис",
  cotton: "Cotton & textile / Хлопок",
  vegetables: "Vegetables / Овощи",
  solar: "Solar generation / Солнечная",
  factory: "Factory / Производство",
};

function distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreColor(score: number) {
  if (score >= 75) return "#087f6b";
  if (score >= 55) return "#75a958";
  if (score >= 35) return "#d7aa3c";
  return "#b66b55";
}

function indexScore(value: number, key: "ndvi" | "ndwi" | "ndbi", data: AgroCollection) {
  const range = data.metadata.normalization_percentiles[key];
  if (!range || range.p90 <= range.p10) return 50;
  return Math.max(0, Math.min(100, ((value - range.p10) / (range.p90 - range.p10)) * 100));
}

function evidenceLabel(site: CatalogSite) {
  if (site.evidenceLevel === "official") return "Official source";
  if (site.evidenceLevel === "registry") return "Registry evidence";
  return "Public-map discovery";
}

function sourceDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{score}</strong><span>FIT</span></div>
    </div>
  );
}

function SiteCard({ site, selected, recommendation, onClick }: { site: CatalogSite; selected: boolean; recommendation?: Recommendation; onClick: () => void }) {
  const score = recommendation?.score ?? site.baseScore;
  return (
    <button type="button" className={`site-card ${selected ? "selected" : ""}`} onClick={onClick}>
      <span className={`evidence-dot ${site.evidenceLevel}`} />
      <span className="site-card-copy">
        <strong>{site.name}</strong>
        <span>{site.district} · {site.areaHa > 0 ? `${site.areaHa} ha` : "area to confirm"}</span>
        <small>{site.sector} · {evidenceLabel(site)}</small>
        {recommendation?.reasons[0] && <em>{recommendation.reasons[0]}</em>}
      </span>
      <span className="mini-score">{score}<small>FIT</small></span>
    </button>
  );
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const siteLayerRef = useRef<LayerGroup | null>(null);
  const liveLayerRef = useRef<LayerGroup | null>(null);
  const agroLayerRef = useRef<LayerGroup | null>(null);
  const boundaryLayerRef = useRef<LayerGroup | null>(null);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [meta, setMeta] = useState<SitesMeta | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState<"All" | Sector>("All");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [liveFeatures, setLiveFeatures] = useState<LiveFeature[]>([]);
  const [liveMeta, setLiveMeta] = useState<LiveMeta | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveLayers, setLiveLayers] = useState<Record<LiveFeature["kind"], boolean>>({ power: true, rail: true, industry: true, material: true, water: false });
  const [agroData, setAgroData] = useState<AgroCollection | null>(null);
  const [selectedCell, setSelectedCell] = useState<AgroCellProps | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("electricity");
  const [adviceProject, setAdviceProject] = useState<AdviceProject>("soy");
  const [analysisTarget, setAnalysisTarget] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
  const [planner, setPlanner] = useState<ProjectNeed>({ sector: "Manufacturing", landHa: 20, powerMw: 5, needsRail: false, material: "" });
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation>>({});
  const [modelMeta, setModelMeta] = useState<{ model: string; method: string } | null>(null);
  const [compared, setCompared] = useState<string[]>([]);

  const selected = sites.find((site) => site.id === selectedId) ?? sites[0];
  const selectedRecommendation = selected ? recommendations[selected.id] : undefined;
  const selectedScore = selectedRecommendation?.score ?? selected?.baseScore ?? 0;

  const locationAdvice = useMemo(() => {
    if (!selectedCell) return null;
    const satelliteScore = adviceProject === "factory" ? selectedCell.industrial_land : selectedCell[adviceProject];
    const nearestPower = liveFeatures.filter((feature) => feature.kind === "power").sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const nearestRail = liveFeatures.filter((feature) => feature.kind === "rail").sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const nearestWater = liveFeatures.filter((feature) => feature.kind === "water").sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const nearestOfficial = [...sites].sort((a, b) => distanceBetween(selectedCell.latitude, selectedCell.longitude, a.latitude, a.longitude) - distanceBetween(selectedCell.latitude, selectedCell.longitude, b.latitude, b.longitude))[0];
    const officialDistance = nearestOfficial ? distanceBetween(selectedCell.latitude, selectedCell.longitude, nearestOfficial.latitude, nearestOfficial.longitude) : null;

    let infrastructureScore = 40;
    if (nearestPower) infrastructureScore += nearestPower.distanceKm <= 5 ? 35 : nearestPower.distanceKm <= 15 ? 24 : nearestPower.distanceKm <= 30 ? 12 : 0;
    if (nearestRail) infrastructureScore += nearestRail.distanceKm <= 10 ? 15 : nearestRail.distanceKm <= 25 ? 8 : 0;
    if (nearestWater && adviceProject !== "factory" && adviceProject !== "solar") infrastructureScore += nearestWater.distanceKm <= 5 ? 20 : nearestWater.distanceKm <= 15 ? 12 : 4;
    infrastructureScore = Math.min(100, infrastructureScore);

    let score = Math.round(satelliteScore * (adviceProject === "factory" ? 0.55 : 0.7) + infrastructureScore * (adviceProject === "factory" ? 0.45 : 0.3));
    if (adviceProject === "rice" && !nearestWater && selectedCell.surface_water_pct < 1) score = Math.max(0, score - 18);
    const level = score >= 75 ? "Strong screening fit" : score >= 55 ? "Conditional fit" : "Low / verify alternatives";
    const reasons = [
      `Satellite ${adviceProject === "factory" ? "industrial-land" : adviceProject} signal: ${satelliteScore}/100`,
      nearestPower ? `Mapped ${nearestPower.detail} electricity feature ${nearestPower.distanceKm} km away` : "No mapped electricity feature found within the current search radius",
      adviceProject === "rice" ? (nearestWater ? `Mapped water/canal feature ${nearestWater.distanceKm} km away` : "Rice requires a verified irrigation source and water rights") : `NDVI ${selectedCell.ndvi.toFixed(3)}, NDWI ${selectedCell.ndwi.toFixed(3)}, NDBI ${selectedCell.ndbi.toFixed(3)}`,
      officialDistance !== null && nearestOfficial ? `${nearestOfficial.name} is approximately ${officialDistance.toFixed(1)} km away` : "No investment-zone record nearby",
    ];
    const narrative = adviceProject === "factory"
      ? `${level}. A factory is only practical here if the grid operator confirms connection capacity and the cadastral record permits industrial use. ${nearestRail ? `Rail is mapped ${nearestRail.distanceKm} km away.` : "Rail access was not found nearby."}`
      : `${level}. The 2025 satellite mosaic shows relative land and moisture conditions for ${adviceLabels[adviceProject].split(" /")[0].toLowerCase()}. Before investment, test salinity, texture and drainage and confirm irrigation availability.`;
    return { score, level, satelliteScore, infrastructureScore, reasons, narrative, nearestPower, nearestRail, nearestWater, nearestOfficial, officialDistance };
  }, [adviceProject, liveFeatures, selectedCell, sites]);

  const rankedSites = useMemo(() => {
    if (!Object.keys(recommendations).length) return sites;
    return [...sites].sort((a, b) => (recommendations[b.id]?.score ?? b.baseScore) - (recommendations[a.id]?.score ?? a.baseScore));
  }, [recommendations, sites]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ query, sector, official: String(officialOnly) });
      try {
        const response = await fetch(`/api/sites?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search returned ${response.status}`);
        const data = (await response.json()) as { sites: CatalogSite[]; meta: SitesMeta };
        setSites(data.sites);
        setMeta(data.meta);
        setSelectedId((current) => data.sites.some((site) => site.id === current) ? current : data.sites[0]?.id ?? "");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [officialOnly, query, sector]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/agro-suitability.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Agro layer returned ${response.status}`);
        return response.json() as Promise<AgroCollection>;
      })
      .then(setAgroData)
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Agro screening layer unavailable", error);
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
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
          crossOrigin: true,
        }).addTo(map);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        boundaryLayerRef.current = L.layerGroup().addTo(map);
        agroLayerRef.current = L.layerGroup().addTo(map);
        siteLayerRef.current = L.layerGroup().addTo(map);
        liveLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 100);
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
        L.geoJSON(boundary, { style: { color: "#173f3a", weight: 2, opacity: 0.8, fillOpacity: 0 } }).addTo(layer);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [mapStatus]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = agroLayerRef.current;
    if (!L || !layer || !agroData || mapStatus !== "ready") return;
    layer.clearLayers();
    if (mapMode === "electricity") return;

    const rendered = L.geoJSON(agroData as never, {
      style: (feature) => {
        const props = (feature?.properties ?? {}) as AgroCellProps;
        const value = mapMode === "ndvi" || mapMode === "ndwi" || mapMode === "ndbi"
          ? indexScore(props[mapMode], mapMode, agroData)
          : props[mapMode];
        const isSelected = selectedCell?.cell_id === props.cell_id;
        return {
          color: isSelected ? "#123f39" : "#ffffff",
          weight: isSelected ? 3 : 0.65,
          opacity: isSelected ? 1 : 0.7,
          fillColor: scoreColor(value),
          fillOpacity: isSelected ? 0.78 : 0.58,
        };
      },
      onEachFeature: (feature, mapLayer: Layer) => {
        const props = (feature.properties ?? {}) as AgroCellProps;
        const value = mapMode === "ndvi" || mapMode === "ndwi" || mapMode === "ndbi"
          ? props[mapMode].toFixed(3)
          : `${props[mapMode]}/100`;
        mapLayer.bindTooltip(`<strong>${props.cell_id}</strong><br>${mapModes.find((item) => item.id === mapMode)?.label}: ${value}<br>Click for location advice`, { sticky: true });
        mapLayer.on("click", () => {
          setSelectedCell(props);
          setAdviceProject(mapMode === "ndvi" || mapMode === "ndwi" || mapMode === "ndbi" ? "soy" : mapMode);
          setAnalysisTarget({ latitude: props.latitude, longitude: props.longitude, label: props.cell_id });
          mapRef.current?.flyTo([props.latitude, props.longitude], Math.max(mapRef.current.getZoom(), 9), { duration: 0.6 });
        });
      },
    });
    rendered.addTo(layer);
  }, [agroData, mapMode, mapStatus, selectedCell?.cell_id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !agroData || mapStatus !== "ready") return;
    const handleMapClick = (event: { latlng: { lat: number; lng: number } }) => {
      const nearest = [...agroData.features].sort((a, b) =>
        distanceBetween(event.latlng.lat, event.latlng.lng, a.properties.latitude, a.properties.longitude)
        - distanceBetween(event.latlng.lat, event.latlng.lng, b.properties.latitude, b.properties.longitude)
      )[0]?.properties;
      if (!nearest) return;
      setSelectedCell(nearest);
      setAnalysisTarget({ latitude: event.latlng.lat, longitude: event.latlng.lng, label: nearest.cell_id });
    };
    map.on("click", handleMapClick);
    return () => { map.off("click", handleMapClick); };
  }, [agroData, mapStatus]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = siteLayerRef.current;
    if (!L || !layer || mapStatus !== "ready") return;
    layer.clearLayers();
    rankedSites.forEach((site) => {
      const score = recommendations[site.id]?.score ?? site.baseScore;
      const icon = L.divIcon({
        className: "investment-marker-shell",
        html: `<div class="investment-marker ${site.evidenceLevel} ${site.id === selectedId ? "selected" : ""}"><span>${score}</span></div>`,
        iconSize: [44, 50],
        iconAnchor: [22, 44],
      });
      const marker = L.marker([site.latitude, site.longitude], { icon, title: site.name, riseOnHover: true });
      marker.on("click", () => {
        setSelectedId(site.id);
        setSelectedCell(null);
        setAnalysisTarget(null);
      });
      marker.bindTooltip(`<strong>${site.name}</strong><br>${evidenceLabel(site)} · ${score} fit`, { direction: "top", offset: [0, -36] });
      marker.addTo(layer);
    });
  }, [mapStatus, rankedSites, recommendations, selectedId]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = liveLayerRef.current;
    if (!L || !layer || mapStatus !== "ready") return;
    layer.clearLayers();
    liveFeatures.filter((feature) => liveLayers[feature.kind]).forEach((feature) => {
      const popup = `<strong>${feature.name}</strong><br>${feature.detail}<br>${feature.distanceKm} km from selected location<br><a href="${feature.osmUrl}" target="_blank" rel="noreferrer">Open OSM record</a>`;
      if (feature.geometry && feature.geometry.length >= 2) {
        const isArea = feature.geometry.length >= 4 && feature.geometry[0][0] === feature.geometry.at(-1)?.[0] && feature.geometry[0][1] === feature.geometry.at(-1)?.[1];
        const color = feature.kind === "power" ? "#e69b2d" : feature.kind === "rail" ? "#334b48" : feature.kind === "water" ? "#2e83b6" : feature.kind === "material" ? "#9a6f34" : "#7d6253";
        const path = isArea
          ? L.polygon(feature.geometry, { color, weight: 2, fillColor: color, fillOpacity: 0.16 })
          : L.polyline(feature.geometry, { color, weight: feature.kind === "power" ? 3.5 : 2.5, opacity: 0.88, dashArray: feature.kind === "rail" ? "8 5" : undefined });
        path.bindTooltip(`${feature.kind === "power" ? "⚡ " : ""}${feature.name} · ${feature.detail}`, { sticky: true });
        path.bindPopup(popup);
        path.addTo(layer);
      } else {
        const symbol = feature.kind === "power" ? "⚡" : feature.kind === "rail" ? "R" : feature.kind === "water" ? "W" : feature.kind === "material" ? "M" : "I";
        const icon = L.divIcon({ className: "live-marker-shell", html: `<div class="live-marker ${feature.kind}">${symbol}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        const marker = L.marker([feature.latitude, feature.longitude], { icon, title: `${feature.name} · ${feature.detail}` });
        marker.bindTooltip(`<strong>${feature.name}</strong><br>${feature.detail}`, { direction: "top" });
        marker.bindPopup(popup);
        marker.addTo(layer);
      }
    });
  }, [liveFeatures, liveLayers, mapStatus]);

  useEffect(() => {
    if (!selected || selectedCell || !mapRef.current || mapStatus !== "ready") return;
    mapRef.current.flyTo([selected.latitude, selected.longitude], 10, { duration: 0.8 });
  }, [mapStatus, selected, selectedCell]);

  const discoverLive = useCallback(async (target: { latitude: number; longitude: number }) => {
    setLiveLoading(true);
    setLiveError("");
    try {
      const params = new URLSearchParams({ lat: String(target.latitude), lng: String(target.longitude), radius: "30000" });
      const response = await fetch(`/api/geo/discover?${params}`);
      const data = (await response.json()) as { features?: LiveFeature[]; meta?: LiveMeta; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Live discovery unavailable");
      setLiveFeatures(data.features ?? []);
      setLiveMeta(data.meta ?? null);
    } catch (error) {
      setLiveFeatures([]);
      setLiveMeta({ unavailable: true, source: "OpenStreetMap via Overpass API" });
      setLiveError(error instanceof Error ? error.message : "Live discovery unavailable");
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    const target = analysisTarget ?? selected;
    if (!target) return;
    const timer = window.setTimeout(() => discoverLive(target), 300);
    return () => window.clearTimeout(timer);
  }, [analysisTarget, discoverLive, selected]);

  async function runPlanner() {
    setPlannerLoading(true);
    try {
      const response = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(planner) });
      if (!response.ok) throw new Error("Recommendation model unavailable");
      const data = (await response.json()) as { recommendations: Array<{ site: CatalogSite; score: number; reasons: string[] }>; meta: { model: string; method: string } };
      const next = Object.fromEntries(data.recommendations.map((item) => [item.site.id, { score: item.score, reasons: item.reasons }]));
      setRecommendations(next);
      setModelMeta(data.meta);
      const top = data.recommendations[0]?.site;
      if (top) {
        setSelectedId(top.id);
        setSelectedCell(null);
        setAnalysisTarget(null);
      }
      setPlannerOpen(false);
    } finally {
      setPlannerLoading(false);
    }
  }

  function resetSearch() {
    setQuery("");
    setSector("All");
    setOfficialOnly(false);
    setRecommendations({});
    setModelMeta(null);
  }

  function selectSite(id: string) {
    setSelectedId(id);
    setSelectedCell(null);
    setAnalysisTarget(null);
  }

  function selectMapMode(mode: MapMode) {
    setMapMode(mode);
    if (mode === "electricity") {
      setLiveLayers((state) => ({ ...state, power: true }));
      return;
    }
    if (mode !== "ndvi" && mode !== "ndwi" && mode !== "ndbi") setAdviceProject(mode);
  }

  function toggleCompare(id: string) {
    setCompared((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-2), id]);
  }

  function downloadBrief(site: CatalogSite) {
    const liveSummary = liveFeatures.slice(0, 12).map((feature) => `- ${feature.kind}: ${feature.name} (${feature.distanceKm} km)`).join("\n");
    const locationSection = selectedCell && locationAdvice ? [
      "SELECTED LAND-CELL ANALYSIS",
      `Cell: ${selectedCell.cell_id} at ${selectedCell.latitude}, ${selectedCell.longitude}`,
      `Project: ${adviceLabels[adviceProject]}`,
      `Combined screening score: ${locationAdvice.score}/100 (${locationAdvice.level})`,
      `Satellite signal: ${locationAdvice.satelliteScore}/100`,
      `Mapped infrastructure: ${locationAdvice.infrastructureScore}/100`,
      `NDVI ${selectedCell.ndvi}; NDWI ${selectedCell.ndwi}; NDBI ${selectedCell.ndbi}; NDMI ${selectedCell.ndmi}`,
      ...locationAdvice.reasons.map((reason) => `- ${reason}`),
      "",
    ] : [];
    const content = [
      "ALPHA TURKISTAN · INVESTMENT SCREENING BRIEF",
      `Generated: ${new Date().toISOString()}`,
      "",
      site.name,
      `${site.district} · ${site.areaHa > 0 ? `${site.areaHa} ha` : "Area to confirm"}`,
      `Screening score: ${selectedScore}/100`,
      `Sector: ${site.sector}`,
      `Availability: ${site.availability}`,
      `Land evidence: ${site.ownershipStatus}`,
      `Location accuracy: ${site.locationAccuracy}`,
      "",
      site.description,
      "",
      ...locationSection,
      "DOCUMENTED INFRASTRUCTURE",
      ...site.infrastructure.map((item) => `- ${item.label}: ${item.value}${item.confirmed ? " [published]" : " [confirm]"}`),
      "",
      "BEST FOR",
      ...site.bestFor.map((item) => `- ${item}`),
      "",
      "DUE DILIGENCE FLAGS",
      ...site.risks.map((item) => `- ${item}`),
      "",
      "NEARBY PUBLIC-MAP DISCOVERY",
      liveSummary || "- Live discovery unavailable or not loaded",
      "",
      `Primary source: ${site.sourceTitle}`,
      site.sourceUrl,
      "",
      "This brief supports initial screening only. Verify parcel rights through Kazakhstan's public cadastral map and confirm utilities with the relevant operator.",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${site.id}-investment-brief.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const liveCounts = Object.fromEntries(liveKinds.map((kind) => [kind, liveFeatures.filter((feature) => feature.kind === kind).length])) as Record<LiveFeature["kind"], number>;
  const currentDiscoveryTarget = analysisTarget ?? selected;
  const activeModeLabel = mapModes.find((item) => item.id === mapMode)?.label ?? mapMode;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark">A</div><div><strong>ALPHA TURKISTAN</strong><span>Investment Intelligence</span></div></div>
        <div className="region-control"><span>Region</span><strong>Turkistan Region</strong><i>⌄</i></div>
        <div className="header-stats">
          <div><strong>{meta?.total ?? "—"}</strong><span>source records</span></div>
          <div><strong>{meta?.officialRecords ?? "—"}</strong><span>official</span></div>
          <div><strong>{agroData?.features.length ?? "—"}</strong><span>satellite cells</span></div>
        </div>
        <div className="system-status"><span className={`status-light ${meta?.storage === "d1" ? "online" : "warming"}`} /><div><strong>System online</strong><small>{meta?.storage === "d1" ? "D1 + live GIS" : "Curated cache + live GIS"}</small></div></div>
      </header>

      <section className="workspace">
        <aside className="filter-panel">
          <div className="panel-heading"><div><span className="eyebrow">Investor site finder</span><h1>Find where your project can work.</h1></div><span className="live-pill">LIVE</span></div>

          <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try cotton, 50 MW, rail…" aria-label="Search sites, materials and business types" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>

          <section className="evidence-layer-card">
            <div><span className="eyebrow">MAP EVIDENCE LAYER</span><strong>{mapModes.find((item) => item.id === mapMode)?.label}</strong><small>{mapMode === "electricity" ? "Mapped lines, substations and voltage evidence around the selected location" : "402 regional cells derived from the Alpha Turkistan 2025 Sentinel-2 mosaic"}</small></div>
            <label><span>Layer</span><select value={mapMode} onChange={(event) => selectMapMode(event.target.value as MapMode)} aria-label="Map evidence layer">{mapModes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </section>

          <div className="filter-section">
            <div className="section-title"><span>BUSINESS TYPE</span><button type="button" onClick={resetSearch}>Reset</button></div>
            <div className="sector-grid">
              {sectors.map((option) => <button type="button" key={option} className={sector === option ? "active" : ""} onClick={() => setSector(option)} aria-pressed={sector === option}><b>{option === "All" ? "•" : option.charAt(0)}</b><span>{sectorLabels[option]}</span></button>)}
            </div>
          </div>

          <div className="filter-section compact">
            <label className="toggle-row"><div><strong>Official sources only</strong><span>Hide records that still need operator confirmation</span></div><input type="checkbox" checked={officialOnly} onChange={(event) => setOfficialOnly(event.target.checked)} /><span className="toggle" /></label>
          </div>

          <section className={`planner-card ${plannerOpen ? "open" : ""}`}>
            <button type="button" className="planner-toggle" onClick={() => setPlannerOpen((open) => !open)}><span><i>✦</i><b>Match my project</b><small>{modelMeta ? `${modelMeta.model} ranking active` : "Set land, power and logistics needs"}</small></span><strong>{plannerOpen ? "−" : "+"}</strong></button>
            {plannerOpen && <div className="planner-fields">
              <label><span>Project type</span><select value={planner.sector} onChange={(event) => setPlanner((state) => ({ ...state, sector: event.target.value }))}>{sectors.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Land needed (ha)</span><input type="number" min="0" max="2000" value={planner.landHa ?? ""} onChange={(event) => setPlanner((state) => ({ ...state, landHa: Number(event.target.value) }))} /></label>
              <label><span>Power needed (MW)</span><input type="number" min="0" max="500" value={planner.powerMw ?? ""} onChange={(event) => setPlanner((state) => ({ ...state, powerMw: Number(event.target.value) }))} /></label>
              <label><span>Key material</span><input value={planner.material ?? ""} onChange={(event) => setPlanner((state) => ({ ...state, material: event.target.value }))} placeholder="cotton" /></label>
              <label className="rail-check"><input type="checkbox" checked={planner.needsRail ?? false} onChange={(event) => setPlanner((state) => ({ ...state, needsRail: event.target.checked }))} /><span>Rail access required</span></label>
              <button type="button" className="run-model" onClick={runPlanner} disabled={plannerLoading}>{plannerLoading ? "Ranking…" : "Rank locations"}</button>
            </div>}
          </section>

          <div className="results-heading"><span><strong>{rankedSites.length}</strong> matching locations</span><span>{loading ? "Searching…" : recommendations && Object.keys(recommendations).length ? "Project fit ↓" : "Evidence ranked ↓"}</span></div>
          <div className="site-list">
            {rankedSites.map((site) => <SiteCard key={site.id} site={site} selected={!selectedCell && site.id === selectedId} recommendation={recommendations[site.id]} onClick={() => selectSite(site.id)} />)}
            {!loading && rankedSites.length === 0 && <div className="empty-state"><strong>No matching records</strong><span>Try a broader material, district or business type.</span><button type="button" onClick={resetSearch}>Clear filters</button></div>}
          </div>
        </aside>

        <section className="map-stage" aria-label="Interactive investment map">
          <div ref={mapContainer} className="map-container" />
          {mapStatus !== "ready" && <div className="map-loading"><div className="map-grid" /><strong>{mapStatus === "error" ? "Map could not initialize" : "Loading geographic map…"}</strong><span>Site records remain available in the side panel.</span></div>}

          <div className="map-toolbar intelligence-toolbar">
            <span>LAND & INFRASTRUCTURE</span>
            <div className="mode-buttons">
              {mapModes.map((mode) => <button type="button" key={mode.id} className={mapMode === mode.id ? "active" : ""} onClick={() => selectMapMode(mode.id)} aria-pressed={mapMode === mode.id}>{mode.short}</button>)}
            </div>
            <div className="network-buttons">
              {(["power", "rail", "water"] as LiveFeature["kind"][]).map((kind) => <button type="button" key={kind} className={`${kind} ${liveLayers[kind] ? "active" : ""}`} onClick={() => setLiveLayers((state) => ({ ...state, [kind]: !state[kind] }))} aria-pressed={liveLayers[kind]}><i />{kind === "power" ? "Electricity" : kind}<b>{liveCounts[kind]}</b></button>)}
            </div>
          </div>

          <div className="map-data-card">
            <span className={`status-light ${liveLoading ? "warming" : liveError ? "error" : "online"}`} />
            <div><strong>{liveLoading ? "Tracing electricity, rail and water…" : liveError ? "Live infrastructure temporarily unavailable" : `${activeModeLabel} · ${liveFeatures.length} mapped infrastructure records`}</strong><span>{mapMode === "electricity" ? "Power lines are drawn as orange corridors; click a line for voltage evidence" : "Alpha Turkistan Sentinel-2 2025 · click any cell for AI advice"}</span></div>
            {currentDiscoveryTarget && <button type="button" onClick={() => discoverLive(currentDiscoveryTarget)} disabled={liveLoading} aria-label="Refresh infrastructure">↻</button>}
          </div>

          {mapMode === "electricity"
            ? <div className="map-legend network-legend"><span><i className="power-line" />Electricity line</span><span><i className="substation" />Substation / source</span><span><i className="rail-line" />Rail</span><span><i className="official" />Investment site</span></div>
            : <div className="map-legend suitability-legend"><span><i className="low" />Low</span><span><i className="medium" />Conditional</span><span><i className="high" />Strong</span><span>Relative regional screening · not soil certification</span></div>}
        </section>

        <aside className="insight-panel">
          {selected ? <>
            <div className="insight-scroll">
              {selectedCell && locationAdvice && <>
                <section className="location-analysis">
                  <div className="analysis-kicker"><span>SELECTED LAND CELL · {selectedCell.cell_id}</span><span>Sentinel-2 · {selectedCell.period.replace("_", " ")}</span></div>
                  <div className="analysis-title-row"><div><span className="eyebrow">AI LOCATION ADVICE / АНАЛИЗ МЕСТА</span><h2>What can work here?</h2><p>{selectedCell.latitude.toFixed(4)}, {selectedCell.longitude.toFixed(4)} · {selectedCell.area_km2} km² screening cell</p></div><ScoreRing score={locationAdvice.score} /></div>
                  <label className="project-choice"><span>Project to assess</span><select value={adviceProject} onChange={(event) => setAdviceProject(event.target.value as AdviceProject)} aria-label="Project to assess">{(Object.keys(adviceLabels) as AdviceProject[]).map((key) => <option key={key} value={key}>{adviceLabels[key]}</option>)}</select></label>

                  <div className={`ai-verdict ${locationAdvice.score >= 75 ? "strong" : locationAdvice.score >= 55 ? "conditional" : "low"}`}><span>✦</span><div><strong>{locationAdvice.level}</strong><p>{locationAdvice.narrative}</p><small>Explainable screening model · satellite 2025 + mapped infrastructure</small></div></div>

                  <div className="spectral-grid">
                    <div><span>NDVI</span><strong>{selectedCell.ndvi.toFixed(3)}</strong><small>vegetation</small></div>
                    <div><span>NDWI</span><strong>{selectedCell.ndwi.toFixed(3)}</strong><small>water signal</small></div>
                    <div><span>NDBI</span><strong>{selectedCell.ndbi.toFixed(3)}</strong><small>built / dry</small></div>
                    <div><span>NDMI</span><strong>{selectedCell.ndmi.toFixed(3)}</strong><small>moisture</small></div>
                    <div><span>Active cover</span><strong>{selectedCell.active_vegetation_pct}%</strong><small>sample pixels</small></div>
                    <div><span>Confidence</span><strong>{selectedCell.confidence}%</strong><small>data coverage</small></div>
                  </div>

                  <div className="advice-scores"><div><span>Satellite land signal</span><strong>{locationAdvice.satelliteScore}</strong><i><b style={{ width: `${locationAdvice.satelliteScore}%` }} /></i></div><div><span>Mapped infrastructure</span><strong>{locationAdvice.infrastructureScore}</strong><i><b style={{ width: `${locationAdvice.infrastructureScore}%` }} /></i></div></div>
                  <div className="reason-list">{locationAdvice.reasons.map((reason) => <span key={reason}><i>✓</i>{reason}</span>)}</div>
                  <p className="analysis-warning"><strong>Required before investment:</strong> cadastral ownership, zoning, soil salinity/chemistry, drainage, irrigation rights and an operator-issued grid connection study.</p>
                </section>
                <div className="section-separator"><span>Nearest curated investment record</span></div>
              </>}
              <div className="insight-topline"><span className={`evidence-pill ${selected.evidenceLevel}`}><i />{evidenceLabel(selected)}</span><span className="source-date">Checked {sourceDate(selected.sourceCheckedAt)}</span></div>
              <div className="site-title-row"><div><span className="eyebrow">{selected.district}</span><h2>{selected.name}</h2><p>{selected.sector} · {selected.areaHa > 0 ? `${selected.areaHa} hectares` : "area to confirm"} · {selected.locationAccuracy} point</p></div><ScoreRing score={selectedScore} /></div>

              <div className="decision-summary"><span>✦</span><div><strong>{selectedRecommendation ? "Project-specific verdict" : "Screening verdict"}</strong><p>{selectedRecommendation?.reasons.join(". ") || selected.description}</p>{modelMeta && <small>{modelMeta.method} · {modelMeta.model}</small>}</div></div>

              <section className="detail-section">
                <div className="detail-heading"><h3>Documented infrastructure</h3><span>{selected.infrastructure.filter((item) => item.confirmed).length}/{selected.infrastructure.length} published</span></div>
                <div className="metric-grid">
                  {selected.infrastructure.map((item, index) => <div key={`${item.key}-${index}`} className={!item.confirmed ? "unconfirmed" : ""}><span>{item.key.charAt(0).toUpperCase()}</span><small>{item.label}</small><strong>{item.value}</strong><i>{item.confirmed ? "Published" : "Confirm"}</i></div>)}
                </div>
              </section>

              <section className="detail-section">
                <div className="detail-heading"><h3>Land & ownership evidence</h3><span>{selected.locationAccuracy} location</span></div>
                <div className="ownership-card"><div className="parcel-icon" /><div><small>CURRENT EVIDENCE STATUS</small><strong>{selected.ownershipStatus}</strong><span>{selected.availability}</span></div></div>
                <div className="ownership-actions"><a href="https://map.gov4c.kz/egkn/" target="_blank" rel="noreferrer">Open public cadastral map ↗</a><span>Legal owner names require official cadastral verification.</span></div>
              </section>

              <section className="detail-section">
                <div className="detail-heading"><h3>Nearby materials & business fit</h3><span>Source context</span></div>
                <div className="material-tags">{selected.materials.map((item) => <span key={item}>{item}</span>)}</div>
                <div className="best-for"><small>BEST FOR</small><p>{selected.bestFor.join(" · ")}</p></div>
              </section>

              <section className="detail-section">
                <div className="detail-heading"><h3>Live map discovery</h3><span>{liveFeatures.length} features / 30 km</span></div>
                <div className="live-summary-grid">{liveKinds.map((kind) => <div key={kind}><i className={kind}>{kind.charAt(0).toUpperCase()}</i><span>{kind}</span><strong>{liveCounts[kind]}</strong></div>)}</div>
                <p className="data-disclaimer">{liveMeta?.disclaimer ?? "Nearby public-map features indicate context only; they do not confirm capacity, serviceability or ownership."}</p>
              </section>

              <section className="detail-section">
                <div className="detail-heading"><h3>Explainable fit model</h3><span>Weighted screening</span></div>
                <div className="fit-bars">{selected.fit.map((item) => <div key={item.label} title={item.rationale}><span>{item.label}</span><strong>{item.value}</strong><i><b style={{ width: `${item.value}%` }} /></i><small>{item.rationale}</small></div>)}</div>
              </section>

              <section className="risk-box"><strong>Due diligence flags</strong>{selected.risks.map((risk) => <span key={risk}><i>!</i>{risk}</span>)}</section>

              <section className="source-box"><small>PRIMARY RECORD</small><a href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.sourceTitle} ↗</a><span>Facts shown as “published” come from this source. Location points marked approximate are not parcel boundaries.</span></section>
            </div>
            <div className="insight-actions"><button type="button" className="compare-button" onClick={() => toggleCompare(selected.id)} aria-pressed={compared.includes(selected.id)}>{compared.includes(selected.id) ? "✓ Comparing" : "+ Compare"}</button><button type="button" className="brief-button" onClick={() => downloadBrief(selected)}>Download investor brief ↓</button></div>
          </> : <div className="no-selection"><strong>Select a location</strong><span>Use search, filters or the map to open an investor record.</span></div>}
        </aside>
      </section>

      {compared.length > 0 && <div className="compare-tray"><span><strong>{compared.length}/3</strong> selected</span><div>{compared.map((id) => <i key={id}>{sites.find((site) => site.id === id)?.name}<button type="button" onClick={() => toggleCompare(id)}>×</button></i>)}</div><button type="button" disabled={compared.length < 2} onClick={() => setQuery(compared.map((id) => sites.find((site) => site.id === id)?.district.split(" ")[0]).filter(Boolean).join(" "))}>Compare records</button></div>}
    </main>
  );
}
