CREATE TABLE `device_activation_challenges` (
  `id` int AUTO_INCREMENT NOT NULL,
  `challengeId` varchar(64) NOT NULL,
  `installationId` varchar(128) NOT NULL,
  `nonce` varchar(128) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `device_activation_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_activation_challenge_id_uq` ON `device_activation_challenges` (`challengeId`);
--> statement-breakpoint
CREATE INDEX `device_activation_challenge_installation_idx` ON `device_activation_challenges` (`installationId`);
