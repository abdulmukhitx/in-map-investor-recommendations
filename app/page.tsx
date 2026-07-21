"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Sector = "All" | "Agro" | "Manufacturing" | "Logistics" | "Energy";
type Availability = "Available" | "Under option" | "Occupied";

type Site = {
  id: string;
  name: string;
  district: string;
  coordinates: [number, number];
  sector: Exclude<Sector, "All">;
  availability: Availability;
  ownership: string;
  area: number;
  score: number;
  power: string;
  water: string;
  road: string;
  rail: string;
  materials: string[];
  updated: string;
  summary: string;
  fit: { label: string; value: number }[];
  risks: string[];
};

const sites: Site[] = [
  {
    id: "turan-greenfield",
    name: "TURAN Greenfield",
    district: "Turkistan city",
    coordinates: [68.2749, 43.2973],
    sector: "Manufacturing",
    availability: "Available",
    ownership: "State land · lease-ready",
    area: 180,
    score: 94,
    power: "25 MW / 1.2 km",
    water: "2,800 m³/day",
    road: "A2 highway / 3.4 km",
    rail: "Freight terminal / 8 km",
    materials: ["Limestone", "Gypsum", "Cotton"],
    updated: "18 Jul 2026",
    summary:
      "Best regional fit for a mid-scale building materials or textile plant, with strong utilities, SEZ incentives and a clear land route.",
    fit: [
      { label: "Infrastructure", value: 96 },
      { label: "Market access", value: 91 },
      { label: "Raw materials", value: 88 },
      { label: "Land readiness", value: 97 },
    ],
    risks: ["Final grid connection study required", "Confirm water tariff for industrial load"],
  },
  {
    id: "sairam-agro",
    name: "Sairam Agro Hub",
    district: "Sairam district",
    coordinates: [69.766, 42.342],
    sector: "Agro",
    availability: "Available",
    ownership: "Municipal reserve · unallocated",
    area: 68,
    score: 91,
    power: "14 MW / 0.8 km",
    water: "4,200 m³/day",
    road: "A2 highway / 1.1 km",
    rail: "Badam station / 12 km",
    materials: ["Fruit", "Vegetables", "Dairy"],
    updated: "16 Jul 2026",
    summary:
      "A high-confidence location for food processing and cold-chain operations close to growers, workforce and the Shymkent consumer market.",
    fit: [
      { label: "Infrastructure", value: 90 },
      { label: "Market access", value: 96 },
      { label: "Raw materials", value: 98 },
      { label: "Land readiness", value: 82 },
    ],
    risks: ["Seasonal truck congestion", "Cold-storage capacity must be added"],
  },
  {
    id: "kentau-brownfield",
    name: "Kentau Brownfield",
    district: "Kentau city",
    coordinates: [68.5096, 43.5164],
    sector: "Manufacturing",
    availability: "Under option",
    ownership: "State asset · option pending",
    area: 35,
    score: 86,
    power: "32 MW / on site",
    water: "1,600 m³/day",
    road: "R-31 / 0.4 km",
    rail: "Industrial siding / on site",
    materials: ["Polymetal ore", "Coal", "Limestone"],
    updated: "14 Jul 2026",
    summary:
      "Existing heavy infrastructure makes this a fast brownfield candidate for mineral processing or component manufacturing.",
    fit: [
      { label: "Infrastructure", value: 93 },
      { label: "Market access", value: 76 },
      { label: "Raw materials", value: 95 },
      { label: "Land readiness", value: 79 },
    ],
    risks: ["Environmental baseline audit needed", "Ownership option expires in Q4"],
  },
  {
    id: "arys-logistics",
    name: "Arys Logistics Gate",
    district: "Arys city",
    coordinates: [68.8048, 42.4252],
    sector: "Logistics",
    availability: "Available",
    ownership: "Industrial zone · 22 ha free",
    area: 52,
    score: 89,
    power: "18 MW / 2.1 km",
    water: "1,100 m³/day",
    road: "A15 / 2.8 km",
    rail: "Arys rail junction / 1.6 km",
    materials: ["Cotton", "Grain", "Construction goods"],
    updated: "17 Jul 2026",
    summary:
      "The strongest multimodal location in the shortlist for a regional distribution center, bonded warehouse or assembly operation.",
    fit: [
      { label: "Infrastructure", value: 87 },
      { label: "Market access", value: 97 },
      { label: "Raw materials", value: 81 },
      { label: "Land readiness", value: 91 },
    ],
    risks: ["Confirm customs-facility scope", "Dust mitigation required"],
  },
  {
    id: "shardara-energy",
    name: "Shardara Agro-Energy",
    district: "Shardara district",
    coordinates: [67.9696, 41.2545],
    sector: "Energy",
    availability: "Available",
    ownership: "Public land · auction eligible",
    area: 120,
    score: 82,
    power: "Hydro node / 6 km",
    water: "Irrigation canal / 0.9 km",
    road: "Regional road / 2.2 km",
    rail: "Zhetisay terminal / 96 km",
    materials: ["Solar resource", "Crop residue", "Fish"],
    updated: "12 Jul 2026",
    summary:
      "Promising for solar, biomass or energy-intensive greenhouse activity where water and generation access outweigh rail distance.",
    fit: [
      { label: "Infrastructure", value: 83 },
      { label: "Market access", value: 67 },
      { label: "Raw materials", value: 92 },
      { label: "Land readiness", value: 88 },
    ],
    risks: ["Grid export capacity must be confirmed", "Long distance to rail freight"],
  },
  {
    id: "maktaaral-cotton",
    name: "Maktaaral Cotton Cluster",
    district: "Zhetisay district",
    coordinates: [68.3288, 40.7739],
    sector: "Agro",
    availability: "Occupied",
    ownership: "Private operator · no free parcel",
    area: 44,
    score: 78,
    power: "10 MW / 1.9 km",
    water: "Canal network / on site",
    road: "A15 / 5.2 km",
    rail: "Zhetisay terminal / 7 km",
    materials: ["Cotton", "Melons", "Vegetables"],
    updated: "10 Jul 2026",
    summary:
      "Excellent feedstock density for cotton and food processing, but investors should seek a joint venture because the mapped parcel is occupied.",
    fit: [
      { label: "Infrastructure", value: 79 },
      { label: "Market access", value: 75 },
      { label: "Raw materials", value: 99 },
      { label: "Land readiness", value: 41 },
    ],
    risks: ["Parcel currently occupied", "Cross-border logistics can vary seasonally"],
  },
];

