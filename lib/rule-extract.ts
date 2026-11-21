// 规则抽取（确定性代码）：Mock 模式下遇到非示例转写、或真实模式 LLM 两次输出非法 JSON 时兜底。
// 只认明确的说法：「定了 / 就用 / 改成」→ 决议；「某人 + 负责/来 + 时间」→ 待办；问句或「还没定」→ 待定。
// 漏抽比抽错好：抽不到的由组长在确认面板手动补。
import type { Extraction } from '@/lib/llm';
import type { RosterMember } from '@/lib/roster';
import { parseDueDate } from '@/lib/dates';

const DUE_RE = /((下下|下|本|这)?(周|星期|礼拜)[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|今天|今晚|明天|明晚|后天|[\d一两二三四五六七八九十]+\s*天(后|内)|月底|(下下|下|这)?周末)(早上|上午|中午|下午|晚上)?(\d{1,2}\s*点)?(之前|以前|前)?/;
const DECISION_RE = /(就这么定|那就定|定了|决定|就定|定在|定为|就用|统一用|改用|改成|确定用|敲定|就按|按这个来|就这么办|拍板|先按[^，。]{1,12}(算|来))/;
const OPEN_RE = /(还没定|没想好|再看看|再议|下次再|待定|再讨论|没结论)/;
const ACTION_HINT_RE = /(负责|来做|来弄|来写|来画|来吧|交给|包了)/;
const FILLER_RE = /^(嗯+|呃+|啊+|那|好|好的|行|OK|ok|对|然后|就是)[，,、\s]*/;
const NEXT_MEETING_RE = /下次(开会|会议|组会|碰头)?[^。！？]*?((下下|下|本|这)?(周|星期|礼拜)[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|明天|后天)/;

interface Sentence { speaker: string | null; text: string; line: number }

const TIME_RE = /\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g;

// 兼容几种常见导出格式：
// 「林晓：内容」（粘贴 / 腾讯会议）、「林晓(00:01:12)：内容」（时间戳在括号里）、
// 「林晓 00:01:12」单独一行、下一行才是内容（飞书妙记 / 钉钉听记一类）
function splitSentences(transcript: string): Sentence[] {
  const out: Sentence[] = [];
  let current: string | null = null; // 「名字 + 时间」单独一行时，后面的内容都算这个人说的
  transcript.split('\n').forEach((raw, line) => {
    const hadTime = TIME_RE.test(raw);
    TIME_RE.lastIndex = 0;
    const l = raw.replace(TIME_RE, '').replace(/[(（]\s*[)）]/g, '').trim();
    if (!l) return;
    if (hadTime && /^[\u4e00-\u9fa5A-Za-z0-9·]{1,8}$/.test(l)) { current = l; return; }
    const m = l.match(/^([^：:]{1,8})[：:]\s*(.+)$/);
    const speaker = m ? m[1].trim() : current;
    const body = m ? m[2] : l;
    for (const s of body.split(/(?<=[。！？!?；;])/)) {
      const text = s.trim();
      if (text) out.push({ speaker, text, line });
    }
  });
  return out;
}

function findOwner(s: Sentence, roster: RosterMember[]): string | null {
  const text = s.text.replace(FILLER_RE, '');
  const names = roster.flatMap((m) => [m.name, ...m.aliases]).sort((a, b) => b.length - a.length);
  const hit = names.find((n) => text.includes(n));
  if (hit) return hit;
  if (/那个谁|谁有空/.test(text)) return '那个谁';
  if (/^我|我(来|负责|去|把|先|周|下周|明天|今天|包|做|写|弄|画|上)|交给我/.test(text) && s.speaker) return s.speaker;
  return null;
}

function stripClause(text: string, owner: string | null, due: string | null): string {
  let t = text.replace(/[。！？!?；;]$/, '');
  if (owner) t = t.split(owner).join('');
  if (due) t = t.split(due).join('');
  t = t.replace(/(我|你)来(写|做|弄|画|搞)/g, ''); // 「财务部分我来写」→「财务部分」
  t = t.replace(/那个谁|你来吧|我来吧|来吧|你来|我来|负责|交给|包了|我(?!们)|你(?!们)|一定|真的|这次/g, '');
  t = t.replace(/(发|给|交)$/, '').replace(/(发|给)(，|,)/g, '$2'); // 「问卷弄完发我」去掉「我」后剩下的半截
  // 多个分句时取最长的那句当任务内容（「写建表 SQL，给大家」→「写建表 SQL」）
  const clauses = t.split(/[，,、]/).map((c) => c.replace(FILLER_RE, '').replace(/^把/, '').replace(/(吧|啊|哈|呀|了)$/, '').trim()).filter(Boolean);
  return clauses.sort((a, b) => b.length - a.length)[0] ?? '';
}

export function ruleExtract(transcript: string, roster: RosterMember[], meetingDate: string): Extraction {
  const sentences = splitSentences(transcript);
  const result: Extraction = { topics: [], decisions: [], action_items: [], disagreements: [], open_questions: [], repeated_topics: [], next_meeting: null };
  const pendingQuestions: { idx: number; text: string }[] = [];

  sentences.forEach((s, idx) => {
    const text = s.text.replace(FILLER_RE, '');
    const isQuestion = /[？?]$/.test(text);
    const due = text.match(DUE_RE)?.[0] ?? null;
    const owner = findOwner(s, roster);

    const topic = text.match(/(说一下|讨论一下|聊一下|聊聊|过一下|先说)(.{2,20}?)[。，,]?$/);
    if (topic) result.topics.push(topic[2].replace(/^(今天|一下)/, ''));

    if (!isQuestion && owner && (due || ACTION_HINT_RE.test(text))) {
      let task = stripClause(text, owner, due);
      const answersWho = /我来|你来|来吧/.test(text);
      if (task.length < 3 || answersWho) {
        // 「小雨你来吧，周五前」「我来吧，明天晚上之前发群里」：任务内容在上一句「谁来…？」里
        const prev = pendingQuestions.find((q) => idx - q.idx <= 3 && (task.length < 3 || /谁/.test(q.text)));
        if (prev) {
          task = prev.text.replace(/(谁来弄|谁来做|谁负责|谁来|谁弄|谁做|谁写|呢|吗)?[？?]$/, '').replace(/(谁来弄|谁来做|谁负责|谁来)/, '');
          pendingQuestions.splice(pendingQuestions.indexOf(prev), 1);
        }
      }
      if (task.length >= 2) {
        result.action_items.push({
          task: task.slice(0, 50), owner_raw: owner, due_raw: due, due_date: null, // 日期交给 lib/dates.ts 换算
          confidence: owner !== '那个谁' && due ? 'high' : 'low', evidence: s.text.slice(0, 40),
        });
        return;
      }
    }

    if (!isQuestion && DECISION_RE.test(text) && !OPEN_RE.test(text) && !NEXT_MEETING_RE.test(text)) {
      const clauses = text.replace(/[。！；;]$/, '').split(/[，,]/).map((c) => c.replace(FILLER_RE, '').trim());
      const body = clauses.filter((c) => !/^(就这么定了?|那就定了?|定了|就这样)$/.test(c)).sort((a, b) => b.length - a.length)[0];
      if (body && body.length >= 3) {
        // 前两句的问句（「大家同意吗？」）被这条决议回答了，不再算待定
        for (const q of pendingQuestions.filter((x) => idx - x.idx <= 2)) pendingQuestions.splice(pendingQuestions.indexOf(q), 1);
        result.decisions.push({ text: body.slice(0, 50), evidence: s.text.slice(0, 40), confidence: /定了|决定|敲定/.test(text) ? 'high' : 'low', supersedes_memory_id: null, note: null });
        return;
      }
    }

    if (isQuestion && text.length >= 4) pendingQuestions.push({ idx, text });
    else if (OPEN_RE.test(text) && pendingQuestions.some((q) => idx - q.idx <= 2)
      && (/^(这个|这事|那个|这块)/.test(text) || text.replace(OPEN_RE, '').replace(/[，,。！；;\s]|说|吧|啊|大家|想想|回头/g, '').length <= 4)) {
      // 「这个再看看」「大家想想，下次再议」指的是上一句问题，那句问题本身会进待定，这句不重复记
    }
    else if (OPEN_RE.test(text) && text.replace(OPEN_RE, '').replace(/[，,。！；;\s]|说|吧|啊/g, '').length >= 4) {
      result.open_questions.push(text.replace(/[。！；;]$/, '').slice(0, 50));
    }
  });

  // 问了但后面没人接的问题 → 待定
  result.open_questions.push(...pendingQuestions.map((q) => q.text.slice(0, 50)));

  const nm = transcript.match(NEXT_MEETING_RE);
  if (nm) result.next_meeting = parseDueDate(nm[2], meetingDate).date;
  return result;
}
