/**
 * 五险一金个人缴纳额，以及专项附加扣除的月度合计。
 *
 * 相比原型页面的改进：原页面把社保写死为月薪的 10.5%、公积金写死为 12%，
 * 且完全不考虑缴费基数上下限。基数封顶对高薪影响很大——
 * 上海月薪 6 万的人，社保只按 36921 缴，而不是按 60000 缴。
 */

import type { ContributionOverrides, SpecialDeductions } from '../../types.js';
import type { CityProfile } from './cities.js';
import { DEDUCTION_STANDARDS } from './tax.js';

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export interface Contributions {
  /** 实际适用的社保缴费基数（已封顶/保底） */
  socialBase: number;
  /** 实际适用的公积金缴存基数 */
  housingFundBase: number;
  pension: number;
  medical: number;
  unemployment: number;
  /** 社保个人合计（养老+医疗+失业） */
  socialTotal: number;
  housingFundSelf: number;
  housingFundEmployer: number;
  /** 个税「专项扣除」= 社保个人部分 + 公积金个人部分 */
  taxDeductible: number;
  /** 月薪是否触及基数上限，用于给用户提示 */
  socialBaseCapped: boolean;
  housingFundBaseCapped: boolean;
}

export function computeContributions(
  monthlySalary: number,
  city: CityProfile,
  overrides?: ContributionOverrides,
): Contributions {
  const socialMin = overrides?.socialBaseMin ?? city.social.baseMin;
  const socialMax = overrides?.socialBaseMax ?? city.social.baseMax;
  const hfMin = overrides?.housingFundBaseMin ?? city.housingFund.baseMin;
  const hfMax = overrides?.housingFundBaseMax ?? city.housingFund.baseMax;

  const socialBase = clamp(monthlySalary, socialMin, socialMax);
  const housingFundBase = clamp(monthlySalary, hfMin, hfMax);

  const hfRateSelf = overrides?.housingFundRateSelf ?? city.housingFund.rateDefault;
  const hfRateEmployer = overrides?.housingFundRateEmployer ?? hfRateSelf;

  let pension: number;
  let medical: number;
  let unemployment: number;

  if (overrides?.socialRateSelf !== undefined) {
    // 用户直接给了社保合计费率时，按各险种原有占比拆分，仅用于明细展示
    const nominal = city.social.pension + city.social.medical + city.social.unemployment;
    const scale = nominal > 0 ? overrides.socialRateSelf / nominal : 0;
    pension = socialBase * city.social.pension * scale;
    medical = socialBase * city.social.medical * scale;
    unemployment = socialBase * city.social.unemployment * scale;
  } else {
    pension = socialBase * city.social.pension;
    medical = socialBase * city.social.medical;
    unemployment = socialBase * city.social.unemployment;
  }

  const socialTotal = pension + medical + unemployment;
  const housingFundSelf = housingFundBase * hfRateSelf;
  const housingFundEmployer = housingFundBase * hfRateEmployer;

  return {
    socialBase,
    housingFundBase,
    pension,
    medical,
    unemployment,
    socialTotal,
    housingFundSelf,
    housingFundEmployer,
    taxDeductible: socialTotal + housingFundSelf,
    socialBaseCapped: monthlySalary > socialMax,
    housingFundBaseCapped: monthlySalary > hfMax,
  };
}

/**
 * 专项附加扣除的月度合计。
 *
 * 注意：住房贷款利息与住房租金两项**不能同时享受**，类型上用互斥的 housingType 保证。
 * 大病医疗需在年度汇算时据实申报，金额不可预知，长期预测中不建模。
 */
export function monthlySpecialDeduction(d: SpecialDeductions, city: CityProfile): number {
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
