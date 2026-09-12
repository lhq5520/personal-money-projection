/** 中国地区模块。 */

import type { ProjectionInput, TaxComponent, YearIncome } from '../../types.js';
import type { RegionModule } from '../types.js';
import { CN_JURISDICTIONS, DEFAULT_CITY, cityProvenance, getCity } from './cities.js';
import { computeContributions, monthlySpecialDeduction } from './social.js';
import { BASIC_DEDUCTION_ANNUAL, chooseBonusTaxStrategy } from './tax.js';

function computeYear(input: ProjectionInput, year: number, monthlySalary: number): YearIncome {
  const city = getCity(input.jurisdiction);
  const c = computeContributions(monthlySalary, city, input.overrides);

  const regularAnnual = monthlySalary * 12;
  const bonus = monthlySalary * Math.max(0, input.income.salaryMonths - 12);
  const grossAnnual = regularAnnual + bonus;

  const socialInsuranceAnnual = c.socialTotal * 12;
  const planSelfAnnual = c.housingFundSelf * 12;
  const planEmployerAnnual = c.housingFundEmployer * 12;
  const specialDeductionAnnual = monthlySpecialDeduction(input.cn.deductions, city) * 12;
  const deductionAnnual = c.taxDeductible * 12 + specialDeductionAnnual + BASIC_DEDUCTION_ANNUAL;

  // 可能为负：常规工资不足以用满全部扣除时，未用完的额度可被年终奖吸收
  const taxableBeforeBonus = regularAnnual - deductionAnnual;
  const choice = chooseBonusTaxStrategy(taxableBeforeBonus, bonus, input.cn.allowSeparateBonusTax);

  const taxBreakdown: TaxComponent[] =
    choice.strategy === 'separate'
      ? [
          { code: 'national', amount: choice.totalTax - choice.bonusTax },
          { code: 'bonus', amount: choice.bonusTax },
        ]
      : [{ code: 'national', amount: choice.totalTax }];

  // 公积金个人部分从工资扣除，但进入你自己的账户，不算消失的钱，
  // 所以不计入「到手现金」，而是单独在账户余额里累计。
  const netAnnual = grossAnnual - socialInsuranceAnnual - planSelfAnnual - choice.totalTax;

  return {
    year,
    monthlySalary,
    grossAnnual,
    bonus,
    socialInsuranceAnnual,
    socialBreakdown: c.breakdown.map((b) => ({ ...b, amount: b.amount * 12 })),
    planCode: 'cn-housing-fund',
    planSelfAnnual,
    planEmployerAnnual,
    deductionAnnual,
    taxableAnnual: Math.max(0, choice.strategy === 'merged' ? taxableBeforeBonus + bonus : taxableBeforeBonus),
    taxAnnual: choice.totalTax,
    taxBreakdown,
    bonusTaxStrategy: choice.strategy,
    bonusTaxSaving: choice.saving,
    netAnnual,
    avgMonthlyNet: netAnnual / 12,
    effectiveTaxRate: grossAnnual > 0 ? choice.totalTax / grossAnnual : 0,
    totalBurdenRate:
      grossAnnual > 0 ? (choice.totalTax + socialInsuranceAnnual) / grossAnnual : 0,
  };
}

export const CN_REGION: RegionModule = {
  code: 'CN',
  currency: 'CNY',
  currencySymbol: '¥',
  numberLocale: 'zh-CN',
  planCode: 'cn-housing-fund',
  planGrowth: 'fixed-interest',
  planWithdrawable: true,
  taxYear: 2025,
  jurisdictions: CN_JURISDICTIONS,
  defaultJurisdiction: DEFAULT_CITY,
  computeYear,
  provenanceFor: (jurisdiction) => cityProvenance(getCity(jurisdiction)),
};
