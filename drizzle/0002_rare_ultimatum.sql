CREATE TABLE `mobile_push_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`platform` enum('ios','android') NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mobile_push_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `mobile_push_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `call_records` ADD `offer_data` text;--> statement-breakpoint
CREATE INDEX `mobile_push_tokens_user_active_index` ON `mobile_push_tokens` (`user_id`,`active`);