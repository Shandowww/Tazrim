CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budgets_owner` ON `budgets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `budget_invitations` (
	`hash` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_user` text,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitations_budget` ON `budget_invitations` (`budget_id`);--> statement-breakpoint
CREATE TABLE `budget_members` (
	`budget_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	PRIMARY KEY(`budget_id`, `user_id`),
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `members_user` ON `budget_members` (`user_id`);