/**
 * 主编排：把收入、支出、公积金、投资四条线合成一条逐月时间轴。
 */

import type { MonthState, ProjectionInput, ProjectionResult, YearIncome, YearPoint } from './types.js';
import { computeYearIncome, resolveSalarySchedule } from './income.js';
import { deterministicPath, netAnnualReturn, toMonthlyRate } from './invest.js';
import { getCity } from './regions/cn/cities.js';
import { computeContributions } from './regions/cn/social.js';

/** 个人年度购汇便利化额度，等值 5 万美元。超过需要额外安排换汇路径。 */
const FX_QUOTA_USD = 50_000;

export function projectTimeline(input: ProjectionInput, usdCnyRate = 7.2): ProjectionResult {
  const warnings: string[] = [];
  const city = getCity(input.city);
  const salarySchedule = resolveSalarySchedule(input);

  const years: YearIncome[] = salarySchedule.map((salary, i) => computeYearIncome(input, i + 1, salary));

  const hfMonthlyRate = toMonthlyRate(input.housingFund.annualInterestRate);
  const months: MonthState[] = [];
  const monthlyContributions: number[] = [];

  let housingFundBalance = 0;
  let cumulativeContribution = input.investment.initialCapital;
  let capReported = false;
  let deficitReported = false;
  let withdrawalCapReported = false;

  for (let y = 0; y < years.length; y++) {
    const yi = years[y]!;
    const c = computeContributions(yi.monthlySalary, city, input.overrides);
    const spend = input.expense.monthlySpend * Math.pow(1 + input.expense.annualGrowthRate, y);

    if (!capReported && (c.socialBaseCapped || c.housingFundBaseCapped)) {
      warnings.push(
        `第 ${y + 1} 年月薪 ${Math.round(yi.monthlySalary)} 元已超出${city.name}的缴费基数上限，` +
          `社保/公积金按上限封顶计算，实际到手会高于按全额缴费的估算。`,
      );
      capReported = true;
    }

    for (let m = 0; m < 12; m++) {
      const accrued = housingFundBalance * (1 + hfMonthlyRate) + c.housingFundSelf + c.housingFundEmployer;
      const requested = input.housingFund.monthlyWithdrawal;
      const actualWithdrawal = Math.min(requested, Math.max(0, accrued));

      if (!withdrawalCapReported && actualWithdrawal < requested - 1e-6) {
        warnings.push(
          `公积金账户余额不足以支撑每月提取 ${Math.round(requested)} 元，` +
            `第 ${y + 1} 年起已自动下调为账户实际可提取金额。`,
        );
        withdrawalCapReported = true;
      }
      housingFundBalance = accrued - actualWithdrawal;

      const disposable = yi.avgMonthlyNet + input.income.mealAllowance + actualWithdrawal;
      const rawSurplus = disposable - spend;

      if (!deficitReported && rawSurplus < 0) {
        warnings.push(
          `第 ${y + 1} 年的月度开销 ${Math.round(spend)} 元已超过可支配收入 ${Math.round(disposable)} 元，` +
            `该阶段没有可投资金，模型按投入 0 处理（不模拟借贷）。`,
        );
        deficitReported = true;
      }

      const surplus = Math.max(0, rawSurplus);
      const investablePool = input.housingFund.investWithdrawal
        ? surplus
        : Math.max(0, surplus - actualWithdrawal);
      const invested = investablePool * input.investment.investRatio;

      cumulativeContribution += invested;
      monthlyContributions.push(invested);

      months.push({
        month: y * 12 + m + 1,
        year: y + 1,
        grossSalary: yi.grossAnnual / 12,
        socialInsurance: c.socialTotal,
        housingFundSelf: c.housingFundSelf,
        housingFundEmployer: c.housingFundEmployer,
        incomeTax: yi.taxAnnual / 12,
        netIncome: yi.avgMonthlyNet,
        mealAllowance: input.income.mealAllowance,
        housingFundWithdrawal: actualWithdrawal,
        spend,
        invested,
        cashSurplus: surplus - invested,
        cumulativeContribution,
        housingFundBalance,
      });
    }
  }

  const realReturn = netAnnualReturn(input.investment);
  const path = deterministicPath(input.investment.initialCapital, monthlyContributions, realReturn);

  const timeline: YearPoint[] = path.values.map((value, i) => {
    const monthIdx = i * 12 - 1;
    const state = i === 0 ? undefined : months[monthIdx];
    return {
      year: i,
      contribution: path.contributions[i]!,
      value,
      realValue: value / Math.pow(1 + input.inflation.annualRate, i),
      housingFundBalance: state?.housingFundBalance ?? 0,
      cashSurplus: state?.cashSurplus ?? 0,
    };
  });

  const firstYearInvestment = monthlyContributions.slice(0, 12).reduce((a, b) => a + b, 0);
  if (firstYearInvestment > FX_QUOTA_USD * usdCnyRate) {
    warnings.push(
      `首年计划投入约 ${Math.round(firstYearInvestment)} 元，已超过个人年度购汇便利化额度` +
        `（等值 5 万美元，约 ${Math.round(FX_QUOTA_USD * usdCnyRate)} 元）。超出部分需要另行安排合规的投资路径。`,
    );
  }

  const separateYears = years.filter((y) => y.bonusTaxStrategy === 'separate').length;
  if (input.allowSeparateBonusTax && separateYears > 0 && separateYears < years.length) {
    warnings.push(
      `年终奖计税方式在不同年份的最优解不同：${separateYears} 年适合单独计税，` +
        `其余 ${years.length - separateYears} 年并入综合所得更省税。模型已逐年自动择优。`,
    );
  }

  const finalValue = path.values[path.values.length - 1] ?? 0;
  const totalContribution = path.contributions[path.contributions.length - 1] ?? 0;
  const firstYear = years[0];

  return {
    input,
    years,
    months,
    timeline,
    summary: {
      avgMonthlyNet: firstYear?.avgMonthlyNet ?? 0,
      monthlyInvestable: months[0]?.invested ?? 0,
      totalContribution,
      finalValue,
      finalValueReal: finalValue / Math.pow(1 + input.inflation.annualRate, input.investment.years),
      totalGain: finalValue - totalContribution,
      totalTaxPaid: years.reduce((sum, y) => sum + y.taxAnnual, 0),
      finalHousingFundBalance: housingFundBalance,
      netAnnualReturn: realReturn,
    },
    warnings,
  };
}
