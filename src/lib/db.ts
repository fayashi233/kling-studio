import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "kling.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
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
      prompt TEXT NOT NULL,
      negative_prompt TEXT DEFAULT '',
      model_name TEXT DEFAULT '',
      mode TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      aspect_ratio TEXT DEFAULT '',
      cfg_scale REAL DEFAULT 0.5,
      reference_image TEXT DEFAULT '',
      task_id TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      task_status TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
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
  addColumnIfMissing("images", "base64_data", "TEXT DEFAULT ''");
  addColumnIfMissing("generations", "task_type", "TEXT DEFAULT ''");
}
