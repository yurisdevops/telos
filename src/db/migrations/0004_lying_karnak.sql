CREATE TABLE `body_weight_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` text NOT NULL,
	`peso_kg` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_weight_logs_data_unique` ON `body_weight_logs` (`data`);--> statement-breakpoint
CREATE TABLE `deload_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_iso` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deload_weeks_week_start_iso_unique` ON `deload_weeks` (`week_start_iso`);--> statement-breakpoint
ALTER TABLE `set_logs` ADD `rpe` real;