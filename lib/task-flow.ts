// 任务流转规则（纯函数，确定性代码，禁止 LLM）
// 组员：认领 / 开始做 / 做完了交给组长确认 / 写进度 / 卡住了 / 申请延期
// 组长：确认完成 / 打回 / 批准或拒绝延期
// 返回「要改 tasks 的哪些字段」和「要写哪几条动态」，由 lib/task-updates.ts 在一个事务里落库

export interface FlowTask {
  id: string;
  ownerId: string | null;
  status: string;
  dueDate: string | null;
  blocker: string | null;
}

export interface FlowUser {
  id: string;
  role: 'leader' | 'member';
}

export type TaskAction =
  | { type: 'claim' }
  | { type: 'start' }
  | { type: 'submit'; note?: string }
  | { type: 'progress'; note: string }
  | { type: 'block'; reason: string }
  | { type: 'unblock'; note?: string }
  | { type: 'request_extension'; proposedDue: string; reason: string }
  | { type: 'approve' }
  | { type: 'return'; note: string }
  | { type: 'approve_extension'; updateId: string }
  | { type: 'reject_extension'; updateId: string; note?: string };

export type UpdateKind =
  | 'claim' | 'status' | 'submit' | 'progress' | 'blocked' | 'unblocked'
  | 'extension_request' | 'extension_approved' | 'extension_rejected'
  | 'review_pass' | 'review_return' | 'created';

export interface NewUpdate {
  kind: UpdateKind;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  proposedDue: string | null;
}

export interface PendingExtension {
  id: string;
  proposedDue: string;
}

export interface TaskPatch {
  ownerId?: string;
  status?: string;
  progressNote?: string | null;
  blocker?: string | null;
  dueDate?: string;
}

export type FlowResult =
  | { ok: true; patch: TaskPatch; update: NewUpdate; resolveUpdateId?: string; dueChanged: boolean; statusChanged: boolean }
  | { ok: false; error: string; code: 400 | 403 | 409 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 100;

export const UPDATE_LABEL: Record<UpdateKind, string> = {
  claim: '认领了',
  status: '改了状态',
  submit: '做完了，交给组长确认',
  progress: '更新了进度',
  blocked: '卡住了',
  unblocked: '解决了卡点',
  extension_request: '申请延期',
  extension_approved: '同意延期',
  extension_rejected: '没同意延期',
  review_pass: '确认完成',
  review_return: '打回继续改',
  created: '新建了任务',
};

function cleanNote(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, NOTE_MAX) : '';
}

const fail = (error: string, code: 400 | 403 | 409 = 400): FlowResult => ({ ok: false, error, code });

