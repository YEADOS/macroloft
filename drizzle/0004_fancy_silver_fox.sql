CREATE TABLE `scan_photos` (
	`meal_log_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`mime_type` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scan_photos_date` ON `scan_photos` (`date`);--> statement-breakpoint
CREATE INDEX `diary_entries_meal_log_id` ON `diary_entries` (`meal_log_id`);