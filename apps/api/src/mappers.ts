/**
 * Prisma 行 ↔ ProjectionInputDTO 的双向映射。
 *
 * 数据库里金额存 Decimal（避免浮点误差），引擎侧算的是 number，
 * 边界转换集中在这一个文件里，业务代码两边都不用关心 Decimal。
 */

import type { Prisma, SalaryStep, Scenario } from '@prisma/client';
import type { ProjectionInputDTO, ScenarioDTO } from '@pmp/shared';

/** Prisma 的 Decimal 与 decimal.js 实例都满足这个形状 */
type DecimalLike = { toNumber(): number };

const num = (d: DecimalLike): number => d.toNumber();
const numOrUndef = (d: DecimalLike | null): number | undefined => (d === null ? undefined : d.toNumber());

type ScenarioRow = Scenario & { salarySteps: SalaryStep[] };

/** 只有当至少一个覆盖项非空时才返回对象，否则返回 undefined，避免产生空的 overrides */
function readOverrides(row: ScenarioRow): ProjectionInputDTO['overrides'] {
  const o = {
    socialBaseMin: numOrUndef(row.ovSocialBaseMin),
    socialBaseMax: numOrUndef(row.ovSocialBaseMax),
    socialRateSelf: numOrUndef(row.ovSocialRateSelf),
    housingFundBaseMin: numOrUndef(row.ovHfBaseMin),
    housingFundBaseMax: numOrUndef(row.ovHfBaseMax),
    housingFundRateSelf: numOrUndef(row.ovHfRateSelf),
    housingFundRateEmployer: numOrUndef(row.ovHfRateEmployer),
  };
  return Object.values(o).some((v) => v !== undefined) ? o : undefined;
}

export function rowToInput(row: ScenarioRow): ProjectionInputDTO {
  return {
    region: 'CN',
    city: row.city,
    allowSeparateBonusTax: row.allowSeparateBonusTax,
    income: {
      monthlySalary: num(row.monthlySalary),
      salaryMonths: num(row.salaryMonths),
      mealAllowance: num(row.mealAllowance),
      annualGrowthRate: num(row.salaryGrowthRate),
      salarySteps: row.salarySteps
        .slice()
        .sort((a, b) => a.atYear - b.atYear)
        .map((s) => ({ atYear: s.atYear, newMonthlySalary: num(s.newMonthlySalary) })),
      deductions: {
        childrenCount: row.childrenCount,
        infantCount: row.infantCount,
        continuingEducation: row.continuingEducation as 'none' | 'degree' | 'vocational',
        housingType: row.housingType as 'none' | 'loan' | 'rent',
        rentTier: (row.rentTier ?? undefined) as 'tier1' | 'tier2' | 'tier3' | undefined,
        elderlyCare: row.elderlyCare as 'none' | 'only-child' | 'shared',
        elderlyShareAmount: numOrUndef(row.elderlyShareAmount),
      },
    },
    expense: {
      monthlySpend: num(row.monthlySpend),
      annualGrowthRate: num(row.spendGrowthRate),
    },
    housingFund: {
      monthlyWithdrawal: num(row.hfMonthlyWithdrawal),
      annualInterestRate: num(row.hfAnnualInterestRate),
      investWithdrawal: row.hfInvestWithdrawal,
    },
    investment: {
      initialCapital: num(row.initialCapital),
      years: row.years,
      expectedAnnualReturn: num(row.expectedAnnualReturn),
      annualVolatility: num(row.annualVolatility),
      feeDragAnnual: num(row.feeDragAnnual),
      dividendYield: num(row.dividendYield),
      dividendWithholdingTax: num(row.dividendWithholdingTax),
      investRatio: num(row.investRatio),
    },
    inflation: { annualRate: num(row.inflationRate) },
    overrides: readOverrides(row),
  };
}

export function rowToDTO(row: ScenarioRow): ScenarioDTO {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    input: rowToInput(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 把 DTO 摊平成 Prisma 的标量字段。salarySteps 由调用方单独处理（它是独立的表）。 */
export function inputToScalars(
  input: ProjectionInputDTO,
): Omit<Prisma.ScenarioCreateInput, 'name' | 'user' | 'salarySteps'> {
  const d = input.income.deductions;
  const o = input.overrides;
  return {
    region: input.region,
    city: input.city,
    allowSeparateBonusTax: input.allowSeparateBonusTax,

    monthlySalary: input.income.monthlySalary,
    salaryMonths: input.income.salaryMonths,
    mealAllowance: input.income.mealAllowance,
    salaryGrowthRate: input.income.annualGrowthRate,

    childrenCount: d.childrenCount,
    infantCount: d.infantCount,
    continuingEducation: d.continuingEducation,
    housingType: d.housingType,
    // 只有选了租房才存档位，避免留下与 housingType 矛盾的脏数据
    rentTier: d.housingType === 'rent' ? (d.rentTier ?? null) : null,
    elderlyCare: d.elderlyCare,
    elderlyShareAmount: d.elderlyCare === 'shared' ? (d.elderlyShareAmount ?? null) : null,

    monthlySpend: input.expense.monthlySpend,
    spendGrowthRate: input.expense.annualGrowthRate,

    hfMonthlyWithdrawal: input.housingFund.monthlyWithdrawal,
    hfAnnualInterestRate: input.housingFund.annualInterestRate,
    hfInvestWithdrawal: input.housingFund.investWithdrawal,

    initialCapital: input.investment.initialCapital,
    years: input.investment.years,
    expectedAnnualReturn: input.investment.expectedAnnualReturn,
    annualVolatility: input.investment.annualVolatility,
    feeDragAnnual: input.investment.feeDragAnnual,
    dividendYield: input.investment.dividendYield,
    dividendWithholdingTax: input.investment.dividendWithholdingTax,
    investRatio: input.investment.investRatio,

    inflationRate: input.inflation.annualRate,

    ovSocialBaseMin: o?.socialBaseMin ?? null,
    ovSocialBaseMax: o?.socialBaseMax ?? null,
    ovSocialRateSelf: o?.socialRateSelf ?? null,
    ovHfBaseMin: o?.housingFundBaseMin ?? null,
    ovHfBaseMax: o?.housingFundBaseMax ?? null,
    ovHfRateSelf: o?.housingFundRateSelf ?? null,
    ovHfRateEmployer: o?.housingFundRateEmployer ?? null,
  };
}
