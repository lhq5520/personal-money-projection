/**
 * 收入时间轴：把「一个月薪数字」展开成逐年的税前 → 五险一金 → 个税 → 到手。
 *
 * 原型页面把工资视为 40 年恒定，这是它最大的结构性失真之一：
 * 一个 25 岁月薪 1.5 万的人，40 年后月薪仍是 1.5 万，等于假设终身零涨薪且零通胀补偿。
 */

import type { ProjectionInput, YearIncome } from './types.js';
import { getCity } from './regions/cn/cities.js';
import { computeContributions, monthlySpecialDeduction } from './regions/cn/social.js';
import { BASIC_DEDUCTION_ANNUAL, chooseBonusTaxStrategy } from './regions/cn/tax.js';

/**
 * 逐年解析月薪。
 * salarySteps 中显式指定的年份直接覆盖当年月薪，其余年份在上一年基础上按 annualGrowthRate 增长。
 */
export function resolveSalarySchedule(input: ProjectionInput): number[] {
  const { income, investment } = input;
  const stepByYear = new Map(income.salarySteps.map((s) => [s.atYear, s.newMonthlySalary]));
  const schedule: number[] = [];

  let current = income.monthlySalary;
  for (let year = 1; year <= investment.years; year++) {
    if (year > 1) current *= 1 + income.annualGrowthRate;
    const override = stepByYear.get(year);
    if (override !== undefined) current = override;
    schedule.push(current);
  }
  return schedule;
}

export function computeYearIncome(input: ProjectionInput, year: number, monthlySalary: number): YearIncome {
  const city = getCity(input.city);
  const c = computeContributions(monthlySalary, city, input.overrides);

  const regularAnnual = monthlySalary * 12;
  const bonus = monthlySalary * Math.max(0, input.income.salaryMonths - 12);
  const grossAnnual = regularAnnual + bonus;

  const socialInsuranceAnnual = c.socialTotal * 12;
  const housingFundSelfAnnual = c.housingFundSelf * 12;
  const housingFundEmployerAnnual = c.housingFundEmployer * 12;
  const specialDeductionAnnual = monthlySpecialDeduction(input.income.deductions, city) * 12;

  // 可能为负：常规工资不足以用满全部扣除时，未用完的额度可被年终奖吸收
  const taxableBeforeBonus =
    regularAnnual - c.taxDeductible * 12 - specialDeductionAnnual - BASIC_DEDUCTION_ANNUAL;

  const choice = chooseBonusTaxStrategy(taxableBeforeBonus, bonus, input.allowSeparateBonusTax);

  // 公积金个人部分从工资扣除，但进入你自己的账户，不算消失的钱，
  // 所以它不计入「到手现金」，而是单独在公积金余额里累计。
  const netAnnual = grossAnnual - socialInsuranceAnnual - housingFundSelfAnnual - choice.totalTax;

  return {
    year,
    monthlySalary,
    grossAnnual,
    bonus,
    socialInsuranceAnnual,
    housingFundSelfAnnual,
    housingFundEmployerAnnual,
    specialDeductionAnnual,
    taxAnnual: choice.totalTax,
    bonusTaxStrategy: choice.strategy,
    bonusTaxSaving: choice.saving,
    netAnnual,
    avgMonthlyNet: netAnnual / 12,
    effectiveTaxRate: grossAnnual > 0 ? choice.totalTax / grossAnnual : 0,
  };
}
