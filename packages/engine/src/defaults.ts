import type { ProjectionInput } from './types.js';
import { DEFAULT_CITY } from './regions/cn/cities.js';

/**
 * 默认参数沿用原型页面的取值，方便对照迁移前后的结果；
 * 新增的字段取业界常见的保守假设。
 */
export const DEFAULT_INPUT: ProjectionInput = {
  region: 'CN',
  city: DEFAULT_CITY,
  allowSeparateBonusTax: true,
  income: {
    monthlySalary: 14_600,
    salaryMonths: 15,
    mealAllowance: 600,
    annualGrowthRate: 0.05,
    salarySteps: [],
    deductions: {
      childrenCount: 0,
      infantCount: 0,
      continuingEducation: 'none',
      housingType: 'rent',
      elderlyCare: 'none',
    },
  },
  expense: {
    monthlySpend: 6_000,
    annualGrowthRate: 0.03,
  },
  housingFund: {
    monthlyWithdrawal: 1_500,
    annualInterestRate: 0.015,
    investWithdrawal: true,
  },
  investment: {
    initialCapital: 0,
    years: 20,
    expectedAnnualReturn: 0.07,
    annualVolatility: 0.16,
    feeDragAnnual: 0.008,
    dividendYield: 0.013,
    dividendWithholdingTax: 0.1,
    investRatio: 1,
  },
  inflation: {
    annualRate: 0.025,
  },
};

/** 蒙特卡洛默认跑 2000 条路径：在浏览器里 40 年期约几十毫秒，肉眼无感 */
export const DEFAULT_MC_PATHS = 2_000;
export const DEFAULT_MC_SEED = 20260101;
