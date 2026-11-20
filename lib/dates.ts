// 把「下周三前」「周五之前」「11月20号」「三天后」「月底」这类原话换算为 YYYY-MM-DD（以会议日期为基准，确定性代码）

const WEEKDAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export const SEMESTER_DAYS = 120;

function cnNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === '十') return 10;
  if (s.length === 2 && s[0] === '十') return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.length === 2 && s[1] === '十') return (CN_NUM[s[0]] ?? 0) * 10;
  return CN_NUM[s] ?? null;
}

export function parseDueDate(dueRaw: string | null | undefined, meetingDate: string): { date: string | null; valid: boolean } {
  if (!dueRaw) return { date: null, valid: true };
  const base = new Date(meetingDate + 'T00:00:00');
  const text = dueRaw.trim();

  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return check(`${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`);

  const cn = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (cn) {
    // 11 月开会说「1 月 5 号」= 明年 1 月
    let year = base.getFullYear();
    if (new Date(`${year}-${pad(cn[1])}-${pad(cn[2])}T00:00:00`).getTime() < base.getTime() - 60 * 86400000) year += 1;
    return check(`${year}-${pad(cn[1])}-${pad(cn[2])}`);
  }

  if (/今天|今晚/.test(text)) return check(fmt(base));
  if (/明天|明晚/.test(text)) return check(fmt(addDays(base, 1)));
  if (/后天/.test(text)) return check(fmt(addDays(base, 2)));

  const nDays = text.match(/([\d一两二三四五六七八九十]+)\s*天/);
  if (nDays && cnNumber(nDays[1]) !== null) return check(fmt(addDays(base, cnNumber(nDays[1])!)));

  if (/月底/.test(text)) return check(fmt(new Date(base.getFullYear(), base.getMonth() + 1, 0)));

  // 周末 = 本周日；下周末 = 下周日
  const weekend = text.match(/(下下|下|本|这)?\s*(?:周末|礼拜天前|星期天前)/);
  if (weekend && /周末/.test(text)) {
    const baseDow = base.getDay() === 0 ? 7 : base.getDay();
    let delta = 7 - baseDow;
    if (weekend[1] === '下') delta += 7;
    else if (weekend[1] === '下下') delta += 14;
    return check(fmt(addDays(base, delta)));
  }

  const week = text.match(/(下下|下|本|这)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
  if (week) {
    const target = WEEKDAY[week[2]];
    const baseDow = base.getDay() === 0 ? 7 : base.getDay();
    let delta = target - baseDow;
    if (week[1] === '下') delta += 7;
    else if (week[1] === '下下') delta += 14;
    else if (delta <= 0) delta += 7; // 本周五但今天已过周五 → 下个周五
    return check(fmt(addDays(base, delta)));
  }

  return { date: null, valid: false };

  function check(date: string) {
    return { date, valid: inSemester(date, meetingDate) };
  }
}

// 学期内校验：会议当天 ~ +120 天
export function inSemester(date: string, meetingDate: string): boolean {
  const diff = (new Date(date + 'T00:00:00').getTime() - new Date(meetingDate + 'T00:00:00').getTime()) / 86400000;
  return diff >= 0 && diff <= SEMESTER_DAYS;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(String(d.getMonth() + 1))}-${pad(String(d.getDate()))}`;
}

function pad(s: string): string {
  return s.padStart(2, '0');
}
