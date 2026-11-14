CREATE TABLE `analysis_engines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engineName` varchar(80) NOT NULL,
	`version` varchar(32) NOT NULL,
	`thresholds` text,
	`releaseNotes` text,
	`validatedOn` timestamp,
	`isActive` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_engines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysis_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sampleId` varchar(64) NOT NULL,
	`videoAssetId` int,
	`calibrationId` int,
	`engine` varchar(80) NOT NULL,
	`engineVersion` varchar(32) NOT NULL,
	`status` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`resultPayload` text,
	`errorMessage` text,
	`processingMs` int,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `benchmark_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`datasetVersion` varchar(80) NOT NULL,
	`engineVersion` varchar(32) NOT NULL,
	`sampleCount` int NOT NULL,
	`metricsPayload` text NOT NULL,
	`failedSamples` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `benchmark_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`laboratoryId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`deviceModel` varchar(120),
	`lens` varchar(80),
	`micronsPerPixel` varchar(32) NOT NULL,
	`chamberDepth` varchar(32) NOT NULL,
	`lightingSetup` text,
	`createdBy` varchar(64) NOT NULL,
	`verifiedBy` varchar(64),
	`verifiedAt` timestamp,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calibration_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `human_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sampleId` varchar(64) NOT NULL,
	`reviewerOpenId` varchar(64) NOT NULL,
	`reviewerRole` varchar(32) NOT NULL,
	`correctedConcentration` varchar(32),
	`correctedTotalMotility` varchar(32),
	`correctedProgressiveMotility` varchar(32),
	`morphologyPayload` text,
	`note` text,
	`status` enum('draft','final') NOT NULL DEFAULT 'final',
	`reviewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `human_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `laboratories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`country` varchar(80),
	`timezone` varchar(64) DEFAULT 'Africa/Cairo',
	`settings` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `laboratories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `laboratory_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`laboratoryId` int NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`role` enum('technician','supervisor','admin') NOT NULL DEFAULT 'technician',
	`status` enum('active','invited','suspended') NOT NULL DEFAULT 'active',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`deactivatedAt` timestamp,
	CONSTRAINT `laboratory_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` varchar(128) NOT NULL,
	`operation` enum('upsert','delete') NOT NULL,
	`payload` text NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` text,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`nextRetryAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sampleId` varchar(64) NOT NULL,
	`laboratoryId` int,
	`storageKey` varchar(512),
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`durationSec` varchar(32),
	`sha256` varchar(64) NOT NULL,
	`retentionUntil` timestamp,
	`consentStatus` enum('not_requested','granted','denied') NOT NULL DEFAULT 'not_requested',
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	CONSTRAINT `video_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `laboratoryId` int;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `oldValue` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `newValue` text;--> statement-breakpoint
ALTER TABLE `sample_reports` ADD `laboratoryId` int;--> statement-breakpoint
ALTER TABLE `sample_reports` ADD `calibrationId` int;--> statement-breakpoint
ALTER TABLE `sample_reports` ADD `videoAssetId` int;--> statement-breakpoint
ALTER TABLE `sample_reports` ADD `analysisStatus` enum('queued','processing','completed','failed','cancelled') DEFAULT 'completed' NOT NULL;--> statement-breakpoint
CREATE INDEX `analysis_engines_name_version_idx` ON `analysis_engines` (`engineName`,`version`);--> statement-breakpoint
CREATE INDEX `analysis_runs_sample_idx` ON `analysis_runs` (`sampleId`);--> statement-breakpoint
CREATE INDEX `analysis_runs_status_idx` ON `analysis_runs` (`status`);--> statement-breakpoint
CREATE INDEX `analysis_runs_engine_idx` ON `analysis_runs` (`engineVersion`);--> statement-breakpoint
CREATE INDEX `benchmark_runs_engine_idx` ON `benchmark_runs` (`engineVersion`);--> statement-breakpoint
CREATE INDEX `benchmark_runs_dataset_idx` ON `benchmark_runs` (`datasetVersion`);--> statement-breakpoint
CREATE INDEX `calibration_profiles_lab_active_idx` ON `calibration_profiles` (`laboratoryId`,`isActive`);--> statement-breakpoint
CREATE INDEX `human_reviews_sample_idx` ON `human_reviews` (`sampleId`);--> statement-breakpoint
CREATE INDEX `human_reviews_reviewer_idx` ON `human_reviews` (`reviewerOpenId`);--> statement-breakpoint
CREATE INDEX `laboratory_members_lab_user_idx` ON `laboratory_members` (`laboratoryId`,`userOpenId`);--> statement-breakpoint
CREATE INDEX `sync_queue_status_retry_idx` ON `sync_queue` (`status`,`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `sync_queue_user_idx` ON `sync_queue` (`userOpenId`);--> statement-breakpoint
CREATE INDEX `video_assets_sha256_idx` ON `video_assets` (`sha256`);--> statement-breakpoint
CREATE INDEX `video_assets_sample_idx` ON `video_assets` (`sampleId`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorOpenId`);--> statement-breakpoint
CREATE INDEX `sample_reports_owner_idx` ON `sample_reports` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `sample_reports_lab_status_idx` ON `sample_reports` (`laboratoryId`,`reviewStatus`);--> statement-breakpoint
CREATE INDEX `sample_reports_updated_idx` ON `sample_reports` (`updatedAt`);