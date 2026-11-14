CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorOpenId` varchar(64),
	`actorRole` varchar(32),
	`action` varchar(64) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` varchar(128) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
-- statement-breakpoint
UPDATE `users` SET `role` = 'technician' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('technician','supervisor','admin') NOT NULL DEFAULT 'technician';--> statement-breakpoint
ALTER TABLE `sample_reports` ADD `analysisEngine` varchar(80) DEFAULT 'opencv-centroid-tracker';--> statement-breakpoint
ALTER TABLE `sample_reports` ADD `analysisVersion` varchar(32) DEFAULT '0.1.0';
