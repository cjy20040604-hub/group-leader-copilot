import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAsrRequest, base64Bytes } from './asr-request';

describe('buildAsrRequest', () => {
  it('按百炼 OpenAI 兼容格式：system 上下文在第一位，音频用 Data URL', () => {
    const req = buildAsrRequest('qwen3-asr-flash', 'AAAA', '课程：数据库原理。成员：林晓、浩然');
    assert.equal(req.model, 'qwen3-asr-flash');
    assert.equal(req.stream, false);
    assert.deepEqual(req.asr_options, { enable_itn: true });
    const [sys, user] = req.messages as { role: string; content: { type: string; input_audio?: { data: string } }[] }[];
    assert.equal(sys.role, 'system');
    assert.equal(user.role, 'user');
    assert.equal(user.content[0].type, 'input_audio');
    assert.equal(user.content[0].input_audio?.data, 'data:audio/wav;base64,AAAA');
  });

  it('没有上下文就不带 system', () => {
    assert.equal(buildAsrRequest('m', 'AAAA', '  ').messages.length, 1);
  });

  it('Base64 换算字节数', () => {
    assert.equal(base64Bytes(Buffer.from('hello world').toString('base64')), 11);
  });
});
