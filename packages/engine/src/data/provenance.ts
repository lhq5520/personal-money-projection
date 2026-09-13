/**
 * Data provenance and freshness.
 *
 * Tax rates and contribution bases are not constants — they are snapshots of regulation with
 * an expiry date. Binding the source, effective period, and verification status to the value
 * itself is the only way to answer "is this number still correct?" honestly, instead of
 * letting someone make a ten-year financial decision against an unattributed figure that may
 * be two years out of date.
 *
 * 数据出处与时效。
 *
 * 税率和缴费基数不是常量，是有有效期的法规快照。把出处、生效期、核对状态
 * 和数值绑在一起，才能诚实地回答「这个数字现在还对吗」——
 * 而不是让用户对着一个来源不明、可能过期两年的数字做十年期的财务决策。
 */

/**
 * Confidence in the data. The UI must treat `estimated` differently from `verified`.
 * 数据可信度。UI 必须把 estimated 与 verified 区别对待。
 */
export type Confidence =
  /** Checked item by item against the official notice. 已对照官方公告逐项核对 */
  | 'verified'
  /**
   * Derived from verified driver values by statutory rule — e.g. social insurance base =
   * average wage × 60%/300%.
   * 由已核对的驱动值按法定规则推导（如社保基数 = 社平工资 × 60%/300%）
   */
  | 'derived'
  /**
   * An approximation: only the order of magnitude is guaranteed, verify before relying on it.
   * 近似值，仅保证量级正确，使用前必须自行核对
   */
  | 'estimated';

export interface Provenance {
  /** Start of the effective period, inclusive, as an ISO date. 适用期起点（含），ISO 日期 */
  effectiveFrom: string;
  /**
   * End of the effective period, inclusive. China's social insurance year runs July 1 to
   * June 30 of the following year; US and Canadian bracket tables follow the calendar year.
   * Leave unset to mean "until the next notice".
   *
   * 适用期终点（含）。中国社保年度为 7 月 1 日至次年 6 月 30 日；
   * 美加的税率表按自然年。留空表示「至下次公告为止」。
   */
  effectiveTo?: string;
  /** URL of the official notice or authoritative source. 官方公告或权威来源的 URL */
  sourceUrl?: string;
  /** Date this was last verified. 最后一次核对的日期 */
  verifiedAt: string;
  confidence: Confidence;
  /**
   * Free-form note, e.g. "Shenzhen sets separate bases for pension and medical".
   * 补充说明，例如「深圳养老与医疗分别定基数」
   */
  note?: string;
}

export interface DataFreshness {
  /** Whether the data is past its effective period. 数据是否已过适用期 */
  expired: boolean;
  /** Days until the effective period ends; negative once expired. 距离适用期结束的天数；已过期为负 */
  daysRemaining: number | null;
  confidence: Confidence;
  provenance: Provenance;
}

const DAY = 86_400_000;

/**
 * Decide whether a dataset still applies at a given point in time.
 * 判断一份数据在给定时点是否仍然适用。
 *
 * @param now Injected rather than read from Date.now(), or tests would not be reproducible and
 *            the engine would stop being a pure function the moment the date changed.
 *            注入而非直接读 Date.now()，否则测试无法复现，
 *            且引擎会因为「今天是几号」而变成非纯函数。
 */
export function checkFreshness(p: Provenance, now: Date): DataFreshness {
  if (!p.effectiveTo) {
    return { expired: false, daysRemaining: null, confidence: p.confidence, provenance: p };
  }
  // The end of the effective period is inclusive, so compare against end of that day.
  // 适用期终点为「含当日」，故比较到当天结束
  const end = Date.parse(`${p.effectiveTo}T23:59:59Z`);
  const daysRemaining = Math.floor((end - now.getTime()) / DAY);
  return {
    expired: daysRemaining < 0,
    daysRemaining,
    confidence: p.confidence,
    provenance: p,
  };
}

/**
 * The effective period of a Chinese social insurance year: July 1 through June 30 of the
 * following year.
 * 中国社保年度的适用期：每年 7 月 1 日至次年 6 月 30 日。
 *
 * @param startYear The calendar year the social insurance year starts in.
 *                  社保年度的起始自然年
 */
export function cnSocialYear(startYear: number): { effectiveFrom: string; effectiveTo: string } {
  return {
    effectiveFrom: `${startYear}-07-01`,
    effectiveTo: `${startYear + 1}-06-30`,
  };
}

/**
 * A calendar-year effective period, used by the US and Canadian bracket tables.
 * 自然年适用期，用于美加的税率表
 */
export function calendarYear(year: number): { effectiveFrom: string; effectiveTo: string } {
  return { effectiveFrom: `${year}-01-01`, effectiveTo: `${year}-12-31` };
}
