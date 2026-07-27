CREATE TABLE `model_training_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`expert_email` text NOT NULL,
	`category` text NOT NULL,
	`product` text NOT NULL,
	`project_json` text NOT NULL,
	`left_cell_id` text NOT NULL,
	`right_cell_id` text NOT NULL,
	`left_features_json` text NOT NULL,
	`right_features_json` text NOT NULL,
	`winner` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_training_labels_category_idx` ON `model_training_labels` (`category`);--> statement-breakpoint
CREATE INDEX `model_training_labels_created_idx` ON `model_training_labels` (`created_at`);--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`method` text NOT NULL,
	`weights_json` text NOT NULL,
	`metrics_json` text NOT NULL,
	`label_count` integer NOT NULL,
	`trained_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_versions_version_unique` ON `model_versions` (`version`);--> statement-breakpoint
CREATE INDEX `model_versions_status_idx` ON `model_versions` (`status`);--> statement-breakpoint
CREATE INDEX `model_versions_created_idx` ON `model_versions` (`created_at`);