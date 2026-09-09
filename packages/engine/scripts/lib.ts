/** 同步脚本的共用工具。 */

import { parse } from 'yaml';

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'personal-money-projection/data-sync' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

export async function fetchYaml<T = unknown>(url: string): Promise<T> {
  return parse(await fetchText(url)) as T;
}

/** PolicyEngine 的日期键值表：{ '2018-01-01': 0.1, '2025-01-01': 0.12 } */
export type DatedValues = Record<string, number>;

/**
 * PolicyEngine 的 YAML 里大量使用 `184_500` 这种下划线分隔的数字。
 * YAML 1.1 认这个写法，YAML 1.2（本项目解析器的默认档）不认，会解析成字符串。
 * 不处理的话，同步出来的会是字符串而不是数字，且不会报错——静默错到底。
 */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.replace(/_/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * 取某个税年生效的值：在所有不晚于该年末的生效日期中取最新的一个。
 *
 * 不能简单取 `${year}-01-01`——很多参数是年中生效的，
 * 例如加拿大 2025 年 7 月 1 日下调的联邦最低档税率，
 * 以及美国 2025 年 7 月 OBBBA 追溯调高的标准扣除。
 */
export function valueForYear(values: DatedValues, taxYear: number): number | undefined {
  const cutoff = `${taxYear}-12-31`;
  let best: { date: string; value: number } | undefined;
  for (const [date, raw] of Object.entries(values)) {
    const value = toNumber(raw);
    if (value === undefined) continue;
    if (date <= cutoff && (!best || date > best.date)) best = { date, value };
  }
  return best?.value;
}

/** 上游该参数最后一次变更的生效日期，用于判断「上游自己是不是也过期了」 */
export function latestEffectiveDate(values: DatedValues): string | undefined {
  const dates = Object.keys(values).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.length ? dates.sort().at(-1) : undefined;
}

/** 从 PolicyEngine 的嵌套节点里剥出日期键值表（有的包一层 `values`） */
export function datedValues(node: unknown): DatedValues {
  if (node && typeof node === 'object' && 'values' in node) {
    return (node as { values: DatedValues }).values;
  }
  const out: DatedValues = {};
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const n = toNumber(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && n !== undefined) out[k] = n;
    }
  }
  return out;
}

const ESC = String.fromCharCode(27);
const wrap = (code: string) => (s: string | number) => `${ESC}[${code}m${s}${ESC}[0m`;
export const red = wrap('31');
export const green = wrap('32');
export const yellow = wrap('33');
export const dim = wrap('2');
export const bold = wrap('1');

/** 比较两个数值并给出人类可读的差异行；一致则返回 null */
export function diffLine(
  label: string,
  ours: number | null | undefined,
  theirs: number | null | undefined,
  tolerance = 1e-9,
): string | null {
  // JSON 里的无穷大存成 null，回读时会变成 null 而不是 undefined，两者都要当作「无值」
  if (theirs === undefined || theirs === null) {
    return `${yellow('?')} ${label}: 上游缺失，保留本地值 ${ours ?? '—'}`;
  }
  if (ours === undefined || ours === null) return `${green('+')} ${label}: 新增 ${theirs.toLocaleString()}`;
  if (Math.abs(ours - theirs) <= tolerance) return null;
  const pct = ours === 0 ? '—' : `${(((theirs - ours) / ours) * 100).toFixed(1)}%`;
  return `${red('~')} ${label}: 本地 ${ours.toLocaleString()} → 上游 ${theirs.toLocaleString()} (${pct})`;
}
