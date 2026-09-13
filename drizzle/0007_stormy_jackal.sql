CREATE TABLE `removed_places` (
	`repository_id` integer PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`removed_by` integer NOT NULL,
	`removed_at` integer NOT NULL
);
