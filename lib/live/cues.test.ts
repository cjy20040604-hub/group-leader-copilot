import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cueClauses, parseScript, clock, stripSpeaker } from './cues';

describe('cueClauses', () => {
  it('只挑「在提议 / 在翻旧账」的半句话', () => {
    assert.deepEqual(cueClauses('阿杰：对了，PPT 要不要换回蓝白那版？感觉学校模板太丑了，红配蓝，我每次打开都眼睛疼。'), ['PPT 要不要换回蓝白那版']);
    assert.deepEqual(cueClauses('小雨：问卷现在回收了一百四十多份了，社团群那波转发效果挺好。'), []);
  });
});

describe('parseScript', () => {
  it('时间戳行定位，之后的句子按字数往后推', () => {
    const lines = parseScript('[00:07:20]\n林晓：那清洗的事，小雨下周三前把问卷数据清完。\n小雨：行。');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].at, 440);
    assert.equal(lines[0].speaker, '林晓');
    assert.ok(lines[1].at > 440);
    assert.equal(clock(440), '00:07:20');
  });

  it('说话人前缀', () => {
    assert.deepEqual(stripSpeaker('思琪：同意'), { speaker: '思琪', text: '同意' });
    assert.deepEqual(stripSpeaker('没有说话人'), { speaker: null, text: '没有说话人' });
  });
});
