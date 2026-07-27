import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const investmentSites = sqliteTable(
  "investment_sites",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    district: text("district").notNull(),
    sector: text("sector").notNull(),
    availability: text("availability").notNull(),
    ownershipStatus: text("ownership_status").notNull(),
    evidenceLevel: text("evidence_level").notNull(),
    locationAccuracy: text("location_accuracy").notNull(),
    areaHa: real("area_ha").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    baseScore: integer("base_score").notNull(),
    powerMw: real("power_mw"),
    hasRail: integer("has_rail", { mode: "boolean" }).notNull().default(false),
    description: text("description").notNull(),
    sourceTitle: text("source_title").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceCheckedAt: text("source_checked_at").notNull(),
    infrastructureJson: text("infrastructure_json").notNull(),
    materialsJson: text("materials_json").notNull(),
    fitJson: text("fit_json").notNull(),
    bestForJson: text("best_for_json").notNull(),
    risksJson: text("risks_json").notNull(),
    searchTerms: text("search_terms").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("investment_sites_sector_idx").on(table.sector),
    index("investment_sites_district_idx").on(table.district),
    index("investment_sites_score_idx").on(table.baseScore),
  ],
);

export const modelTrainingLabels = sqliteTable(
  "model_training_labels",
  {
    id: text("id").primaryKey(),
    expertEmail: text("expert_email").notNull(),
    category: text("category").notNull(),
    product: text("product").notNull(),
    projectJson: text("project_json").notNull(),
    leftCellId: text("left_cell_id").notNull(),
    rightCellId: text("right_cell_id").notNull(),
    leftFeaturesJson: text("left_features_json").notNull(),
    rightFeaturesJson: text("right_features_json").notNull(),
    winner: text("winner").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("model_training_labels_category_idx").on(table.category),
    index("model_training_labels_created_idx").on(table.createdAt),
  ],
);

export const modelVersions = sqliteTable(
  "model_versions",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull().unique(),
    status: text("status").notNull(),
    method: text("method").notNull(),
    weightsJson: text("weights_json").notNull(),
    metricsJson: text("metrics_json").notNull(),
    labelCount: integer("label_count").notNull(),
    trainedByEmail: text("trained_by_email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("model_versions_status_idx").on(table.status),
    index("model_versions_created_idx").on(table.createdAt),
  ],
);
