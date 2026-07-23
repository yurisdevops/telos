CREATE TABLE `session_extra_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`series_alvo` integer NOT NULL,
	`reps_alvo` integer NOT NULL,
	`carga_alvo` real,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`workout_day_exercise_id` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_day_exercise_id`) REFERENCES `workout_day_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_skips_session_day_exercise_idx` ON `session_skips` (`session_id`,`workout_day_exercise_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `hora_inicio` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `hora_fim` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `rest_timer_started_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `rest_timer_duration_seconds` integer;