import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphsToTranscript, nextTokenOf, demoCloudTexts, type DingParagraph } from './cloud-texts';
import { parseScript } from '../live/cues';

const roster = [
  { id: 'linxiao', name: '林晓', aliases: ['组长'] },
  { id: 'xiaoyu', name: '小雨', aliases: ['小雨同学'] },
  { id: 'haoran', name: '浩然', aliases: ['然哥'] },
];
const p = (nickName: string, startTime: number, paragraph: string): DingParagraph => ({ nickName, startTime, endTime: startTime + 3000, paragraph });

describe('paragraphsToTranscript', () => {
  it('按时间排序、钉钉昵称映射到花名册、每 5 分钟打一个时间戳', () => {
    const r = paragraphsToTranscript([
      p('然哥', 400_000, '我周五前把 ER 图补完'),
      p('林晓', 6_000, '人到齐了，开始吧'),
      p('小雨同学', 12_000, '问卷收了一百四十份'),
      p('张老师', 20_000, '我旁听一下'),
      p('林晓', 30_000, '   '),
    ], roster);
    assert.equal(r.transcript, '[00:00:06]\n林晓：人到齐了，开始吧\n小雨：问卷收了一百四十份\n张老师：我旁听一下\n[00:06:40]\n浩然：我周五前把 ER 图补完');
    assert.equal(r.paragraphs, 4, '空段落丢掉');
    assert.deepEqual(r.speakers.find((s) => s.nickName === '然哥'), { nickName: '然哥', mappedTo: '浩然', how: 'alias' });
    assert.equal(r.speakers.find((s) => s.nickName === '张老师')?.mappedTo, null, '不在花名册的保留原昵称');
    assert.equal(r.seconds, 403);
  });

  it('段落里的换行压成一行，免得拆成没有说话人的行', () => {
    assert.equal(paragraphsToTranscript([p('林晓', 0, '第一句\n第二句')], roster).transcript, '[00:00:00]\n林晓：第一句 第二句');
  });
});

describe('nextTokenOf', () => {
  it('hasMore 时取最后一段的分页游标；文档示例拼成 nextTtoken 也认', () => {
    assert.equal(nextTokenOf({ hasMore: true, paragraphList: [{ ...p('a', 0, 'x'), nextTtoken: 1631172045153000 }] }), '1631172045153000');
    assert.equal(nextTokenOf({ hasMore: true, paragraphList: [{ ...p('a', 0, 'x'), nextToken: 42 }] }), '42');
    assert.equal(nextTokenOf({ hasMore: false, paragraphList: [{ ...p('a', 0, 'x'), nextToken: 42 }] }), null);
  });
});

describe('demoCloudTexts', () => {
  it('演示数据按文档字段构造，转回来发言人能映射回花名册', () => {
    const page = demoCloudTexts(parseScript('[00:00:06]\n小雨：我先汇报\n林晓：好'));
    assert.equal(page.paragraphList?.[0].nickName, '小雨同学');
    assert.equal(page.paragraphList?.[0].startTime, 6000);
    assert.ok(page.paragraphList?.[0].sentenceList?.length);
    assert.match(paragraphsToTranscript(page.paragraphList!, roster).transcript, /小雨：我先汇报/);
  });
});
