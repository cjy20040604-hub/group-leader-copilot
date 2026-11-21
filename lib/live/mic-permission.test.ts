import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeMicError, detectBrowser } from './mic-permission';

const base = { secure: true, hasMediaDevices: true, browser: 'chrome' as const, host: 'localhost', isMac: true };

describe('detectBrowser', () => {
  it('按 UA 识别浏览器', () => {
    assert.equal(detectBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'), 'chrome');
    assert.equal(detectBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'), 'safari');
    assert.equal(detectBrowser('Mozilla/5.0 Chrome/131.0 Safari/537.36 Edg/131.0'), 'edge');
    assert.equal(detectBrowser('Mozilla/5.0 Gecko/20100101 Firefox/133.0'), 'firefox');
  });
});

describe('describeMicError', () => {
  it('非 https / localhost：说明原因，不能重试', () => {
    const h = describeMicError(null, { ...base, secure: false });
    assert.equal(h.canRetry, false);
    assert.match(h.title, /不安全/);
  });

  it('用户点了拒绝：Chrome 给地址栏步骤，Mac 再加系统设置', () => {
    const h = describeMicError({ name: 'NotAllowedError' }, base);
    assert.equal(h.title, '麦克风权限被拒绝了');
    assert.ok(h.steps.some((s) => s.includes('地址栏')));
    assert.ok(h.steps.some((s) => s.includes('隐私与安全性')));
  });

  it('Safari 拒绝：给 Safari 网站设置路径；非 Mac 不提系统设置', () => {
    const h = describeMicError({ name: 'NotAllowedError' }, { ...base, browser: 'safari', isMac: false });
    assert.ok(h.steps[0].includes('Safari'));
    assert.ok(!h.steps.some((s) => s.includes('隐私与安全性')));
  });

  it('没有麦克风 / 被占用：分别提示', () => {
    assert.equal(describeMicError({ name: 'NotFoundError' }, base).title, '没找到可用的麦克风');
    assert.equal(describeMicError({ name: 'NotReadableError' }, base).title, '麦克风被别的软件占用了');
  });
});
