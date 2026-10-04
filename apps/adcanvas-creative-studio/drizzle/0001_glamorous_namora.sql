ALTER TABLE `jobs` ADD `image_model` text DEFAULT 'gpt-image-2.5-sunburst' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `text_model` text DEFAULT 'gpt-6-astra' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `theme_version` integer DEFAULT 1 NOT NULL;