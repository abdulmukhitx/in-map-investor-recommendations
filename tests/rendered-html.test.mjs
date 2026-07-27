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

test("server-renders the bilingual investor onboarding", async () => {
  const response = await request("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Turkistan Invest — AI-карта возможностей<\/title>/i);
  assert.match(html, /TURKISTAN INVEST/);
  assert.match(html, /Что вы хотите открыть или производить\?/);
  assert.match(html, /Выберите направление проекта/);
  assert.match(html, /Сельское хозяйство/);
  assert.match(html, /ҚАЗ/);
  assert.match(html, /Интерактивная карта лучших зон/);
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

test("investor advisor returns a plain-language fallback without a Groq key", async () => {
  const response = await request("/api/ai/advisor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locale: "ru",
      profile: { category: "agriculture", product: "Пшеница", waterNeed: true, railNeeded: false },
      zone: { cell_id: "TKO-1", score: 82, confidence: 96 },
      infrastructure: { powerKm: 7, railKm: 18, waterKm: 10 },
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.provider, "rules");
  assert.ok(data.summary.includes("Пшеница"));
  assert.ok(data.pluses.length >= 2);
  assert.ok(data.minuses.length >= 1);
  assert.equal(data.nextSteps.length, 3);
});

test("suitability model applies infrastructure gates instead of painting every strong satellite cell green", async () => {
  const metadata = { normalization_percentiles: { ndvi: { p10: 0, p90: 1 }, ndwi: { p10: -1, p90: 1 }, ndmi: { p10: -1, p90: 1 }, ndbi: { p10: -1, p90: 1 }, bsi: { p10: -1, p90: 1 } } };
  const cell = { confidence: 96, area_km2: 324, ndvi: 0.75, ndwi: 0.35, ndmi: 0.25, ndbi: -0.2, bsi: -0.1, soy: 92, rice: 96, cotton: 88, vegetables: 90, solar: 75, industrial_land: 80, power_km: 3, rail_km: 8, water_km: 2 };
  const profile = { category: "agriculture", productKey: "rice", customProduct: "", sizeHa: 100, powerNeed: "medium", waterNeed: true, railNeeded: false };
  const goodResponse = await request("/api/suitability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cell, profile, metadata }) });
  assert.equal(goodResponse.status, 200);
  const good = await goodResponse.json();
  assert.equal(good.method, "alpha-suitability-v2");
  assert.ok(good.score >= 75);
  assert.equal(good.status, "excellent");

  const weakResponse = await request("/api/suitability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cell: { ...cell, power_km: 45, water_km: 35 }, profile, metadata }) });
  const weak = await weakResponse.json();
  assert.ok(weak.score <= 49);
  assert.equal(weak.status, "weak");
  assert.ok(weak.constraints.some((item) => item.code === "water_far" && item.blocking));
  assert.ok(weak.constraints.some((item) => item.code === "power_far" && item.blocking));
});

test("data-source registry separates connected evidence from references and credentialed feeds", async () => {
  const response = await request("/api/sources");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.sources.length >= 15);
  assert.equal(new Set(data.sources.map((source) => source.id)).size, data.sources.length);
  assert.ok(data.sources.every((source) => /^https:\/\//.test(source.url)));
  assert.ok(data.sources.some((source) => source.id === "nasa-power" && source.status === "connected"));
  assert.ok(data.sources.some((source) => source.id === "egov-free-land" && source.status === "credentials_required"));
  assert.ok(data.sources.some((source) => source.id === "soilgrids" && source.status === "offline_pipeline"));
});

test("free-land endpoint never invents parcels when the official API key is absent", async () => {
  const response = await request("/api/land/free");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.records, []);
  assert.equal(data.meta.status, "credentials_required");
  assert.match(data.meta.sourceUrl, /^https:\/\/data\.egov\.kz\//);
});

test("AlphaRank stays in transparent collection mode until verified labels exist", async () => {
  const response = await request("/api/model/current");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "collecting");
  assert.equal(data.minimumLabels, 40);
  assert.equal(data.model, null);
});

test("source includes project heatmap, evidence registry, storage and regional infrastructure", async () => {
  const [page, styles, advisor, schema, discovery, hosting, packageJson, migration, modelMigration, agroRaw, infrastructureRaw, suitability, alphaRank, modelLab, modelAuth] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/advisor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/geo/discover/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_modern_whirlwind.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_worried_mentallo.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/data/agro-suitability.geojson", import.meta.url), "utf8"),
    readFile(new URL("../public/data/region-infrastructure.geojson", import.meta.url), "utf8"),
    readFile(new URL("../lib/suitability.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/alpha-rank.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/model-lab/model-lab-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/model-auth.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /import\("leaflet"\)/);
  assert.match(page, /tile\.openstreetmap\.org/);
  assert.match(page, /\/api\/geo\/discover/);
  assert.match(page, /\/api\/ai\/advisor/);
  assert.match(page, /Проверить участок в кадастре/);
  assert.match(page, /Скачать краткое заключение/);
  assert.match(page, /function scoreCell/);
  assert.match(page, /analyzeSuitability/);
  assert.match(page, /region-infrastructure\.geojson/);
  assert.match(page, /score-breakdown/);
  assert.match(page, /Өндіріс/);
  assert.match(page, /Показать лучшие зоны/);
  assert.match(page, /root\.style\.overflow = "hidden"/);
  assert.match(page, /scrollWheelZoom: !compactLayout/);
  assert.match(page, /scoreWithAlphaRank/);
  assert.match(page, /alpha-rank-v/);
  assert.match(styles, /\.advice-scroll \{ height: auto; flex: 1 1 auto; \}/);
  assert.match(styles, /max-height: calc\(100dvh - 48px\)/);
  assert.match(advisor, /GROQ_API_KEY/);
  assert.match(advisor, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.match(advisor, /response_format/);
  assert.match(schema, /investment_sites/);
  assert.match(discovery, /overpass-api\.de/);
  assert.match(discovery, /Math\.min\(30000/);
  assert.match(discovery, /line\|minor_line\|cable/);
  assert.match(discovery, /out tags geom/);
  assert.match(discovery, /out tags center 180/);
  assert.match(discovery, /distanceToSegmentKm/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(packageJson, /"leaflet"/);
  assert.doesNotMatch(packageJson, /maplibre-gl|react-loading-skeleton/);
  assert.match(migration, /CREATE TABLE `investment_sites`/);
  assert.match(modelMigration, /CREATE TABLE `model_training_labels`/);
  assert.match(modelMigration, /CREATE TABLE `model_versions`/);
  const agro = JSON.parse(agroRaw);
  assert.equal(agro.type, "FeatureCollection");
  assert.ok(agro.features.length >= 350);
  assert.match(agro.metadata.source, /Alpha Turkistan Sentinel-2 L2A 2025/);
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.ndvi)));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.ndwi)));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.ndbi)));
  assert.ok(agro.features.every((feature) => feature.properties.rice >= 0 && feature.properties.rice <= 100));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.power_km)));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.rail_km)));
  assert.ok(agro.features.every((feature) => Number.isFinite(feature.properties.water_km)));
  assert.equal(agro.metadata.infrastructure.source, "OpenStreetMap via Overpass API");
  const infrastructure = JSON.parse(infrastructureRaw);
  assert.ok(infrastructure.features.length >= 3000);
  assert.ok(infrastructure.features.every((feature) => ["power_line", "substation", "power_source"].includes(feature.properties.kind)));
  assert.match(suitability, /alpha-suitability-v2/);
  assert.match(suitability, /water_far/);
  assert.match(alphaRank, /pairwise-logistic-ranker/);
  assert.match(alphaRank, /ALPHA_RANK_MINIMUM_LABELS = 40/);
  assert.match(modelLab, /Итоговый балл намеренно скрыт/);
  assert.match(modelLab, /\/api\/model\/feedback/);
  assert.match(modelLab, /\/api\/model\/train/);
  assert.match(modelAuth, /MODEL_EXPERT_EMAILS/);
});
