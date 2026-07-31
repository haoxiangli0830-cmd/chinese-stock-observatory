ALTER TABLE `stocks` ADD `last_attempt_at` text;
--> statement-breakpoint
ALTER TABLE `stocks` ADD `sync_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `stocks` ADD `error_message` text;
--> statement-breakpoint
UPDATE `stocks` SET `sync_status` = 'ready' WHERE `last_success_at` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `prices_symbol_adjustment_date_idx` ON `prices` (`symbol`,`adjustment`,`trade_date`);
