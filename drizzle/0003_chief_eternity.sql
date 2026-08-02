CREATE TABLE `investment_lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`invested_amount` real NOT NULL,
	`entry_price` real NOT NULL,
	`fees` real DEFAULT 0 NOT NULL,
	`invested_at` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `investment_lots_user_date_idx` ON `investment_lots` (`user_id`,`invested_at`);--> statement-breakpoint
CREATE INDEX `investment_lots_user_symbol_idx` ON `investment_lots` (`user_id`,`symbol`);--> statement-breakpoint
PRAGMA optimize;
