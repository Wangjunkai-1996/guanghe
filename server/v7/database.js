const path = require('path')
const Database = require('better-sqlite3')
const { ensureDir } = require('../lib/files')

function createV7Database({ dbFile }) {
  ensureDir(path.dirname(dbFile))

  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS account_assets (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'LOGIN_REQUIRED',
      profile_key TEXT NOT NULL DEFAULT '',
      last_login_at TEXT,
      last_successful_query_at TEXT,
      health TEXT NOT NULL DEFAULT 'COLD',
      bound_coverage_count INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      target_doc_url TEXT NOT NULL DEFAULT '',
      target_sheet_name TEXT NOT NULL DEFAULT '',
      latest_snapshot_id TEXT,
      latest_ruleset_id TEXT,
      active_run_id TEXT,
      blockers_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      headers_json TEXT NOT NULL DEFAULT '[]',
      rows_json TEXT NOT NULL DEFAULT '[]',
      summary_json TEXT NOT NULL DEFAULT '{}',
      blockers_json TEXT NOT NULL DEFAULT '[]',
      checked_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coverage_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      sheet_row INTEGER NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      content_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      missing_columns_json TEXT NOT NULL DEFAULT '[]',
      binding_json TEXT NOT NULL DEFAULT '{}',
      recommendation TEXT NOT NULL DEFAULT '',
      result_json TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rulesets (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rule_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_batch_id TEXT,
      source_ruleset_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      use_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS batch_runs (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      ruleset_id TEXT NOT NULL,
      status TEXT NOT NULL,
      planned_count INTEGER NOT NULL DEFAULT 0,
      running_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      sync_failed_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      updated_at TEXT NOT NULL,
      rule_snapshot_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_tasks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      coverage_item_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      status TEXT NOT NULL,
      result_ref TEXT,
      artifact_refs_json TEXT NOT NULL DEFAULT '[]',
      error_code TEXT,
      error_message TEXT,
      updated_at TEXT NOT NULL,
      query_payload_json TEXT,
      sync_payload_json TEXT,
      FOREIGN KEY (run_id) REFERENCES batch_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (coverage_item_id) REFERENCES coverage_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_batch_id ON snapshots(batch_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_coverage_batch_id ON coverage_items(batch_id, status, sheet_row ASC);
    CREATE INDEX IF NOT EXISTS idx_rulesets_batch_id ON rulesets(batch_id, saved_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rule_templates_updated_at ON rule_templates(updated_at DESC, last_used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_batch_runs_batch_id ON batch_runs(batch_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_run_tasks_run_id ON run_tasks(run_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_run_tasks_batch_id ON run_tasks(batch_id, updated_at DESC);
  `)

  return db
}

module.exports = { createV7Database }
