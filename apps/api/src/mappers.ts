/**
 * Bidirectional mapping between Prisma rows and ProjectionInputDTO.
 *
 * Amounts are stored as Decimal in the database (to avoid floating-point error) while the engine
 * works in number. The boundary conversion is concentrated in this one file so business code on
 * neither side has to think about Decimal.
 *
 * All three regions' parameters are read and written together: switching countries loses no
 * settings, matching the frontend's behavior.
 *
 * Prisma 行 ↔ ProjectionInputDTO 的双向映射。
 *
 * 数据库里金额存 Decimal（避免浮点误差），引擎侧算的是 number，
 * 边界转换集中在这一个文件里，业务代码两边都不用关心 Decimal。
 *
 * 三个地区的参数同时读写：切换国家时不丢设置，与前端行为一致。
 */

import type { Prisma, SalaryStep, Scenario } from '@prisma/client';
import type { ProjectionInputDTO, ScenarioDTO } from '@pmp/shared';

/**
 * Both Prisma's Decimal and decimal.js instances satisfy this shape.
 * Prisma 的 Decimal 与 decimal.js 实例都满足这个形状
 */
type DecimalLike = { toNumber(): number };

const num = (d: DecimalLike): number => d.toNumber();
const numOrUndef = (d: DecimalLike | null): number | undefined => (d === null ? undefined : d.toNumber());

type ScenarioRow = Scenario & { salarySteps: SalaryStep[] };

/**
 * Return an object only when at least one override is non-empty, otherwise undefined — this
 * avoids producing an empty `overrides`.
 *
 * 只有当至少一个覆盖项非空时才返回对象，否则返回 undefined，避免产生空的 overrides
 */
function readOverrides(row: ScenarioRow): ProjectionInputDTO['overrides'] {
  const o = {
    socialBaseMin: numOrUndef(row.ovSocialBaseMin),
    socialBaseMax: numOrUndef(row.ovSocialBaseMax),
    socialRateSelf: numOrUndef(row.ovSocialRateSelf),
    planBaseMin: numOrUndef(row.ovPlanBaseMin),
    planBaseMax: numOrUndef(row.ovPlanBaseMax),
    planRateSelf: numOrUndef(row.ovPlanRateSelf),
    planRateEmployer: numOrUndef(row.ovPlanRateEmployer),
  };
  return Object.values(o).some((v) => v !== undefined) ? o : undefined;
}

