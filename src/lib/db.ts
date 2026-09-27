import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "kling.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  // Ensure parent directory exists (data/ is gitignored, won't exist after clone)
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  migrateSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      negative_prompt TEXT DEFAULT '',
      model_name TEXT DEFAULT 'kling-v1-6',
      mode TEXT DEFAULT 'std',
      duration TEXT DEFAULT '5',
      aspect_ratio TEXT DEFAULT '16:9',
      cfg_scale REAL DEFAULT 0.5,
      reference_image TEXT,
      last_frame_image TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      tags TEXT DEFAULT '',
      group_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_status TEXT DEFAULT 'submitted',
      video_url TEXT,
      error_msg TEXT,
      duration_ms INTEGER,
      export_view_type TEXT DEFAULT '',
      export_scene_type TEXT DEFAULT '',
      export_case_type TEXT DEFAULT '',
      video_code TEXT DEFAULT '',
      first_frame_code TEXT DEFAULT '',
      last_frame_code TEXT DEFAULT '',
      original_image_code TEXT DEFAULT '',
      image_source TEXT DEFAULT '',
      image_tool TEXT DEFAULT '',
      video_tool TEXT DEFAULT '可灵-api',
      usable TEXT DEFAULT '',
      issue_type TEXT DEFAULT '',
      issue_description TEXT DEFAULT '',
      export_tags TEXT DEFAULT '',
      export_selected INTEGER DEFAULT 0,
      exported_at TEXT DEFAULT '',
      export_batch_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id)
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      label TEXT DEFAULT '',
      base64_data TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      parent_id TEXT DEFAULT '',
      prompt_id TEXT DEFAULT '',
      prompt TEXT NOT NULL,
      negative_prompt TEXT DEFAULT '',
      model_name TEXT DEFAULT '',
      mode TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      aspect_ratio TEXT DEFAULT '',
      cfg_scale REAL DEFAULT 0.5,
      reference_image TEXT DEFAULT '',
      last_frame_image TEXT DEFAULT '',
      task_id TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      task_status TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS elements (
      id TEXT PRIMARY KEY,
      api_element_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tag TEXT DEFAULT '',
      provider TEXT DEFAULT 'kling-official',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Ensure unique index on api_element_id (safe on existing tables)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_elements_api_element_id ON elements(api_element_id);
  `);
}

function migrateSchema(db: Database.Database) {
  // Add columns if they don't exist (safe for existing DBs)
  const addColumnIfMissing = (table: string, column: string, def: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  };
  addColumnIfMissing("prompts", "group_name", "TEXT DEFAULT ''");
  addColumnIfMissing("prompts", "last_frame_image", "TEXT DEFAULT ''");
  addColumnIfMissing("images", "base64_data", "TEXT DEFAULT ''");
  addColumnIfMissing("prompt_versions", "prompt_id", "TEXT DEFAULT ''");
  addColumnIfMissing("prompt_versions", "last_frame_image", "TEXT DEFAULT ''");
  // Index for prompt_id lookups
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt_id ON prompt_versions(prompt_id)`);
  // Index for task_id lookups (JOIN generations → prompt_versions)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_versions_task_id ON prompt_versions(task_id)`);
  addColumnIfMissing("generations", "task_type", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "quality", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "reject_reason", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "export_view_type", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "export_scene_type", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "export_case_type", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "video_code", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "first_frame_code", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "last_frame_code", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "original_image_code", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "image_source", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "image_tool", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "video_tool", "TEXT DEFAULT '可灵-api'");
  addColumnIfMissing("generations", "usable", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "issue_type", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "issue_description", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "export_tags", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "export_selected", "INTEGER DEFAULT 0");
  addColumnIfMissing("generations", "exported_at", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "export_batch_id", "TEXT DEFAULT ''");
}
