CREATE TABLE `call_records` (
	`id` varchar(96) NOT NULL,
	`caller_id` int NOT NULL,
	`callee_id` int NOT NULL,
	`kind` enum('audio','video') NOT NULL,
	`status` enum('ringing','answered','missed','declined','ended') NOT NULL DEFAULT 'ringing',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`answered_at` timestamp,
	`ended_at` timestamp,
	`duration_seconds` int NOT NULL DEFAULT 0,
	CONSTRAINT `call_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `friend_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sender_id` int NOT NULL,
	`recipient_id` int NOT NULL,
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`responded_at` timestamp,
	CONSTRAINT `friend_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_requests_sender_recipient_unique` UNIQUE(`sender_id`,`recipient_id`)
);
--> statement-breakpoint
CREATE TABLE `mobile_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`email` varchar(320),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mobile_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `mobile_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE INDEX `call_records_caller_started_index` ON `call_records` (`caller_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `call_records_callee_started_index` ON `call_records` (`callee_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `friend_requests_recipient_status_index` ON `friend_requests` (`recipient_id`,`status`);--> statement-breakpoint
CREATE INDEX `friend_requests_sender_status_index` ON `friend_requests` (`sender_id`,`status`);--> statement-breakpoint
CREATE INDEX `mobile_users_display_name_index` ON `mobile_users` (`display_name`);