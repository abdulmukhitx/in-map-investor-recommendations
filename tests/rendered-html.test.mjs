import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: instance } = await import(workerUrl.href);
  return instance;
}

async function request(path = "/", init = {}) {
  const instance = await worker();
  return instance.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "application/json,text/html" }, ...init }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the operational investor workspace", async () => {
  const response = await request("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Alpha Turkistan \| Investment Site Intelligence<\/title>/i);
  assert.match(html, /Find where your project can work\./);
  assert.match(html, /Match my project/);
  assert.match(html, /Interactive investment map/);
  assert.match(html, /Power grid \/ Электросеть/);
  assert.match(html, /NDVI vegetation/);
  assert.match(html, /NDBI built \/ dry/);
  assert.match(html, /Official sources only/);
  assert.match(html, /Electricity line/);
  assert.doesNotMatch(html, /codex-preview|demonstration dataset|react-loading-skeleton/i);
});

test("catalog search returns sourced records when D1 is warming up", async () => {
  const response = await request("/api/sites?query=cotton&sector=Manufacturing");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(Array.isArray(data.sites));
  assert.ok(data.sites.length >= 2);
  assert.ok(data.sites.every((site) => site.sector === "Manufacturing"));
  assert.ok(data.sites.every((site) => /^https:\/\//.test(site.sourceUrl)));
  assert.ok(data.sites.some((site) => site.id === "turan-orangai-365"));
  assert.equal(data.meta.storage, "seed");
});

test("project model ranks sites and explains the result", async () => {
  const response = await request("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sector: "Manufacturing", landHa: 100, powerMw: 20, needsRail: true, material: "cotton" }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.meta.model, "alpha-fit-v1");
  assert.match(data.meta.method, /Explainable weighted decision model/);
  assert.ok(data.recommendations.length >= 5);
  assert.ok(data.recommendations[0].score >= data.recommendations[1].score);
  assert.ok(data.recommendations[0].reasons.length > 0);
});

test("source includes persistent storage, satellite screening, Leaflet and bounded infrastructure discovery", async () => {
  const [page, schema, discovery, hosting, packageJson, migration, agroRaw] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/geo/discover/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_modern_whirlwind.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/data/agro-suitability.geojson", import.meta.url), "utf8"),
  ]);
  assert.match(page, /import\("leaflet"\)/);
  assert.match(page, /tile\.openstreetmap\.org/);
  assert.match(page, /\/api\/geo\/discover/);
  assert.match(page, /Open public cadastral map/);
  assert.match(page, /Download investor brief/);
  assert.match(page, /AI LOCATION ADVICE/);
  assert.match(page, /Alpha Turkistan 2025 Sentinel-2 mosaic/);
  assert.match(schema, /investment_sites/);
  assert.match(discovery, /overpass-api\.de/);
  assert.match(discovery, /Math\.min\(30000/);
  assert.match(discovery, /line\|minor_line\|cable/);
  assert.match(discovery, /out tags center geom/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(packageJson, /"leaflet"/);
  assert.doesNotMatch(packageJson, /maplibre-gl|react-loading-skeleton/);
  assert.match(migration, /CREATE TABLE `investment_sites`/);
  const agro = JSON.parse(agroRaw);
  assert.equal(agro.type, "FeatureCollection");
  assert.ok(agro.features.length >= 350);
  assert.match(agro.metadata.source, /Alpha Turkistan Sentinel-2 L2A 2025/);
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.ndvi)));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.ndwi)));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.ndbi)));
  assert.ok(agro.features.every((feature) => feature.properties.rice >= 0 && feature.properties.rice <= 100));
});
