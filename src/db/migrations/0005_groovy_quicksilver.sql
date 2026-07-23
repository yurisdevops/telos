CREATE TABLE `exercise_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_wger_id` integer NOT NULL,
	`favorito` integer DEFAULT false NOT NULL,
	`nota` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_preferences_exercise_wger_id_unique` ON `exercise_preferences` (`exercise_wger_id`);--> statement-breakpoint
CREATE TABLE `exercise_substitutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`previous_exercise_wger_id` integer NOT NULL,
	`new_exercise_wger_id` integer NOT NULL,
	`substituted_at` text NOT NULL
);
