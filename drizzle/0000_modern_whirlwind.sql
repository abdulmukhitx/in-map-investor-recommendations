CREATE TABLE `investment_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`district` text NOT NULL,
	`sector` text NOT NULL,
	`availability` text NOT NULL,
	`ownership_status` text NOT NULL,
	`evidence_level` text NOT NULL,
	`location_accuracy` text NOT NULL,
	`area_ha` real NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`base_score` integer NOT NULL,
	`power_mw` real,
	`has_rail` integer DEFAULT false NOT NULL,
	`description` text NOT NULL,
	`source_title` text NOT NULL,
	`source_url` text NOT NULL,
	`source_checked_at` text NOT NULL,
	`infrastructure_json` text NOT NULL,
	`materials_json` text NOT NULL,
	`fit_json` text NOT NULL,
	`best_for_json` text NOT NULL,
	`risks_json` text NOT NULL,
	`search_terms` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `investment_sites_sector_idx` ON `investment_sites` (`sector`);--> statement-breakpoint
CREATE INDEX `investment_sites_district_idx` ON `investment_sites` (`district`);--> statement-breakpoint
CREATE INDEX `investment_sites_score_idx` ON `investment_sites` (`base_score`);