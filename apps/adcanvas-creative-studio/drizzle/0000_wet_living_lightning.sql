CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job` text NOT NULL,
	`product` text NOT NULL,
	`key` text,
	`response` text,
	`evaluation_response` text,
	`state` text NOT NULL,
	`quality` text NOT NULL,
	`findings` text NOT NULL,
	`review` text NOT NULL,
	`reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	`usage` text,
	`created` text NOT NULL,
	`lock` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assets_owner_job` ON `assets` (`owner`,`job`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`asset` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_owner_asset` ON `audit` (`owner`,`asset`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product` text NOT NULL,
	`prompt` text NOT NULL,
	`theme` text NOT NULL,
	`size` text NOT NULL,
	`position` text NOT NULL,
	`copy` text NOT NULL,
	`count` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_owner_created` ON `jobs` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_products_owner` ON `products` (`owner`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`daily` integer DEFAULT 20 NOT NULL
);
