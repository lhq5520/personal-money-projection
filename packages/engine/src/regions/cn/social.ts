/**
 * Employee-side contributions to China's "five insurances and one fund", plus the monthly total
 * of special additional deductions.
 *
 * The base floor and ceiling matter enormously to high earners: someone in Shanghai earning
 * 60,000 a month contributes on a base of 36,921, not 60,000. The prototype page skipped this
 * step and badly overstated social insurance costs for high earners.
 *
 * 中国五险一金个人缴纳额，以及专项附加扣除的月度合计。
 *
 * 缴费基数上下限对高薪影响很大：上海月薪 6 万的人，社保只按 36,921 缴，
 * 而不是按 60,000 缴——原型页面缺这一步，会显著高估高薪者的社保支出。
 */

import type { ContributionComponent, ContributionOverrides, CnSpecialDeductions } from '../../types.js';
import { clamp } from '../../tax/brackets.js';
import {
  CN_MEDICAL_RATE,
  CN_PENSION_RATE,
  baseRangeFor,
  housingFundBaseRange,
  type CityProfile,
} from './cities.js';
import { DEDUCTION_STANDARDS } from './tax.js';

export interface CnContributions {
  /**
   * Pension contribution base — what's usually meant by "the social insurance base".
   * 养老保险的缴费基数（通常意义上的「社保基数」）
   */
  socialBase: number;
  /**
   * Medical insurance contribution base. Listed separately because Guangdong cities differ from
   * the pension base.
   * 医疗保险的缴费基数。广东各市与养老基数不同，故单列
   */
  medicalBase: number;
  housingFundBase: number;
  breakdown: ContributionComponent[];
  socialTotal: number;
  housingFundSelf: number;
  housingFundEmployer: number;
  /**
   * The income tax "special deduction" = employee social insurance + employee housing fund.
   * 个税「专项扣除」= 社保个人部分 + 公积金个人部分
   */
  taxDeductible: number;
  socialBaseCapped: boolean;
  housingFundBaseCapped: boolean;
}

export function computeContributions(
  monthlySalary: number,
  city: CityProfile,
  overrides?: ContributionOverrides,
): CnContributions {
  const h = housingFundBaseRange(city);
  const hfMin = overrides?.planBaseMin ?? h.min;
  const hfMax = overrides?.planBaseMax ?? h.max;
  const housingFundBase = clamp(monthlySalary, hfMin, hfMax);

  const hfRateSelf = overrides?.planRateSelf ?? city.hfRateDefault;
  const hfRateEmployer = overrides?.planRateEmployer ?? hfRateSelf;

  const nominalRate = CN_PENSION_RATE + CN_MEDICAL_RATE + city.unemployment;
  // When the user supplies a combined social insurance rate directly, scale each insurance
  // type proportionally to its original share — for the breakdown display only.
  // 用户直接给了社保合计费率时，按各险种原有占比等比缩放，仅用于明细展示
  const scale =
    overrides?.socialRateSelf !== undefined && nominalRate > 0
      ? overrides.socialRateSelf / nominalRate
      : 1;

  /**
   * Resolve the base per insurance type. This step cannot collapse into "one social insurance
   * base": in Guangdong, pension is pooled provincially and medical municipally, and their
   * floors/ceilings differ completely (Shenzhen's pension ceiling is 27,549, medical 33,633).
   * A single unified base would give the wrong answer.
   *
   * socialBaseMin/Max in `overrides` is a global override and applies to all three types at once.
   *
   * 逐险种取基数。这一步不能合并成「一个社保基数」——
   * 广东各市的养老按省级统筹、医疗按市级统筹，两者上下限完全不同
   * （深圳养老上限 27,549，医保上限 33,633）。用统一基数会算错。
   *
   * overrides 里的 socialBaseMin/Max 是全局覆盖，会同时作用于三个险种。
   */
  const item = (kind: 'pension' | 'medical' | 'unemployment', rate: number) => {
    const r = baseRangeFor(city, kind);
    const min = overrides?.socialBaseMin ?? r.min;
    const max = overrides?.socialBaseMax ?? r.max;
    const base = clamp(monthlySalary, min, max);
    return { base, amount: base * rate * scale, capped: monthlySalary > max };
  };

  const pension = item('pension', CN_PENSION_RATE);
  const medical = item('medical', CN_MEDICAL_RATE);
  const unemployment = item('unemployment', city.unemployment);

  const breakdown: ContributionComponent[] = [
    { code: 'cn-pension', amount: pension.amount, capped: pension.capped },
    { code: 'cn-medical', amount: medical.amount, capped: medical.capped },
    { code: 'cn-unemployment', amount: unemployment.amount, capped: unemployment.capped },
  ];

  const socialTotal = breakdown.reduce((sum, b) => sum + b.amount, 0);
  const housingFundSelf = housingFundBase * hfRateSelf;
  const housingFundEmployer = housingFundBase * hfRateEmployer;

  return {
    // The pension base is what's usually meant by "the social insurance base"; the breakdown
    // carries the per-type figures.
    // 养老基数是通常意义上的「社保基数」，明细里另有逐险种数据
    socialBase: pension.base,
    medicalBase: medical.base,
    housingFundBase,
    breakdown,
    socialTotal,
    housingFundSelf,
    housingFundEmployer,
    taxDeductible: socialTotal + housingFundSelf,
    socialBaseCapped: pension.capped || medical.capped || unemployment.capped,
    housingFundBaseCapped: monthlySalary > hfMax,
  };
}

/**
 * Monthly total of the special additional deductions.
 *
 * Mortgage interest and housing rent **cannot both be claimed**; the mutually exclusive
 * `housingType` enforces that at the type level. Major-illness medical expenses must be claimed
 * against actuals at annual reconciliation — the amount is unpredictable, so it isn't modeled
 * in a long-horizon projection.
 *
 * 专项附加扣除的月度合计。
 *
 * 住房贷款利息与住房租金**不能同时享受**，由互斥的 housingType 在类型层面保证。
 * 大病医疗须在年度汇算时据实申报，金额不可预知，长期预测中不建模。
 */
export function monthlySpecialDeduction(d: CnSpecialDeductions, city: CityProfile): number {
  let total = 0;

  total += d.childrenCount * DEDUCTION_STANDARDS.childEducationPerChild;
  total += d.infantCount * DEDUCTION_STANDARDS.infantCarePerChild;

  if (d.continuingEducation === 'degree') {
    total += DEDUCTION_STANDARDS.continuingEducationDegree;
  } else if (d.continuingEducation === 'vocational') {
    total += DEDUCTION_STANDARDS.continuingEducationVocationalAnnual / 12;
  }

  if (d.housingType === 'loan') {
    total += DEDUCTION_STANDARDS.housingLoanInterest;
  } else if (d.housingType === 'rent') {
    total += DEDUCTION_STANDARDS.housingRent[d.rentTier ?? city.rentTier];
  }

  if (d.elderlyCare === 'only-child') {
    total += DEDUCTION_STANDARDS.elderlyOnlyChild;
  } else if (d.elderlyCare === 'shared') {
    total += Math.min(d.elderlyShareAmount ?? 0, DEDUCTION_STANDARDS.elderlySharedMax);
  }

  return total;
}
