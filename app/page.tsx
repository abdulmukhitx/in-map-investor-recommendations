"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
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
  osmUrl: string;
};

type LiveMeta = {
  source?: string;
  observedAt?: string;
  disclaimer?: string;
  unavailable?: boolean;
};

type Recommendation = { score: number; reasons: string[] };

const sectors: Array<"All" | Sector> = ["All", "Agro", "Manufacturing", "Logistics", "Energy", "Tourism"];
const sectorLabels: Record<string, string> = { All: "All", Agro: "Agro", Manufacturing: "Factory", Logistics: "Logistics", Energy: "Energy", Tourism: "Tourism" };
const liveKinds: LiveFeature["kind"][] = ["power", "rail", "industry", "material", "water"];

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
  const [planner, setPlanner] = useState<ProjectNeed>({ sector: "Manufacturing", landHa: 20, powerMw: 5, needsRail: false, material: "" });
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation>>({});
  const [modelMeta, setModelMeta] = useState<{ model: string; method: string } | null>(null);
  const [compared, setCompared] = useState<string[]>([]);

  const selected = sites.find((site) => site.id === selectedId) ?? sites[0];
  const selectedRecommendation = selected ? recommendations[selected.id] : undefined;
  const selectedScore = selectedRecommendation?.score ?? selected?.baseScore ?? 0;

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
      marker.on("click", () => setSelectedId(site.id));
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
      const icon = L.divIcon({ className: "live-marker-shell", html: `<div class="live-marker ${feature.kind}">${feature.kind.charAt(0).toUpperCase()}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
      const marker = L.marker([feature.latitude, feature.longitude], { icon, title: feature.name });
      marker.bindPopup(`<strong>${feature.name}</strong><br>${feature.detail}<br>${feature.distanceKm} km from site<br><a href="${feature.osmUrl}" target="_blank" rel="noreferrer">Open OSM record</a>`);
      marker.addTo(layer);
    });
  }, [liveFeatures, liveLayers, mapStatus]);

  useEffect(() => {
    if (!selected || !mapRef.current || mapStatus !== "ready") return;
    mapRef.current.flyTo([selected.latitude, selected.longitude], 10, { duration: 0.8 });
  }, [mapStatus, selected]);

  const discoverLive = useCallback(async (site: CatalogSite) => {
    setLiveLoading(true);
    setLiveError("");
    try {
      const params = new URLSearchParams({ lat: String(site.latitude), lng: String(site.longitude), radius: "20000" });
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
    if (!selected) return;
    const timer = window.setTimeout(() => discoverLive(selected), 300);
    return () => window.clearTimeout(timer);
  }, [discoverLive, selected]);

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
      if (top) setSelectedId(top.id);
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

  function toggleCompare(id: string) {
    setCompared((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-2), id]);
  }

  function downloadBrief(site: CatalogSite) {
    const liveSummary = liveFeatures.slice(0, 12).map((feature) => `- ${feature.kind}: ${feature.name} (${feature.distanceKm} km)`).join("\n");
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark">A</div><div><strong>ALPHA TURKISTAN</strong><span>Investment Intelligence</span></div></div>
        <div className="region-control"><span>Region</span><strong>Turkistan Region</strong><i>⌄</i></div>
        <div className="header-stats">
          <div><strong>{meta?.total ?? "—"}</strong><span>source records</span></div>
          <div><strong>{meta?.officialRecords ?? "—"}</strong><span>official</span></div>
          <div><strong>{liveFeatures.length}</strong><span>nearby features</span></div>
        </div>
        <div className="system-status"><span className={`status-light ${meta?.storage === "d1" ? "online" : "warming"}`} /><div><strong>System online</strong><small>{meta?.storage === "d1" ? "D1 + live GIS" : "Curated cache + live GIS"}</small></div></div>
      </header>

      <section className="workspace">
        <aside className="filter-panel">
          <div className="panel-heading"><div><span className="eyebrow">Investor site finder</span><h1>Find where your project can work.</h1></div><span className="live-pill">LIVE</span></div>

          <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try cotton, 50 MW, rail…" aria-label="Search sites, materials and business types" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>

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
            {rankedSites.map((site) => <SiteCard key={site.id} site={site} selected={site.id === selectedId} recommendation={recommendations[site.id]} onClick={() => setSelectedId(site.id)} />)}
            {!loading && rankedSites.length === 0 && <div className="empty-state"><strong>No matching records</strong><span>Try a broader material, district or business type.</span><button type="button" onClick={resetSearch}>Clear filters</button></div>}
          </div>
        </aside>

        <section className="map-stage" aria-label="Interactive investment map">
          <div ref={mapContainer} className="map-container" />
          {mapStatus !== "ready" && <div className="map-loading"><div className="map-grid" /><strong>{mapStatus === "error" ? "Map could not initialize" : "Loading geographic map…"}</strong><span>Site records remain available in the side panel.</span></div>}

          <div className="map-toolbar">
            <span>LIVE LAYERS</span>
            {liveKinds.map((kind) => <button type="button" key={kind} className={`${kind} ${liveLayers[kind] ? "active" : ""}`} onClick={() => setLiveLayers((state) => ({ ...state, [kind]: !state[kind] }))} aria-pressed={liveLayers[kind]}><i />{kind}<b>{liveCounts[kind]}</b></button>)}
          </div>

          <div className="map-data-card">
            <span className={`status-light ${liveLoading ? "warming" : liveError ? "error" : "online"}`} />
            <div><strong>{liveLoading ? "Discovering nearby infrastructure…" : liveError ? "Live discovery temporarily unavailable" : `${liveFeatures.length} nearby public-map features`}</strong><span>{liveMeta?.source ?? "OpenStreetMap via Overpass API"} · screening data</span></div>
            {selected && <button type="button" onClick={() => discoverLive(selected)} disabled={liveLoading}>↻</button>}
          </div>

          <div className="map-legend"><span><i className="official" />Official record</span><span><i className="registry" />Needs confirmation</span><span><i className="live" />Live discovery</span></div>
        </section>

        <aside className="insight-panel">
          {selected ? <>
            <div className="insight-scroll">
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
                <div className="detail-heading"><h3>Live map discovery</h3><span>{liveFeatures.length} features / 20 km</span></div>
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
