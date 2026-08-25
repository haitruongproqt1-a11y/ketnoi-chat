CREATE TABLE `mobile_conversation_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`peer_id` int NOT NULL,
	`pinned` int NOT NULL DEFAULT 0,
	`archived` int NOT NULL DEFAULT 0,
	`muted` int NOT NULL DEFAULT 0,
	`hidden` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mobile_conversation_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `mobile_conversation_preferences_user_peer_unique` UNIQUE(`user_id`,`peer_id`)
);
--> statement-breakpoint
CREATE TABLE `mobile_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sender_id` int NOT NULL,
	`recipient_id` int NOT NULL,
	`body` text NOT NULL,
	`media_payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`delivered_at` timestamp,
	`read_at` timestamp,
	`media_revoked_at` timestamp,
	CONSTRAINT `mobile_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mobile_conversation_preferences_user_updated_index` ON `mobile_conversation_preferences` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `mobile_messages_sender_created_index` ON `mobile_messages` (`sender_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mobile_messages_recipient_created_index` ON `mobile_messages` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mobile_messages_recipient_read_index` ON `mobile_messages` (`recipient_id`,`read_at`);