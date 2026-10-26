-- Existing members remain editors. Roles are additive and never rewrite budgets.
CREATE TABLE budget_member_roles (
 budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
 PRIMARY KEY(budget_id,user_id)
);
CREATE TABLE budget_invitation_roles (
 hash TEXT PRIMARY KEY REFERENCES budget_invitations(hash) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('viewer','editor'))
);
