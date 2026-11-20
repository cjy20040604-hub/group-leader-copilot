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
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as unknown as { __demoDb?: ReturnType<typeof createDb> };

export const db = globalForDb.__demoDb ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForDb.__demoDb = db;

export { schema, DB_PATH };