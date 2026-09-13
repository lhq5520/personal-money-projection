/**
 * Display formatting for amounts and rates.
 *
 * The currency symbol and digit grouping follow the region (¥ / $ / C$); the compact notation
 * follows the language (Chinese uses 万/亿, English uses K/M/B). The two are orthogonal: a user
 * in China can read the English UI while working in CNY.
 *
 * 金额与比率的展示格式。
 *
 * 货币符号与数字分组由地区决定（¥ / $ / C$），紧凑写法由语言决定
 * （中文用万/亿，英文用 K/M/B）——两者是正交的：一个中国用户可以用英文界面看人民币。
 */

import type { RegionModule } from '@pmp/engine';
import type { Lang } from '../i18n/index.js';

export interface Formatter {
  /** Full amount with currency symbol. 带货币符号的完整金额 */
  money(n: number): string;
  /**
   * A bare grouped number, for amounts already in the thousands where abbreviating would lose
   * precision.
   * 带千分位的裸数字，用于金额本身就在千元量级、缩写反而丢精度的场合
   */
  plain(n: number): string;
  /** Compact notation for axis labels. 坐标轴用的紧凑写法 */
  compact(n: number): string;
  percent(r: number, digits?: number): string;
}

export function makeFormatter(region: RegionModule, lang: Lang): Formatter {
  const locale = region.numberLocale;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const sym = region.currencySymbol;

  const compactZh = (n: number): string => {
    const abs = Math.abs(n);
    if (abs >= 1e8) return `${nf1.format(n / 1e8)}亿`;
    if (abs >= 1e7) return `${nf.format(n / 1e4)}万`;
    // Keep one decimal at the 万 scale: otherwise 18,250 and 15,003 both render as "2万", which
    // misleads on a chart where adjacent bars are close in height.
    // 万位保留一位小数：否则 18250 和 15003 会同时显示成「2万」，在相邻柱高度接近的图里会误导
    if (abs >= 1e4) return `${nf1.format(n / 1e4)}万`;
    return nf.format(n);
  };

  const compactEn = (n: number): string => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${nf1.format(n / 1e9)}B`;
    if (abs >= 1e6) return `${nf1.format(n / 1e6)}M`;
    if (abs >= 1e4) return `${nf.format(n / 1e3)}K`;
    return nf.format(n);
  };

  return {
    money: (n) => `${sym}${nf.format(Math.round(n))}`,
    plain: (n) => nf.format(Math.round(n)),
    compact: lang === 'zh' ? compactZh : compactEn,
    percent: (r, digits = 1) => `${(r * 100).toFixed(digits)}%`,
  };
}

/**
 * Generate "nice" axis ticks, with a step of 1/2/2.5/5 × 10ⁿ.
 * Charts should align the top of their range to the last tick, so the axis never shows an
 * arbitrary number like 6,083.
 *
 * 生成「好看」的坐标轴刻度（步长为 1/2/2.5/5 × 10ⁿ）。
 * 图表应把量程顶端对齐到最后一个刻度，这样轴上不会出现 6,083 这种随机数字。
 */
export function niceTicks(max: number, count = 5): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  // Must round up to the tick that covers max: the caller aligns the top of the range to the last
  // tick, and if that tick sits below max, anything above it — the top of the P90 band, say —
  // gets clipped.
  // 必须向上取整到覆盖 max 的那一格：调用方会把量程顶端对齐到最后一个刻度，
  // 若最后一个刻度低于 max，超出的图元（比如 P90 色带顶部）会被裁掉。
  const steps = Math.max(1, Math.ceil(max / step - 1e-9));
  return Array.from({ length: steps + 1 }, (_, i) => Number((i * step).toFixed(6)));
}
