import { sqliteTable, text, integer, blob, real } from 'drizzle-orm/sqlite-core';

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
});

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  aliasesJson: text('aliases_json').notNull().default('[]'),
});

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  date: text('date').notNull(),
  title: text('title').notNull(),
  transcript: text('transcript').notNull(),
  nextMeeting: text('next_meeting'),
  processed: integer('processed').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const memoryItems = sqliteTable('memory_items', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  meetingId: text('meeting_id').notNull(),
  meetingDate: text('meeting_date').notNull(),
  type: text('type').notNull(),
  text: text('text').notNull(),
  evidence: text('evidence'),
  status: text('status').notNull().default('active'),
  supersededBy: text('superseded_by'),
  embedding: blob('embedding'),
});

export const transcriptChunks = sqliteTable('transcript_chunks', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id').notNull(),
  courseId: text('course_id').notNull(),
  startOffset: integer('start_offset').notNull(),
  text: text('text').notNull(),
  embedding: blob('embedding'),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  meetingId: text('meeting_id').notNull(),
  title: text('title').notNull(),
  ownerId: text('owner_id'),
  dueDate: text('due_date'),
  status: text('status').notNull().default('unclaimed'),
  lastUpdateAt: text('last_update_at'),
  progressNote: text('progress_note'),
  createdAt: text('created_at').notNull(),
});

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  kind: text('kind').notNull(),
  fireDate: text('fire_date').notNull(),
  message: text('message').notNull(),
  createdAt: text('created_at').notNull(),
});

export const usageLog = sqliteTable('usage_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: text('ts').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  audioSeconds: real('audio_seconds').notNull().default(0),
  costCny: real('cost_cny').notNull(),
  feature: text('feature').notNull(),
  meetingId: text('meeting_id'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});