export function rowToInput(row: ScenarioRow): ProjectionInputDTO {
  return {
    region: row.region as ProjectionInputDTO['region'],
    jurisdiction: row.jurisdiction,
    income: {
      monthlySalary: num(row.monthlySalary),
      salaryMonths: num(row.salaryMonths),
      taxFreeAllowance: num(row.taxFreeAllowance),
      annualGrowthRate: num(row.salaryGrowthRate),
      salarySteps: row.salarySteps
        .slice()
        .sort((a, b) => a.atYear - b.atYear)
        .map((s) => ({ atYear: s.atYear, newMonthlySalary: num(s.newMonthlySalary) })),
    },
    expense: {
      monthlySpend: num(row.monthlySpend),
      annualGrowthRate: num(row.spendGrowthRate),
    },
    employerPlan: {
      monthlyWithdrawal: num(row.planMonthlyWithdrawal),
      annualInterestRate: num(row.planAnnualInterestRate),
      investWithdrawal: row.planInvestWithdrawal,
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
    cn: {
      allowSeparateBonusTax: row.cnAllowSeparateBonusTax,
      deductions: {
        childrenCount: row.cnChildrenCount,
        infantCount: row.cnInfantCount,
        continuingEducation: row.cnContinuingEducation as 'none' | 'degree' | 'vocational',
        housingType: row.cnHousingType as 'none' | 'loan' | 'rent',
        rentTier: (row.cnRentTier ?? undefined) as 'tier1' | 'tier2' | 'tier3' | undefined,
        elderlyCare: row.cnElderlyCare as 'none' | 'only-child' | 'shared',
        elderlyShareAmount: numOrUndef(row.cnElderlyShareAmount),
      },
    },
    us: {
      filingStatus: row.usFilingStatus as ProjectionInputDTO['us']['filingStatus'],
      qualifyingChildren: row.usQualifyingChildren,
      itemizedDeduction: num(row.usItemizedDeduction),
      pretaxRetirementRate: num(row.usPretaxRetirementRate),
      employerMatchRate: num(row.usEmployerMatchRate),
    },
    ca: {
      filingStatus: row.caFilingStatus as ProjectionInputDTO['ca']['filingStatus'],
      rrspRate: num(row.caRrspRate),
      employerMatchRate: num(row.caEmployerMatchRate),
      otherCreditBase: num(row.caOtherCreditBase),
    },
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

/**
 * Flatten a DTO into Prisma's scalar fields. salarySteps is handled separately by the caller,
 * since it lives in its own table.
 *
 * 把 DTO 摊平成 Prisma 的标量字段。salarySteps 由调用方单独处理（它是独立的表）。
 */
export function inputToScalars(
  input: ProjectionInputDTO,
): Omit<Prisma.ScenarioCreateInput, 'name' | 'user' | 'salarySteps'> {
  const d = input.cn.deductions;
  const o = input.overrides;
  return {
    region: input.region,
    jurisdiction: input.jurisdiction,

    monthlySalary: input.income.monthlySalary,
    salaryMonths: input.income.salaryMonths,
    taxFreeAllowance: input.income.taxFreeAllowance,
    salaryGrowthRate: input.income.annualGrowthRate,

    monthlySpend: input.expense.monthlySpend,
    spendGrowthRate: input.expense.annualGrowthRate,

    planMonthlyWithdrawal: input.employerPlan.monthlyWithdrawal,
    planAnnualInterestRate: input.employerPlan.annualInterestRate,
    planInvestWithdrawal: input.employerPlan.investWithdrawal,

    initialCapital: input.investment.initialCapital,
    years: input.investment.years,
    expectedAnnualReturn: input.investment.expectedAnnualReturn,
    annualVolatility: input.investment.annualVolatility,
    feeDragAnnual: input.investment.feeDragAnnual,
    dividendYield: input.investment.dividendYield,
    dividendWithholdingTax: input.investment.dividendWithholdingTax,
    investRatio: input.investment.investRatio,

    inflationRate: input.inflation.annualRate,

    cnAllowSeparateBonusTax: input.cn.allowSeparateBonusTax,
    cnChildrenCount: d.childrenCount,
    cnInfantCount: d.infantCount,
    cnContinuingEducation: d.continuingEducation,
    cnHousingType: d.housingType,
    // Only persist the tier when rent is actually selected, so no dirty data contradicts
    // housingType.
    // 只有选了租房才存档位，避免留下与 housingType 矛盾的脏数据
    cnRentTier: d.housingType === 'rent' ? (d.rentTier ?? null) : null,
    cnElderlyCare: d.elderlyCare,
    cnElderlyShareAmount: d.elderlyCare === 'shared' ? (d.elderlyShareAmount ?? null) : null,

    usFilingStatus: input.us.filingStatus,
    usQualifyingChildren: input.us.qualifyingChildren,
    usItemizedDeduction: input.us.itemizedDeduction,
    usPretaxRetirementRate: input.us.pretaxRetirementRate,
    usEmployerMatchRate: input.us.employerMatchRate,

    caFilingStatus: input.ca.filingStatus,
    caRrspRate: input.ca.rrspRate,
    caEmployerMatchRate: input.ca.employerMatchRate,
    caOtherCreditBase: input.ca.otherCreditBase,

    ovSocialBaseMin: o?.socialBaseMin ?? null,
    ovSocialBaseMax: o?.socialBaseMax ?? null,
    ovSocialRateSelf: o?.socialRateSelf ?? null,
    ovPlanBaseMin: o?.planBaseMin ?? null,
    ovPlanBaseMax: o?.planBaseMax ?? null,
    ovPlanRateSelf: o?.planRateSelf ?? null,
    ovPlanRateEmployer: o?.planRateEmployer ?? null,
  };
}
