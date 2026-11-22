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
  blocker: text('blocker'), // 组员标「卡住了」时填原因；null = 没卡住
  createdAt: text('created_at').notNull(),
});

// 任务动态：组员认领/更新/卡住/申请延期，组长确认/打回/批延期，全部留痕（确定性代码写入，不调 LLM）
export const taskUpdates = sqliteTable('task_updates', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  courseId: text('course_id').notNull(),
  actorId: text('actor_id').notNull(),
  kind: text('kind').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  note: text('note'),
  proposedDue: text('proposed_due'),
  resolved: integer('resolved').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  kind: text('kind').notNull(),
  fireDate: text('fire_date').notNull(),
  message: text('message').notNull(),
  createdAt: text('created_at').notNull(),
  respondedAt: text('responded_at'), // 组员点提醒里的链接回复的时间（提醒闭环）
  response: text('response'),
});

// 成功指标用的事件（确定性代码写入）：目前记录「重复讨论被拦下」
export const metricEvents = sqliteTable('metric_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  courseId: text('course_id'),
  meetingId: text('meeting_id'),
  detail: text('detail'),
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

// 会议安排：组长手动安排，或确认纪要时按「下次会议」自动加一条（确定性代码）
export const scheduledMeetings = sqliteTable('scheduled_meetings', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  date: text('date').notNull(),
  createdAt: text('created_at').notNull(),
});

// 课程（小组）成员：不同课的小组成员可以不一样；角色按课算（同一个人可以在 A 课当组长、在 B 课当组员）
export const courseMembers = sqliteTable('course_members', {
  courseId: text('course_id').notNull(),
  memberId: text('member_id').notNull(),
  role: text('role').notNull().default('member'), // leader | member
});

// 小组套餐：体验版 / 纪要版 / 专业版（多 8 小时实时转写）/ 多组包；付款人可以是组里任何人，也可以 AA（付款人和拍板的组长分开）
export const coursePlans = sqliteTable('course_plans', {
  courseId: text('course_id').primaryKey(),
  tier: text('tier').notNull().default('free'), // free | notes | pro | bundle
  payerId: text('payer_id'),
  split: text('split').notNull().default('single'), // single | aa
  startedAt: text('started_at'),
  addonSeconds: integer('addon_seconds').notNull().default(0), // 加购的实时转写秒数（加时包，每包 3 小时）
});
