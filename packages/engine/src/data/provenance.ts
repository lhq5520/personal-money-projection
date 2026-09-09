/**
 * 数据出处与时效。
 *
 * 税率和缴费基数不是常量，是有有效期的法规快照。把出处、生效期、核对状态
 * 和数值绑在一起，才能诚实地回答「这个数字现在还对吗」——
 * 而不是让用户对着一个来源不明、可能过期两年的数字做十年期的财务决策。
 */

/** 数据可信度。UI 必须把 estimated 与 verified 区别对待。 */
export type Confidence =
  /** 已对照官方公告逐项核对 */
  | 'verified'
  /** 由已核对的驱动值按法定规则推导（如社保基数 = 社平工资 × 60%/300%） */
  | 'derived'
  /** 近似值，仅保证量级正确，使用前必须自行核对 */
  | 'estimated';

export interface Provenance {
  /** 适用期起点（含），ISO 日期 */
  effectiveFrom: string;
  /**
   * 适用期终点（含）。中国社保年度为 7 月 1 日至次年 6 月 30 日；
   * 美加的税率表按自然年。留空表示「至下次公告为止」。
   */
  effectiveTo?: string;
  /** 官方公告或权威来源的 URL */
  sourceUrl?: string;
  /** 最后一次核对的日期 */
  verifiedAt: string;
  confidence: Confidence;
  /** 补充说明，例如「深圳养老与医疗分别定基数」 */
  note?: string;
}

export interface DataFreshness {
  /** 数据是否已过适用期 */
  expired: boolean;
  /** 距离适用期结束的天数；已过期为负 */
  daysRemaining: number | null;
  confidence: Confidence;
  provenance: Provenance;
}

const DAY = 86_400_000;

/**
 * 判断一份数据在给定时点是否仍然适用。
 *
 * @param now 注入而非直接读 Date.now()，否则测试无法复现，
 *            且引擎会因为「今天是几号」而变成非纯函数。
 */
export function checkFreshness(p: Provenance, now: Date): DataFreshness {
  if (!p.effectiveTo) {
    return { expired: false, daysRemaining: null, confidence: p.confidence, provenance: p };
  }
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
 * 中国社保年度的适用期：每年 7 月 1 日至次年 6 月 30 日。
 * @param startYear 社保年度的起始自然年
 */
export function cnSocialYear(startYear: number): { effectiveFrom: string; effectiveTo: string } {
  return {
    effectiveFrom: `${startYear}-07-01`,
    effectiveTo: `${startYear + 1}-06-30`,
  };
}

/** 自然年适用期，用于美加的税率表 */
export function calendarYear(year: number): { effectiveFrom: string; effectiveTo: string } {
  return { effectiveFrom: `${year}-01-01`, effectiveTo: `${year}-12-31` };
}
