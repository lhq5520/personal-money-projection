/**
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
  housingFundBaseRange,
  socialBaseRange,
  type CityProfile,
} from './cities.js';
import { DEDUCTION_STANDARDS } from './tax.js';

export interface CnContributions {
  socialBase: number;
  housingFundBase: number;
  breakdown: ContributionComponent[];
  socialTotal: number;
  housingFundSelf: number;
  housingFundEmployer: number;
  /** 个税「专项扣除」= 社保个人部分 + 公积金个人部分 */
  taxDeductible: number;
  socialBaseCapped: boolean;
  housingFundBaseCapped: boolean;
}

export function computeContributions(
  monthlySalary: number,
  city: CityProfile,
  overrides?: ContributionOverrides,
): CnContributions {
  const s = socialBaseRange(city);
  const h = housingFundBaseRange(city);

  const socialMin = overrides?.socialBaseMin ?? s.min;
  const socialMax = overrides?.socialBaseMax ?? s.max;
  const hfMin = overrides?.planBaseMin ?? h.min;
  const hfMax = overrides?.planBaseMax ?? h.max;

  const socialBase = clamp(monthlySalary, socialMin, socialMax);
  const housingFundBase = clamp(monthlySalary, hfMin, hfMax);

  const hfRateSelf = overrides?.planRateSelf ?? city.hfRateDefault;
  const hfRateEmployer = overrides?.planRateEmployer ?? hfRateSelf;

  const nominalRate = CN_PENSION_RATE + CN_MEDICAL_RATE + city.unemployment;
  // 用户直接给了社保合计费率时，按各险种原有占比拆分，仅用于明细展示
  const scale = overrides?.socialRateSelf !== undefined && nominalRate > 0
    ? overrides.socialRateSelf / nominalRate
    : 1;

  const socialBaseCapped = monthlySalary > socialMax;
  const breakdown: ContributionComponent[] = [
    { code: 'cn-pension', amount: socialBase * CN_PENSION_RATE * scale, capped: socialBaseCapped },
    { code: 'cn-medical', amount: socialBase * CN_MEDICAL_RATE * scale, capped: socialBaseCapped },
    { code: 'cn-unemployment', amount: socialBase * city.unemployment * scale, capped: socialBaseCapped },
  ];

  const socialTotal = breakdown.reduce((sum, b) => sum + b.amount, 0);
  const housingFundSelf = housingFundBase * hfRateSelf;
  const housingFundEmployer = housingFundBase * hfRateEmployer;

  return {
    socialBase,
    housingFundBase,
    breakdown,
    socialTotal,
    housingFundSelf,
    housingFundEmployer,
    taxDeductible: socialTotal + housingFundSelf,
    socialBaseCapped,
    housingFundBaseCapped: monthlySalary > hfMax,
  };
}

/**
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
