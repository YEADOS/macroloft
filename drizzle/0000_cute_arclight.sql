CREATE TABLE `diary_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`kind` text NOT NULL,
	`food_id` integer,
	`meal_log_id` text,
	`quantity_g` real,
	`label` text,
	`energy_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`sat_fat_g` real,
	`sugars_g` real,
	`fibre_g` real,
	`sodium_mg` real,
	`logged_at` integer NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `diary_entries_date` ON `diary_entries` (`date`);--> statement-breakpoint
CREATE TABLE `food_servings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`food_id` integer NOT NULL,
	`name` text NOT NULL,
	`grams` real NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `food_servings_food_id` ON `food_servings` (`food_id`);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`energy_kj` real,
	`energy_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`sat_fat_g` real,
	`carbs_g` real NOT NULL,
	`sugars_g` real,
	`fibre_g` real,
	`sodium_mg` real,
	`micros_json` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_source_source_id` ON `foods` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `foods_barcode` ON `foods` (`barcode`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`effective_date` text NOT NULL,
	`energy_kcal` real NOT NULL,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`goal_weight_kg` real,
	`weekly_rate_kg` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_effective_date` ON `goals` (`effective_date`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`food_id` integer NOT NULL,
	`quantity_g` real NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_id` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weigh_ins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weigh_ins_date` ON `weigh_ins` (`date`);