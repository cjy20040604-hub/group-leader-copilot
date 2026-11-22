import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'demo.db');

function createDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

// 老库就地升级（不删数据）：v2 加了 tasks.blocker、task_updates；v3 加了 reminders 回复字段、metric_events；全新库由 seed/init.sql 建
function migrate(sqlite: Database.Database) {
  const hasTasks = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (!hasTasks) return;
  const cols = (sqlite.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('blocker')) sqlite.exec('ALTER TABLE tasks ADD COLUMN blocker TEXT');
  const rcols = (sqlite.prepare('PRAGMA table_info(reminders)').all() as { name: string }[]).map((c) => c.name);
  if (rcols.length && !rcols.includes('responded_at')) sqlite.exec('ALTER TABLE reminders ADD COLUMN responded_at TEXT');
  if (rcols.length && !rcols.includes('response')) sqlite.exec('ALTER TABLE reminders ADD COLUMN response TEXT');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS metric_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, course_id TEXT, meeting_id TEXT, detail TEXT, created_at TEXT NOT NULL
  );`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS task_updates (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, course_id TEXT NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL,
    from_status TEXT, to_status TEXT, note TEXT, proposed_due TEXT, resolved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_updates_task ON task_updates(task_id, created_at);`);
  sqlite.exec('CREATE TABLE IF NOT EXISTS scheduled_meetings (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL);');
}

const globalForDb = globalThis as unknown as { __demoDb?: ReturnType<typeof createDb> };

export const db = globalForDb.__demoDb ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForDb.__demoDb = db;

export { schema, DB_PATH };