CREATE TABLE `body_measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` text NOT NULL,
	`peito_cm` real,
	`cintura_cm` real,
	`quadril_cm` real,
	`braco_cm` real,
	`coxa_cm` real,
	`panturrilha_cm` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_measurements_data_unique` ON `body_measurements` (`data`);--> statement-breakpoint
ALTER TABLE `user_profile` ADD `sexo` text;