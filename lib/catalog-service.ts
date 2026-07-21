import { count } from "drizzle-orm";
import { getDb } from "../db";
import { investmentSites } from "../db/schema";
import { type CatalogSite, seedSites } from "./catalog";

type SiteRow = typeof investmentSites.$inferSelect;

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToSite(row: SiteRow): CatalogSite {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    sector: row.sector as CatalogSite["sector"],
    availability: row.availability,
    ownershipStatus: row.ownershipStatus,
    evidenceLevel: row.evidenceLevel as CatalogSite["evidenceLevel"],
    locationAccuracy: row.locationAccuracy as CatalogSite["locationAccuracy"],
    areaHa: row.areaHa,
    latitude: row.latitude,
    longitude: row.longitude,
    baseScore: row.baseScore,
    powerMw: row.powerMw,
    hasRail: row.hasRail,
    description: row.description,
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    sourceCheckedAt: row.sourceCheckedAt,
    infrastructure: parseJson(row.infrastructureJson, []),
    materials: parseJson(row.materialsJson, []),
    fit: parseJson(row.fitJson, []),
    bestFor: parseJson(row.bestForJson, []),
    risks: parseJson(row.risksJson, []),
    searchTerms: row.searchTerms,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function siteToInsert(site: CatalogSite): typeof investmentSites.$inferInsert {
  return {
    id: site.id,
    name: site.name,
    district: site.district,
    sector: site.sector,
    availability: site.availability,
    ownershipStatus: site.ownershipStatus,
    evidenceLevel: site.evidenceLevel,
    locationAccuracy: site.locationAccuracy,
    areaHa: site.areaHa,
    latitude: site.latitude,
    longitude: site.longitude,
    baseScore: site.baseScore,
    powerMw: site.powerMw,
    hasRail: site.hasRail,
    description: site.description,
    sourceTitle: site.sourceTitle,
    sourceUrl: site.sourceUrl,
    sourceCheckedAt: site.sourceCheckedAt,
    infrastructureJson: JSON.stringify(site.infrastructure),
    materialsJson: JSON.stringify(site.materials),
    fitJson: JSON.stringify(site.fit),
    bestForJson: JSON.stringify(site.bestFor),
    risksJson: JSON.stringify(site.risks),
    searchTerms: site.searchTerms,
    updatedAt: new Date(site.updatedAt),
  };
}

export async function getCatalog(): Promise<{ sites: CatalogSite[]; storage: "d1" | "seed"; warning?: string }> {
  try {
    const db = await getDb();
    const [{ total }] = await db.select({ total: count() }).from(investmentSites);
    if (Number(total) === 0) {
      await db.insert(investmentSites).values(seedSites.map(siteToInsert)).onConflictDoNothing();
    }
    const rows = await db.select().from(investmentSites);
    return { sites: rows.map(rowToSite), storage: "d1" };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "D1 unavailable";
    return { sites: seedSites, storage: "seed", warning };
  }
}