const sectorOptions: Sector[] = ["All", "Agro", "Manufacturing", "Logistics", "Energy"];

const infrastructureGeoJson = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { kind: "electricity" },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [67.94, 41.22],
          [68.43, 42.03],
          [68.81, 42.43],
          [68.5, 43.52],
          [68.27, 43.3],
          [69.77, 42.34],
        ],
      },
    },
    {
      type: "Feature" as const,
      properties: { kind: "rail" },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [68.33, 40.77],
          [68.81, 42.43],
          [68.27, 43.3],
          [68.51, 43.52],
        ],
      },
    },
  ],
};

const materialsGeoJson = {
  type: "FeatureCollection" as const,
  features: [
    { type: "Feature" as const, properties: { material: "Cotton" }, geometry: { type: "Point" as const, coordinates: [68.28, 40.86] } },
    { type: "Feature" as const, properties: { material: "Limestone" }, geometry: { type: "Point" as const, coordinates: [68.62, 43.42] } },
    { type: "Feature" as const, properties: { material: "Fruit" }, geometry: { type: "Point" as const, coordinates: [69.48, 42.47] } },
    { type: "Feature" as const, properties: { material: "Solar" }, geometry: { type: "Point" as const, coordinates: [67.96, 41.42] } },
  ],
};

function statusClass(status: Availability) {
  return status === "Available" ? "available" : status === "Occupied" ? "occupied" : "option";
}

