CREATE TABLE `device_licenses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `serialHash` varchar(128) NOT NULL,
  `status` enum('active','suspended','revoked') NOT NULL DEFAULT 'active',
  `maxDevices` int NOT NULL DEFAULT 1,
  `expiresAt` timestamp,
  `createdBy` varchar(64),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `device_licenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_licenses_serial_hash_uq` ON `device_licenses` (`serialHash`);
--> statement-breakpoint
CREATE INDEX `device_licenses_status_idx` ON `device_licenses` (`status`);
--> statement-breakpoint
CREATE TABLE `licensed_devices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `licenseId` int NOT NULL,
  `installationId` varchar(128) NOT NULL,
  `publicKey` text NOT NULL,
  `keyFingerprint` varchar(128) NOT NULL,
  `platform` enum('android') NOT NULL DEFAULT 'android',
  `appVersion` varchar(32),
  `versionCode` int,
  `status` enum('active','revoked') NOT NULL DEFAULT 'active',
  `activatedAt` timestamp NOT NULL DEFAULT (now()),
  `lastValidatedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `licensed_devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `licensed_devices_installation_uq` ON `licensed_devices` (`installationId`);
--> statement-breakpoint
CREATE INDEX `licensed_devices_license_idx` ON `licensed_devices` (`licenseId`);
--> statement-breakpoint
CREATE INDEX `licensed_devices_fingerprint_idx` ON `licensed_devices` (`keyFingerprint`);
--> statement-breakpoint
CREATE TABLE `app_releases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `version` varchar(32) NOT NULL,
  `versionCode` int NOT NULL,
  `channel` enum('stable','beta') NOT NULL DEFAULT 'stable',
  `minSupportedVersionCode` int NOT NULL DEFAULT 1,
  `isMandatory` int NOT NULL DEFAULT 0,
  `apkUrl` varchar(1024) NOT NULL,
  `sha256` varchar(64) NOT NULL,
  `fileSizeBytes` int NOT NULL,
  `manifestSignature` text NOT NULL,
  `releaseNotes` text,
  `isActive` int NOT NULL DEFAULT 0,
  `publishedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `app_releases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_releases_version_code_uq` ON `app_releases` (`versionCode`);
--> statement-breakpoint
CREATE INDEX `app_releases_channel_active_idx` ON `app_releases` (`channel`,`isActive`);
--> statement-breakpoint
CREATE TABLE `license_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `licenseId` int,
  `deviceId` int,
  `actorOpenId` varchar(64),
  `eventType` varchar(64) NOT NULL,
  `ipAddress` varchar(45),
  `details` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `license_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `license_events_license_idx` ON `license_events` (`licenseId`);
--> statement-breakpoint
CREATE INDEX `license_events_device_idx` ON `license_events` (`deviceId`);
--> statement-breakpoint
CREATE INDEX `license_events_created_idx` ON `license_events` (`createdAt`);
