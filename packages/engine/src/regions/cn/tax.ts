/**
 * 中华人民共和国个人所得税 —— 居民个人综合所得。
 *
 * 覆盖原型页面缺失的两个真实缺陷：
 *   1. 原页面的综合所得税率表止步于 30%，缺 35% 和 45% 两档，高收入被系统性少算。
 *   2. 原页面把年终奖固定按 10% 档计税（`bonus*.10-210`），
 *      与实际的「按 奖金/12 查月度税率表」完全不同。
 *
 * 并补上原页面完全没有的两块：专项附加扣除、年终奖单独计税 vs 并入综合所得的择优。
 */

export interface TaxBracket {
  /** 该档的上界（含） */
  upTo: number;
  rate: number;
  /** 速算扣除数 */
  quickDeduction: number;
}

/** 年度综合所得税率表（个人所得税法 税率表一） */
export const COMPREHENSIVE_BRACKETS: readonly TaxBracket[] = [
  { upTo: 36_000, rate: 0.03, quickDeduction: 0 },
  { upTo: 144_000, rate: 0.1, quickDeduction: 2_520 },
  { upTo: 300_000, rate: 0.2, quickDeduction: 16_920 },
  { upTo: 420_000, rate: 0.25, quickDeduction: 31_920 },
  { upTo: 660_000, rate: 0.3, quickDeduction: 52_920 },
  { upTo: 960_000, rate: 0.35, quickDeduction: 85_920 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 181_920 },
];

/** 按月换算后的综合所得税率表，用于全年一次性奖金单独计税 */
export const MONTHLY_BRACKETS: readonly TaxBracket[] = [
  { upTo: 3_000, rate: 0.03, quickDeduction: 0 },
  { upTo: 12_000, rate: 0.1, quickDeduction: 210 },
  { upTo: 25_000, rate: 0.2, quickDeduction: 1_410 },
  { upTo: 35_000, rate: 0.25, quickDeduction: 2_660 },
  { upTo: 55_000, rate: 0.3, quickDeduction: 4_410 },
  { upTo: 80_000, rate: 0.35, quickDeduction: 7_160 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 15_160 },
];

/** 每年基本减除费用（俗称「起征点」5000/月） */
export const BASIC_DEDUCTION_ANNUAL = 60_000;

/** 专项附加扣除的法定月度标准 */
export const DEDUCTION_STANDARDS = {
  childEducationPerChild: 2_000,
  infantCarePerChild: 2_000,
  continuingEducationDegree: 400,
  /** 职业资格继续教育为取得证书当年定额 3600 元/年 */
  continuingEducationVocationalAnnual: 3_600,
  housingLoanInterest: 1_000,
  housingRent: { tier1: 1_500, tier2: 1_100, tier3: 800 },
  elderlyOnlyChild: 3_000,
  elderlySharedMax: 1_500,
} as const;

export function findBracket(brackets: readonly TaxBracket[], amount: number): TaxBracket {
  for (const b of brackets) {
    if (amount <= b.upTo) return b;
  }
  // 最后一档的 upTo 是 Infinity，这里不可达；兜底避免 noUncheckedIndexedAccess 报错
  return brackets[brackets.length - 1]!;
}

/**
 * 综合所得年度应纳税额。
 * @param taxableIncome 应纳税所得额（已扣除基本减除、专项扣除、专项附加扣除），允许为负
 */
export function comprehensiveTax(taxableIncome: number): number {
  const taxable = Math.max(0, taxableIncome);
  if (taxable === 0) return 0;
  const b = findBracket(COMPREHENSIVE_BRACKETS, taxable);
  return Math.max(0, taxable * b.rate - b.quickDeduction);
}

/**
 * 全年一次性奖金单独计税：以 奖金/12 的商数确定适用税率和速算扣除数，
 * 再用「奖金全额 × 税率 − 速算扣除数」计税。
 *
 * 这个规则制造了著名的「税收盲区」：奖金 36000 元税额 1080 元，
 * 36001 元税额骤增到 3390.1 元 —— 多发 1 元，到手少 2309 元。
 */
export function separateBonusTax(bonus: number): number {
  if (bonus <= 0) return 0;
  const b = findBracket(MONTHLY_BRACKETS, bonus / 12);
  return Math.max(0, bonus * b.rate - b.quickDeduction);
}

export interface BonusTaxChoice {
  strategy: 'separate' | 'merged';
  totalTax: number;
  separateTotal: number;
  mergedTotal: number;
  /** 择优相比另一种方式省下的税额 */
  saving: number;
}

/**
 * 年终奖计税方式择优。
 *
 * @param taxableBeforeBonus 不含年终奖的年度应纳税所得额，**允许为负**——
 *        当常规工资不足以用满各项扣除时，把奖金并入综合所得可以吸收掉这部分未用完的扣除额度，
 *        这正是低薪高奖场景下「并入」往往更划算的原因。
 * @param allowSeparate 单独计税政策是否仍然有效（现行政策延续至 2027-12-31）
 */
export function chooseBonusTaxStrategy(
  taxableBeforeBonus: number,
  bonus: number,
  allowSeparate: boolean,
): BonusTaxChoice {
  const mergedTotal = comprehensiveTax(taxableBeforeBonus + bonus);

  if (!allowSeparate || bonus <= 0) {
    return {
      strategy: 'merged',
      totalTax: mergedTotal,
      separateTotal: mergedTotal,
      mergedTotal,
      saving: 0,
    };
  }

  const separateTotal = comprehensiveTax(taxableBeforeBonus) + separateBonusTax(bonus);
  const useSeparate = separateTotal < mergedTotal;

  return {
    strategy: useSeparate ? 'separate' : 'merged',
    totalTax: useSeparate ? separateTotal : mergedTotal,
    separateTotal,
    mergedTotal,
    saving: Math.abs(separateTotal - mergedTotal),
  };
}
