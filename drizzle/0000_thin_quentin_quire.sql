CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`symbol` text,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `annual_ranges` (
	`symbol` text NOT NULL,
	`year` integer NOT NULL,
	`low` real NOT NULL,
	`high` real NOT NULL,
	`low_date` text,
	`high_date` text,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`symbol`, `year`)
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`symbol` text NOT NULL,
	`trade_date` text NOT NULL,
	`adjustment` text NOT NULL,
	`open` real,
	`high` real,
	`low` real,
	`close` real NOT NULL,
	`volume` real,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`symbol`, `trade_date`, `adjustment`)
);
--> statement-breakpoint
CREATE INDEX `prices_symbol_date_idx` ON `prices` (`symbol`,`trade_date`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`symbol` text PRIMARY KEY NOT NULL,
	`exchange` text NOT NULL,
	`name_zh` text NOT NULL,
	`name_en` text,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`category` text DEFAULT '自选股' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT '东方财富' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_success_at` text
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
