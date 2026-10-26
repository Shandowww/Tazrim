-- Queryable, rebuildable projection. Original budgets remain authoritative.
CREATE TABLE financial_scopes (
 scope TEXT PRIMARY KEY, revision INTEGER NOT NULL, model_version INTEGER NOT NULL,
 encrypted INTEGER NOT NULL CHECK(encrypted IN (0,1)), updated_at TEXT NOT NULL
);
CREATE TABLE financial_entities (
 scope TEXT NOT NULL REFERENCES financial_scopes(scope) ON DELETE CASCADE,
 kind TEXT NOT NULL, id TEXT NOT NULL, label TEXT, parent_id TEXT, payload TEXT NOT NULL,
 PRIMARY KEY(scope,kind,id)
);
CREATE INDEX financial_entities_label ON financial_entities(scope,kind,label);
CREATE TABLE financial_transactions (
 scope TEXT NOT NULL REFERENCES financial_scopes(scope) ON DELETE CASCADE,
 id TEXT NOT NULL, source TEXT NOT NULL, source_key TEXT, report_id TEXT,
 account_id TEXT, card_id TEXT, category_id TEXT, merchant TEXT, description TEXT,
 occurred_on TEXT, billing_month TEXT NOT NULL, due_on TEXT,
 amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'ILS',
 accounting TEXT NOT NULL, state TEXT NOT NULL, detail_level TEXT NOT NULL,
 payload TEXT NOT NULL, PRIMARY KEY(scope,id)
);
CREATE INDEX financial_tx_date ON financial_transactions(scope,occurred_on,id);
CREATE INDEX financial_tx_month ON financial_transactions(scope,billing_month,id);
CREATE INDEX financial_tx_account ON financial_transactions(scope,account_id,billing_month);
CREATE INDEX financial_tx_card ON financial_transactions(scope,card_id,billing_month);
CREATE INDEX financial_tx_category ON financial_transactions(scope,category_id,billing_month);
CREATE INDEX financial_tx_report ON financial_transactions(scope,report_id);
CREATE INDEX financial_tx_merchant ON financial_transactions(scope,merchant);
CREATE TABLE financial_months (
 scope TEXT NOT NULL REFERENCES financial_scopes(scope) ON DELETE CASCADE,
 account_id TEXT NOT NULL, month TEXT NOT NULL, field TEXT NOT NULL,
 amount_cents INTEGER NOT NULL, actual INTEGER NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(scope,account_id,month,field)
);
CREATE TABLE financial_audit (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL,
 revision INTEGER NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL,
 action TEXT NOT NULL, before_hash TEXT, after_hash TEXT, recorded_at TEXT NOT NULL
);
CREATE INDEX financial_audit_scope ON financial_audit(scope,revision,seq);
CREATE VIEW financial_accounts AS SELECT scope,id,label,json_extract(payload,'$.bankName') AS bank_name,payload FROM financial_entities WHERE kind='account';
CREATE VIEW financial_cards AS SELECT scope,id,label,parent_id AS account_id,json_extract(payload,'$.billingDay') AS billing_day,payload FROM financial_entities WHERE kind='card';
CREATE VIEW financial_categories AS SELECT scope,id,label,parent_id,payload FROM financial_entities WHERE kind='category';
CREATE VIEW financial_reports AS SELECT scope,id,label,parent_id AS account_id,json_extract(payload,'$.from') AS period_from,json_extract(payload,'$.to') AS period_to,payload FROM financial_entities WHERE kind='report';
CREATE VIEW financial_goals AS SELECT scope,id,label,json_extract(payload,'$.target') AS target,json_extract(payload,'$.allocated') AS allocated,payload FROM financial_entities WHERE kind='goal';
