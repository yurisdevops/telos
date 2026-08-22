CREATE TABLE `cardio_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer,
	`cardio_session_id` integer,
	`modalidade` text NOT NULL,
	`duracao_min` integer NOT NULL,
	`distancia_km` real,
	`intensidade` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cardio_session_id`) REFERENCES `cardio_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cardio_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` text NOT NULL,
	`hora_inicio` integer,
	`hora_fim` integer,
	`concluida` integer DEFAULT false NOT NULL,
	`obs` text
);
