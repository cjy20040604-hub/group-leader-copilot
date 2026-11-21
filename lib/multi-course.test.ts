import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessLoad } from './multi-course';

describe('assessLoad（组员跨课负载）', () => {
  it('两门课各一个 DDL → 跨课撞车，写明隔几天', () => {
    assert.deepEqual(assessLoad([{ date: '2026-11-24', courseId: 'db' }, { date: '2026-11-20', courseId: 'mkt' }]), { courses: 2, reason: '2 门课各有 DDL，前后只隔 4 天' });
  });
  it('同一门课两个 DDL 不算撞车', () => {
    assert.equal(assessLoad([{ date: '2026-11-21', courseId: 'db' }, { date: '2026-11-24', courseId: 'db' }]).reason, null);
  });
  it('三件以上就算太满', () => {
    assert.equal(assessLoad([1, 2, 3].map((d) => ({ date: `2026-11-2${d}`, courseId: 'db' }))).reason, '这周有 3 件要交');
  });
});
