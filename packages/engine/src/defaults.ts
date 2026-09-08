import type { CaParams, CnParams, ProjectionInput, RegionCode, UsParams } from './types.js';
import { getRegion } from './regions/registry.js';

/** 三个地区的参数同时保留，切换国家时不会丢掉另一边已填好的设置 */
export const DEFAULT_CN_PARAMS: CnParams = {
  allowSeparateBonusTax: true,
  deductions: {
    childrenCount: 0,
    infantCount: 0,
    continuingEducation: 'none',
    housingType: 'rent',
    elderlyCare: 'none',
  },
};

export const DEFAULT_US_PARAMS: UsParams = {
  filingStatus: 'single',
  qualifyingChildren: 0,
  itemizedDeduction: 0,
  pretaxRetirementRate: 0.06,
  employerMatchRate: 0.04,
};

export const DEFAULT_CA_PARAMS: CaParams = {
  filingStatus: 'single',
  rrspRate: 0.06,
  employerMatchRate: 0.03,
  otherCreditBase: 0,
};

/**
 * 各地区的默认起始参数。
 * 中国沿用原型页面的取值以便对照；美加取各自量级上合理的中位数假设。
 */
const REGION_SEED: Record<RegionCode, { salary: number; months: number; allowance: number; spend: number; inflation: number }> = {
  CN: { salary: 14_600, months: 15, allowance: 600, spend: 6_000, inflation: 0.025 },
  US: { salary: 8_500, months: 12, allowance: 0, spend: 4_200, inflation: 0.025 },
  CA: { salary: 7_000, months: 12, allowance: 0, spend: 3_600, inflation: 0.02 },
};

export function defaultInput(region: RegionCode = 'CN'): ProjectionInput {
  const seed = REGION_SEED[region];
  const mod = getRegion(region);
  return {
    region,
    jurisdiction: mod.defaultJurisdiction,
    income: {
      monthlySalary: seed.salary,
      salaryMonths: seed.months,
      taxFreeAllowance: seed.allowance,
      annualGrowthRate: 0.05,
      salarySteps: [],
    },
    expense: {
      monthlySpend: seed.spend,
      annualGrowthRate: 0.03,
    },
    employerPlan: {
      // 只有中国公积金支持提取
      monthlyWithdrawal: region === 'CN' ? 1_500 : 0,
      annualInterestRate: 0.015,
      investWithdrawal: true,
    },
    investment: {
      initialCapital: 0,
      years: 20,
      expectedAnnualReturn: 0.07,
      annualVolatility: 0.16,
      feeDragAnnual: region === 'CN' ? 0.008 : 0.0003,
      dividendYield: 0.013,
      // 中国投资者持有美股 ETF 的股息通常被预扣 10%；美加本土持有者在报税时处理
      dividendWithholdingTax: region === 'CN' ? 0.1 : 0,
      investRatio: 1,
    },
    inflation: { annualRate: seed.inflation },
    cn: DEFAULT_CN_PARAMS,
    us: DEFAULT_US_PARAMS,
    ca: DEFAULT_CA_PARAMS,
  };
}

export const DEFAULT_INPUT: ProjectionInput = defaultInput('CN');

/** 蒙特卡洛默认跑 2000 条路径：在浏览器里 40 年期约几十毫秒，肉眼无感 */
export const DEFAULT_MC_PATHS = 2_000;
export const DEFAULT_MC_SEED = 20260101;
