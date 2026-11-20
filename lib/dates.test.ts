import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDueDate } from './dates';

const d = (raw: string, base = '2026-11-19') => parseDueDate(raw, base).date; // 2026-11-19 是周四

describe('parseDueDate（DDL 规则换算）', () => {
  it('周几：下周三 / 周五前 / 这周末', () => {
    assert.equal(d('下周三前'), '2026-11-25');
    assert.equal(d('周五前'), '2026-11-20');
    assert.equal(d('这周末'), '2026-11-22');
  });
  it('中文数字的「N 天后」', () => {
    assert.equal(d('三天后'), '2026-11-22');
    assert.equal(d('两天内'), '2026-11-21');
  });
  it('月底', () => {
    assert.equal(d('月底前'), '2026-11-30');
  });
  it('跨年：12 月开会说「1 月 5 号」是明年', () => {
    assert.equal(d('1月5号', '2026-12-20'), '2027-01-05');
  });
  it('认不出来就返回 null，不瞎猜', () => {
    assert.equal(d('等他有空'), null);
  });
});
