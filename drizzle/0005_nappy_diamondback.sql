ALTER TABLE `mobile_conversation_preferences` ADD `cleared_at` timestamp;--> statement-breakpoint
ALTER TABLE `mobile_messages` ADD `deleted_for_sender_at` timestamp;--> statement-breakpoint
ALTER TABLE `mobile_messages` ADD `deleted_for_recipient_at` timestamp;