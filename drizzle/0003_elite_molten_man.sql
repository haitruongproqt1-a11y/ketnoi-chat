ALTER TABLE `mobile_users` MODIFY COLUMN `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `mobile_users` ADD `secret_question` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `mobile_users` ADD `secret_answer_hash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `mobile_users` ADD CONSTRAINT `mobile_users_email_unique` UNIQUE(`email`);