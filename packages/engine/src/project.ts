/**
 * 主编排：把收入、支出、雇主储蓄计划、投资四条线合成一条逐月时间轴。
 *
 * 这一层与国别无关——所有税务差异都在 regions/* 里解决。
 * 警告以结构化的 code + 参数产出，由 UI 层翻译，引擎不产出自然语言。
 */

import type {
  MonthState,
  ProjectionInput,
  ProjectionResult,
  ProjectionWarning,
  YearIncome,
  YearPoint,
} from './types.js';
import { computeYearIncome, resolveSalarySchedule } from './income.js';
import { deterministicPath, netAnnualReturn, toMonthlyRate } from './invest.js';
import { getRegion } from './regions/registry.js';
import { checkFreshness } from './data/provenance.js';

/** 中国个人年度购汇便利化额度，等值 5 万美元 */
const FX_QUOTA_USD = 50_000;

export function projectTimeline(
  input: ProjectionInput,
  usdCnyRate = 7.2,
  /**
   * 注入「现在」而不是读 Date.now()：引擎必须是纯函数，
   * 否则同样的输入会因为今天几号而给出不同的警告，测试也无从复现。
   */
  now: Date = new Date(),
): ProjectionResult {
  const warnings: ProjectionWarning[] = [];
  const region = getRegion(input.region);

  // 数据时效检查放在最前面：拿两年前的缴费基数做十年期规划，
  // 比任何计算细节的偏差都更容易让人得出错误结论。
  const provenance = region.provenanceFor(input.jurisdiction);
  const freshness = checkFreshness(provenance, now);
  if (freshness.expired) {
    warnings.push({
      code: 'data-expired',
      params: {
        jurisdiction: input.jurisdiction,
        effectiveTo: provenance.effectiveTo ?? '',
        daysAgo: Math.abs(freshness.daysRemaining ?? 0),
      },
    });
  }
  if (provenance.confidence === 'estimated') {
    warnings.push({
      code: 'data-unverified',
      params: { jurisdiction: input.jurisdiction, note: provenance.note ?? '' },
    });
  }
  const salarySchedule = resolveSalarySchedule(input);

  const years: YearIncome[] = salarySchedule.map((salary, i) => computeYearIncome(input, i + 1, salary));
  const realReturn = netAnnualReturn(input.investment);

  // 中国公积金按固定利率结息；401(k) / RRSP 是市场投资账户，跟随投资收益增长
  const planAnnualRate =
    region.planGrowth === 'market' ? realReturn : input.employerPlan.annualInterestRate;
  const planMonthlyRate = toMonthlyRate(planAnnualRate);

  const months: MonthState[] = [];
  const monthlyContributions: number[] = [];

  let planBalance = 0;
  let cumulativeContribution = input.investment.initialCapital;
  let capReported = false;
  let deficitReported = false;
  let withdrawalCapReported = false;
  let planLimitReported = false;

  for (let y = 0; y < years.length; y++) {
    const yi = years[y]!;
    const spend = input.expense.monthlySpend * Math.pow(1 + input.expense.annualGrowthRate, y);

    const cappedItem = yi.socialBreakdown.find((b) => b.capped);
    if (!capReported && cappedItem) {
      warnings.push({
        code: 'contribution-base-capped',
        params: { year: y + 1, salary: Math.round(yi.monthlySalary), item: cappedItem.code },
      });
      capReported = true;
    }

    if (!planLimitReported && region.planAnnualLimit !== undefined) {
      // 触及法定上限时，实际缴款会低于按比例应缴的金额
      const uncapped =
        input.region === 'US'
          ? yi.grossAnnual * input.us.pretaxRetirementRate
          : yi.grossAnnual * input.ca.rrspRate;
      if (uncapped > yi.planSelfAnnual + 1e-6) {
        warnings.push({
          code: 'plan-contribution-capped',
          params: {
            year: y + 1,
            plan: yi.planCode,
            limit: Math.round(region.planAnnualLimit),
            requested: Math.round(uncapped),
          },
        });
        planLimitReported = true;
      }
    }

    const planSelfMonthly = yi.planSelfAnnual / 12;
    const planEmployerMonthly = yi.planEmployerAnnual / 12;
    const socialMonthly = yi.socialInsuranceAnnual / 12;

    for (let m = 0; m < 12; m++) {
      const accrued = planBalance * (1 + planMonthlyRate) + planSelfMonthly + planEmployerMonthly;
      // 只有中国公积金支持提取；401(k) / RRSP 在退休前提取有罚则，模型不支持
      const requested = region.planWithdrawable ? input.employerPlan.monthlyWithdrawal : 0;
      const actualWithdrawal = Math.min(requested, Math.max(0, accrued));

      if (!withdrawalCapReported && actualWithdrawal < requested - 1e-6) {
        warnings.push({
          code: 'plan-balance-insufficient',
          params: { year: y + 1, requested: Math.round(requested) },
        });
        withdrawalCapReported = true;
      }
      planBalance = accrued - actualWithdrawal;

      const disposable = yi.avgMonthlyNet + input.income.taxFreeAllowance + actualWithdrawal;
      const rawSurplus = disposable - spend;

      if (!deficitReported && rawSurplus < 0) {
        warnings.push({
          code: 'cash-flow-deficit',
          params: { year: y + 1, spend: Math.round(spend), disposable: Math.round(disposable) },
        });
        deficitReported = true;
      }

      const surplus = Math.max(0, rawSurplus);
      const investablePool = input.employerPlan.investWithdrawal
        ? surplus
        : Math.max(0, surplus - actualWithdrawal);
      const invested = investablePool * input.investment.investRatio;

      cumulativeContribution += invested;
      monthlyContributions.push(invested);

      months.push({
        month: y * 12 + m + 1,
        year: y + 1,
        grossSalary: yi.grossAnnual / 12,
        socialInsurance: socialMonthly,
        planSelf: planSelfMonthly,
        planEmployer: planEmployerMonthly,
        incomeTax: yi.taxAnnual / 12,
        netIncome: yi.avgMonthlyNet,
        taxFreeAllowance: input.income.taxFreeAllowance,
        planWithdrawal: actualWithdrawal,
        spend,
        invested,
        cashSurplus: surplus - invested,
        cumulativeContribution,
        planBalance,
      });
    }
  }

  const path = deterministicPath(input.investment.initialCapital, monthlyContributions, realReturn);

  const timeline: YearPoint[] = path.values.map((value, i) => {
    const state = i === 0 ? undefined : months[i * 12 - 1];
    return {
      year: i,
      contribution: path.contributions[i]!,
      value,
      realValue: value / Math.pow(1 + input.inflation.annualRate, i),
      planBalance: state?.planBalance ?? 0,
      cashSurplus: state?.cashSurplus ?? 0,
    };
  });

  // 购汇额度是中国特有的约束，其他地区不适用
  if (input.region === 'CN') {
    const firstYearInvestment = monthlyContributions.slice(0, 12).reduce((a, b) => a + b, 0);
    const quota = FX_QUOTA_USD * usdCnyRate;
    if (firstYearInvestment > quota) {
      warnings.push({
        code: 'fx-quota-exceeded',
        params: { amount: Math.round(firstYearInvestment), quota: Math.round(quota) },
      });
    }
  }

  const separateYears = years.filter((y) => y.bonusTaxStrategy === 'separate').length;
  if (input.region === 'CN' && separateYears > 0 && separateYears < years.length) {
    warnings.push({
      code: 'bonus-strategy-mixed',
      params: { separate: separateYears, merged: years.length - separateYears },
    });
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
      totalSocialPaid: years.reduce((sum, y) => sum + y.socialInsuranceAnnual, 0),
      finalPlanBalance: planBalance,
      finalTotalWealth: finalValue + planBalance,
      netAnnualReturn: realReturn,
    },
    warnings,
  };
}
