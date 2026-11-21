import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ruleExtract } from './rule-extract';

const ROSTER = [
  { id: 'linxiao', name: '林晓', aliases: ['晓姐', '组长'] },
  { id: 'ajie', name: '阿杰', aliases: ['杰哥'] },
  { id: 'xiaoyu', name: '小雨', aliases: ['雨姐'] },
  { id: 'haoran', name: '浩然', aliases: ['然哥'] },
  { id: 'siqi', name: '思琪', aliases: ['琪琪'] },
];

const TRANSCRIPT = `林晓：今天说一下数据库课的进度。
浩然：ER 图我周日前画完。
阿杰：那我负责写建表 SQL，下周二前给大家。
林晓：好，就这么定了，数据库还是用 MySQL。
小雨：测试数据谁来弄？
林晓：小雨你来吧，周五前。
思琪：答辩 PPT 谁讲还没定吧？
林晓：对，下次再说。下次开会定在下周四。`;

describe('ruleExtract（Mock 非示例转写兜底）', () => {
  const ex = ruleExtract(TRANSCRIPT, ROSTER, '2026-11-19');

  it('「定了」→ 决议，排除下次开会时间', () => {
    assert.deepEqual(ex.decisions.map((d) => d.text), ['数据库还是用 MySQL']);
  });
  it('「我 + 时间」记在说话人名下，「你来吧」接上一句的问题', () => {
    assert.deepEqual(ex.action_items.map((a) => [a.task, a.owner_raw, a.due_raw]), [
      ['ER 图画完', '浩然', '周日前'],
      ['写建表 SQL', '阿杰', '下周二前'],
      ['测试数据', '小雨', '周五前'],
    ]);
  });
  it('日期留给 lib/dates.ts 换算，不在规则里拍脑袋', () => {
    assert.ok(ex.action_items.every((a) => a.due_date === null));
  });
  it('没人接的问句 → 待定；被分配掉的问句不算', () => {
    assert.deepEqual(ex.open_questions, ['答辩 PPT 谁讲还没定吧？']);
  });
  it('下次会议按会议日期换算', () => {
    assert.equal(ex.next_meeting, '2026-11-26');
  });
  it('什么规则都不沾的文本 → 空结果而不是乱抽', () => {
    const empty = ruleExtract('林晓：大家好。\n阿杰：今天天气不错。', ROSTER, '2026-11-19');
    assert.equal(empty.decisions.length + empty.action_items.length, 0);
  });
});

describe('ruleExtract · 不同导出格式', () => {
  it('飞书 / 钉钉听记式：「名字 时间」单独一行，内容在下一行', () => {
    const r = ruleExtract(`林晓 00:00:05\n人齐了，今天定一下分工。\n\n浩然 00:00:20\nER 图我来吧，周三之前发群里。\n\n阿杰 00:01:30\n测试数据谁来弄？\n\n小雨 00:01:41\n我来，周日晚上之前。`, ROSTER, '2026-11-19');
    assert.deepEqual(r.action_items.map((a) => [a.owner_raw, a.task]), [['浩然', 'ER 图'], ['小雨', '测试数据']]);
    assert.deepEqual(r.open_questions, []);
  });

  it('腾讯会议式：「名字(时间)：内容」；「交给我」「我包了」「就按…来」', () => {
    const r = ruleExtract(`林晓(00:00:05)：大家好。\n阿杰(00:01:10)：竞品分析交给我，下周二交。\n林晓(00:01:40)：行，那报告框架就按老师给的模板来。\n浩然(00:02:50)：PPT 我包了，12月3日前做完初稿。`, ROSTER, '2026-11-19');
    assert.deepEqual(r.action_items.map((a) => a.owner_raw), ['阿杰', '浩然']);
    assert.equal(r.action_items[0].task, '竞品分析');
    assert.deepEqual(r.decisions.map((d) => d.text), ['报告框架就按老师给的模板来']);
  });

  it('口语：「那我做…」「拍板了」；「大家想想，下次再议」不和上一句问题重复记', () => {
    const r = ruleExtract(`浩然：那我做市场规模测算，后天交。\n思琪：财务部分我来写，明天晚上之前给初稿。\n林晓：经费预算先按 500 块算，拍板了。\n林晓：海报要不要做？大家想想，下次再议。`, ROSTER, '2026-11-19');
    assert.deepEqual(r.action_items.map((a) => [a.owner_raw, a.task]), [['浩然', '做市场规模测算'], ['思琪', '财务部分']]);
    assert.deepEqual(r.decisions.map((d) => d.text), ['经费预算先按 500 块算']);
    assert.deepEqual(r.open_questions, ['海报要不要做？']);
  });
});
