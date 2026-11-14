CREATE TABLE `sample_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sampleId` varchar(64) NOT NULL,
	`ownerOpenId` varchar(64),
	`reviewStatus` enum('pending','reviewed') NOT NULL DEFAULT 'pending',
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sample_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `sample_reports_sampleId_unique` UNIQUE(`sampleId`)
);