export function applyTaskAction(
  task: FlowTask,
  user: FlowUser,
  action: TaskAction,
  ctx: { today: string; pending: PendingExtension | null },
): FlowResult {
  const isOwner = task.ownerId === user.id;
  const isLeader = user.role === 'leader';
  const from = task.status;
  const up = (kind: UpdateKind, extra: Partial<NewUpdate> = {}): NewUpdate => ({
    kind, fromStatus: from, toStatus: extra.toStatus ?? from, note: extra.note ?? null, proposedDue: extra.proposedDue ?? null,
  });
  const ok = (patch: TaskPatch, update: NewUpdate, extra: { resolveUpdateId?: string; dueChanged?: boolean } = {}): FlowResult => ({
    ok: true, patch, update, resolveUpdateId: extra.resolveUpdateId, dueChanged: Boolean(extra.dueChanged),
    statusChanged: patch.status !== undefined && patch.status !== from,
  });

  if (from === 'done') return fail('这个任务已经完成了', 409);

  switch (action.type) {
    case 'claim': {
      if (task.ownerId) return fail('已经有人负责了', 409);
      // 认领前的备注是会上记的（如「没人认领」），不算新负责人的进度
      return ok({ ownerId: user.id, status: 'in_progress', progressNote: null }, up('claim', { toStatus: 'in_progress' }));
    }
    case 'start': {
      if (!isOwner) return fail('只有负责人能改自己任务的状态', 403);
      if (from === 'in_progress') return fail('已经在进行中了', 409);
      return ok({ status: 'in_progress' }, up('status', { toStatus: 'in_progress' }));
    }
    case 'submit': {
      if (!isOwner) return fail('只有负责人能提交完成', 403);
      if (from === 'awaiting_review') return fail('已经在等组长确认了', 409);
      const note = cleanNote(action.note);
      // 组长自己的任务没人审，直接完成
      const to = isLeader ? 'done' : 'awaiting_review';
      const patch: TaskPatch = { status: to, blocker: null };
      if (note) patch.progressNote = note;
      return ok(patch, up('submit', { toStatus: to, note: note || null }));
    }
    case 'progress': {
      if (!isOwner) return fail('进度只能由负责人自己写', 403);
      const note = cleanNote(action.note);
      if (!note) return fail('写一句进度再保存');
      return ok({ progressNote: note }, up('progress', { note }));
    }
    case 'block': {
      if (!isOwner) return fail('只有负责人能标「卡住了」', 403);
      if (from === 'awaiting_review') return fail('已经交给组长确认了，不用再标卡住', 409);
      const reason = cleanNote(action.reason);
      if (!reason) return fail('说一句卡在哪、需要谁帮忙');
      return ok({ blocker: reason }, up('blocked', { note: reason }));
    }
    case 'unblock': {
      if (!isOwner && !isLeader) return fail('只有负责人或组长能解除卡点', 403);
      if (!task.blocker) return fail('这个任务没有卡点', 409);
      return ok({ blocker: null }, up('unblocked', { note: cleanNote(action.note) || null }));
    }
    case 'request_extension': {
      if (!isOwner) return fail('只有负责人能申请延期', 403);
      if (ctx.pending) return fail('已经有一个延期申请在等组长回复', 409);
      if (!DATE_RE.test(action.proposedDue ?? '')) return fail('日期格式应为 YYYY-MM-DD');
      if (action.proposedDue < ctx.today) return fail('新日期不能早于今天');
      if (task.dueDate && action.proposedDue <= task.dueDate) return fail('新日期要晚于原来的 DDL');
      const reason = cleanNote(action.reason);
      if (!reason) return fail('说一句为什么要延期');
      return ok({}, up('extension_request', { note: reason, proposedDue: action.proposedDue }));
    }
    case 'approve': {
      if (!isLeader) return fail('只有组长能确认完成', 403);
      if (from !== 'awaiting_review') return fail('只有「待审核」的任务能确认完成', 409);
      return ok({ status: 'done', blocker: null }, up('review_pass', { toStatus: 'done' }));
    }
    case 'return': {
      if (!isLeader) return fail('只有组长能打回', 403);
      if (from !== 'awaiting_review') return fail('只有「待审核」的任务能打回', 409);
      const note = cleanNote(action.note);
      if (!note) return fail('说一句还差什么');
      return ok({ status: 'in_progress' }, up('review_return', { toStatus: 'in_progress', note }));
    }
    case 'approve_extension':
    case 'reject_extension': {
      if (!isLeader) return fail('只有组长能处理延期申请', 403);
      if (!ctx.pending || ctx.pending.id !== action.updateId) return fail('这条延期申请已经处理过了', 409);
      if (action.type === 'approve_extension') {
        return ok({ dueDate: ctx.pending.proposedDue }, up('extension_approved', { proposedDue: ctx.pending.proposedDue }),
          { resolveUpdateId: ctx.pending.id, dueChanged: ctx.pending.proposedDue !== task.dueDate });
      }
      return ok({}, up('extension_rejected', { note: cleanNote(action.note) || null, proposedDue: ctx.pending.proposedDue }),
        { resolveUpdateId: ctx.pending.id });
    }
    default:
      return fail('未知操作');
  }
}
