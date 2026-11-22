DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS meetings;
DROP TABLE IF EXISTS memory_items;
DROP TABLE IF EXISTS transcript_chunks;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS task_updates;
DROP TABLE IF EXISTS reminders;
DROP TABLE IF EXISTS metric_events;
DROP TABLE IF EXISTS usage_log;
DROP TABLE IF EXISTS scheduled_meetings;
DROP TABLE IF EXISTS course_members;
DROP TABLE IF EXISTS course_plans;
DROP TABLE IF EXISTS settings;

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  transcript TEXT NOT NULL,
  next_meeting TEXT,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE memory_items (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  superseded_by TEXT,
  embedding BLOB
);

CREATE TABLE transcript_chunks (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_id TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'unclaimed',
  last_update_at TEXT,
  progress_note TEXT,
  blocker TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE task_updates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  proposed_due TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fire_date TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  responded_at TEXT,
  response TEXT
);

CREATE TABLE metric_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  course_id TEXT,
  meeting_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  audio_seconds REAL NOT NULL DEFAULT 0,
  cost_cny REAL NOT NULL,
  feature TEXT NOT NULL,
  meeting_id TEXT
);

CREATE TABLE course_members (
  course_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (course_id, member_id)
);

CREATE TABLE course_plans (
  course_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free',
  payer_id TEXT,
  split TEXT NOT NULL DEFAULT 'single',
  started_at TEXT,
  addon_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE scheduled_meetings (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_memory_course ON memory_items(course_id, status);
CREATE INDEX idx_tasks_course ON tasks(course_id, status);
CREATE INDEX idx_chunks_course ON transcript_chunks(course_id);
CREATE INDEX idx_updates_task ON task_updates(task_id, created_at);