function SuitabilityRing({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{score}</strong>
        <span>AI fit</span>
      </div>
    </div>
  );
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const [selectedId, setSelectedId] = useState(sites[0].id);
  const [sector, setSector] = useState<Sector>("All");
  const [freeOnly, setFreeOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [layers, setLayers] = useState({ power: true, rail: true, materials: true });
  const [compared, setCompared] = useState<string[]>([]);

  const visibleSites = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sites.filter((site) => {
      const sectorMatch = sector === "All" || site.sector === sector;
      const availabilityMatch = !freeOnly || site.availability === "Available";
      const queryMatch = !normalized || `${site.name} ${site.district} ${site.materials.join(" ")}`.toLowerCase().includes(normalized);
      return sectorMatch && availabilityMatch && queryMatch;
    });
  }, [freeOnly, query, sector]);

  const selected = sites.find((site) => site.id === selectedId) ?? sites[0];

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      center: [68.7, 42.25],
      zoom: 6.45,
      minZoom: 5.7,
      maxZoom: 13,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.65, "raster-contrast": 0.05, "raster-brightness-max": 0.94 } }],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      map.addSource("infrastructure", { type: "geojson", data: infrastructureGeoJson });
      map.addLayer({
        id: "power-lines",
        type: "line",
        source: "infrastructure",
        filter: ["==", ["get", "kind"], "electricity"],
        paint: { "line-color": "#e1a52f", "line-width": 2.4, "line-opacity": 0.86, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: "rail-lines",
        type: "line",
        source: "infrastructure",
        filter: ["==", ["get", "kind"], "rail"],
        paint: { "line-color": "#233e3c", "line-width": 2.2, "line-opacity": 0.72, "line-dasharray": [1, 2] },
      });
      map.addSource("materials", { type: "geojson", data: materialsGeoJson });
      map.addLayer({
        id: "material-zones",
        type: "circle",
        source: "materials",
        paint: {
          "circle-radius": 18,
          "circle-color": "#d6ea5b",
          "circle-opacity": 0.28,
          "circle-stroke-color": "#6f7d26",
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
        id: "material-labels",
        type: "symbol",
        source: "materials",
        layout: { "text-field": ["get", "material"], "text-size": 11, "text-offset": [0, 2.25] },
        paint: { "text-color": "#34421f", "text-halo-color": "#f6f4ee", "text-halo-width": 1.5 },
      });
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = visibleSites.map((site) => {
      const button = document.createElement("button");
      button.className = `site-marker ${statusClass(site.availability)}${site.id === selectedId ? " selected" : ""}`;
      button.type = "button";
      button.title = `${site.name} — ${site.score} AI fit`;
      button.setAttribute("aria-label", `Select ${site.name}`);
      button.innerHTML = `<span>${site.score}</span>`;
      button.addEventListener("click", () => setSelectedId(site.id));
      return new maplibregl.Marker({ element: button, anchor: "center" }).setLngLat(site.coordinates).addTo(map);
    });
  }, [mapReady, selectedId, visibleSites]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty("power-lines", "visibility", layers.power ? "visible" : "none");
    map.setLayoutProperty("rail-lines", "visibility", layers.rail ? "visible" : "none");
    map.setLayoutProperty("material-zones", "visibility", layers.materials ? "visible" : "none");
    map.setLayoutProperty("material-labels", "visibility", layers.materials ? "visible" : "none");
  }, [layers, mapReady]);

  function chooseSite(site: Site) {
    setSelectedId(site.id);
    mapRef.current?.flyTo({ center: site.coordinates, zoom: 8.4, duration: 900 });
  }

  function toggleCompare(id: string) {
    setCompared((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-2), id]));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">A</div>
          <div>
            <strong>ALPHA TURKISTAN</strong>
            <span>Investment Intelligence</span>
          </div>
        </div>

        <div className="region-control" aria-label="Selected region">
          <span className="control-label">Region</span>
          <strong>Turkistan Region</strong>
          <span aria-hidden="true">⌄</span>
        </div>

        <div className="header-stats" aria-label="Portfolio summary">
          <div><strong>47</strong><span>screened</span></div>
          <div><strong>12</strong><span>available</span></div>
          <div><strong>9</strong><span>utility-ready</span></div>
        </div>

        <nav className="top-actions" aria-label="Workspace actions">
          <button className="language-button" type="button">EN <span>⌄</span></button>
          <button className="workspace-button" type="button"><span className="pulse-dot" /> Investor workspace</button>
        </nav>
      </header>

      <section className="workspace">
        <aside className="filter-panel" aria-label="Investment site filters">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Site finder</span>
              <h1>Find the right place to build.</h1>
            </div>
            <span className="beta-pill">BETA</span>
          </div>

          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search district or material"
              aria-label="Search district or material"
            />
            <kbd>⌘K</kbd>
          </label>

          <div className="filter-section">
            <div className="section-title"><span>BUSINESS TYPE</span><button type="button" onClick={() => setSector("All")}>Reset</button></div>
            <div className="sector-grid">
              {sectorOptions.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={sector === option ? "active" : ""}
                  onClick={() => setSector(option)}
                  aria-pressed={sector === option}
                >
                  <span className={`sector-icon ${option.toLowerCase()}`} aria-hidden="true">{option === "All" ? "•" : option.charAt(0)}</span>
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section compact">
            <div className="section-title"><span>LAND STATUS</span></div>
            <label className="toggle-row">
              <div><strong>Show free land only</strong><span>Exclude occupied or reserved parcels</span></div>
              <input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
          </div>

          <div className="results-heading">
            <span><strong>{visibleSites.length}</strong> matching sites</span>
            <button type="button">AI ranked <span>↓</span></button>
          </div>

          <div className="site-list">
            {visibleSites.map((site) => (
              <button
                type="button"
                className={`site-card ${site.id === selectedId ? "selected" : ""}`}
                onClick={() => chooseSite(site)}
                key={site.id}
              >
                <span className={`availability-dot ${statusClass(site.availability)}`} />
                <span className="site-card-copy">
                  <strong>{site.name}</strong>
                  <span>{site.district} · {site.area} ha</span>
                  <small>{site.sector} · {site.ownership.split("·")[0]}</small>
                </span>
                <span className="mini-score">{site.score}<small>AI</small></span>
              </button>
            ))}
            {visibleSites.length === 0 && <div className="empty-state"><strong>No sites match.</strong><span>Try another sector or turn off the free-land filter.</span></div>}
          </div>
        </aside>

        <section className="map-stage" aria-label="Interactive map of investment sites">
          <div ref={mapContainer} className="map-container" />

          <div className="map-toolbar" aria-label="Map layers">
            <span className="toolbar-label">MAP LAYERS</span>
            <button type="button" className={layers.power ? "active power" : ""} onClick={() => setLayers((state) => ({ ...state, power: !state.power }))} aria-pressed={layers.power}><i /> Power grid</button>
            <button type="button" className={layers.rail ? "active rail" : ""} onClick={() => setLayers((state) => ({ ...state, rail: !state.rail }))} aria-pressed={layers.rail}><i /> Rail</button>
            <button type="button" className={layers.materials ? "active material" : ""} onClick={() => setLayers((state) => ({ ...state, materials: !state.materials }))} aria-pressed={layers.materials}><i /> Materials</button>
          </div>

          <div className="map-legend">
            <span><i className="available" /> Available</span>
            <span><i className="option" /> Under option</span>
            <span><i className="occupied" /> Occupied</span>
          </div>

          <div className="map-caption">
            <span className="live-indicator" />
            <div><strong>Investor map · demonstration dataset</strong><span>Connect cadastre and utility APIs for authoritative records</span></div>
          </div>
        </section>

        <aside className="insight-panel" aria-label="Selected site investment brief">
          <div className="insight-scroll">
            <div className="insight-topline">
              <span className={`status-pill ${statusClass(selected.availability)}`}><i />{selected.availability}</span>
              <button className="more-button" type="button" aria-label="More site actions">•••</button>
            </div>

            <div className="site-title-row">
              <div>
                <span className="eyebrow">{selected.district}</span>
                <h2>{selected.name}</h2>
                <p>{selected.sector} opportunity · {selected.area} hectares</p>
              </div>
              <SuitabilityRing score={selected.score} />
            </div>

            <div className="ai-summary">
              <div className="spark-mark" aria-hidden="true">✦</div>
              <div><strong>AI location verdict</strong><p>{selected.summary}</p></div>
            </div>

            <section className="detail-section">
              <div className="detail-heading"><h3>Site readiness</h3><span>Updated {selected.updated}</span></div>
              <div className="metric-grid">
                <div><span className="metric-icon">P</span><small>Power capacity</small><strong>{selected.power}</strong></div>
                <div><span className="metric-icon">W</span><small>Water access</small><strong>{selected.water}</strong></div>
                <div><span className="metric-icon">R</span><small>Road access</small><strong>{selected.road}</strong></div>
                <div><span className="metric-icon">T</span><small>Rail access</small><strong>{selected.rail}</strong></div>
              </div>
            </section>

            <section className="detail-section ownership-section">
              <div className="detail-heading"><h3>Land & ownership</h3><span className="verified-tag">✓ Verified</span></div>
              <div className="ownership-card">
                <div className={`land-icon ${statusClass(selected.availability)}`}><span /></div>
                <div><small>REGISTERED STATUS</small><strong>{selected.ownership}</strong><span>Parcel area: {selected.area} ha</span></div>
              </div>
            </section>

            <section className="detail-section">
              <div className="detail-heading"><h3>Nearby materials</h3><span>Within 80 km</span></div>
              <div className="material-tags">
                {selected.materials.map((material) => <span key={material}>{material}<small>●</small></span>)}
              </div>
            </section>

            <section className="detail-section">
              <div className="detail-heading"><h3>AI classification</h3><span>4 weighted signals</span></div>
              <div className="fit-bars">
                {selected.fit.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span><strong>{item.value}</strong>
                    <i><b style={{ width: `${item.value}%` }} /></i>
                  </div>
                ))}
              </div>
            </section>

            <section className="risk-box">
              <strong>Due diligence flags</strong>
              {selected.risks.map((risk) => <span key={risk}><i>!</i>{risk}</span>)}
            </section>
          </div>

          <div className="insight-actions">
            <button type="button" className="compare-button" onClick={() => toggleCompare(selected.id)} aria-pressed={compared.includes(selected.id)}>
              {compared.includes(selected.id) ? "✓ In comparison" : "+ Compare site"}
            </button>
            <button type="button" className="brief-button">Open full brief <span>↗</span></button>
          </div>
        </aside>
      </section>

      {compared.length > 0 && (
        <div className="compare-tray" role="status">
          <span><strong>{compared.length}/3</strong> sites selected for comparison</span>
          <div>{compared.map((id) => <i key={id}>{sites.find((site) => site.id === id)?.name}<button type="button" onClick={() => toggleCompare(id)} aria-label={`Remove ${id}`}>×</button></i>)}</div>
          <button type="button" disabled={compared.length < 2}>Compare now</button>
        </div>
      )}
    </main>
  );
}
