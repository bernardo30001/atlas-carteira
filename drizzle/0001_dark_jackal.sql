CREATE TABLE `performance_points` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`value_brl` real NOT NULL,
	`unit_index` real NOT NULL,
	`net_flow` real NOT NULL,
	`income_brl` real NOT NULL,
	`benchmarks` text NOT NULL,
	`baseline` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `performance_points_user_time` ON `performance_points` (`user_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `performance_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
