/**
 * The Canada region module: federal + CPP/EI + province, including Ontario's surtax and
 * Quebec's federal abatement.
 *
 * 加拿大地区模块：联邦 + CPP/EI + 省（含安省附加税与魁北克联邦返还）。
 */

import type {
  ContributionComponent,
  ProjectionInput,
  TaxComponent,
  YearIncome,
} from '../../types.js';
import { bracketTax, nonRefundableCredit } from '../../tax/brackets.js';
import type { Jurisdiction, RegionModule } from '../types.js';
import { calendarYear } from '../../data/provenance.js';
import type { Provenance } from '../../data/provenance.js';
import {
  CA_DATA_SYNCED_AT,
  CA_TAX_YEAR,
  FEDERAL_BPA,
  FEDERAL_BRACKETS,
  QUEBEC_ABATEMENT,
  RRSP_DOLLAR_LIMIT,
  computePayroll,
  rrspRoom,
} from './federal.js';
import {
  CA_PROVINCES,
  DEFAULT_PROVINCE,
  PROVINCIAL_DATA_TAX_YEAR,
  computeSurtax,
  getProvince,
} from './provinces.js';

function computeYear(input: ProjectionInput, year: number, monthlySalary: number): YearIncome {
  const province = getProvince(input.jurisdiction);
  const isQuebec = province.isQuebec === true;

  const grossAnnual = monthlySalary * input.income.salaryMonths;
  const bonus = monthlySalary * Math.max(0, input.income.salaryMonths - 12);

  // RRSP contributions are bounded by contribution room: 18% of income, capped at an absolute
  // dollar limit.
  // RRSP 缴款受「收入的 18% 且不超过绝对上限」的供款额度约束
  const planSelfAnnual = Math.min(grossAnnual * input.ca.rrspRate, rrspRoom(grossAnnual));
  const planEmployerAnnual = grossAnnual * input.ca.employerMatchRate;

  const payroll = computePayroll(grossAnnual, isQuebec);
  const socialBreakdown: ContributionComponent[] = [
    { code: 'ca-cpp', amount: payroll.cpp, capped: grossAnnual > 71_300 },
    { code: 'ca-ei', amount: payroll.ei + payroll.qpip, capped: payroll.eiCapped },
  ];
  if (payroll.cpp2 > 0) {
    socialBreakdown.push({ code: 'ca-cpp2', amount: payroll.cpp2, capped: payroll.cppCapped });
  }

  // RRSP contributions are deducted from taxable income — same as a US 401(k), though
  // Canada's CPP/EI are no more reduced by it than FICA is.
  // RRSP 缴款从应税所得中扣除（与美国 401(k) 相同，但加拿大的 CPP/EI 也不因此减少）
  const taxableIncome = Math.max(0, grossAnnual - planSelfAnnual);

  // ---- Federal 联邦 ----
  // The Basic Personal Amount is a non-refundable *credit*, not an income deduction: the
  // credit equals base × lowest bracket rate, so it isn't worth more to a high earner. That's
  // a structural difference between Canada and both the Chinese and US systems.
  // 基本个人金额是「不可退还抵免」而非所得扣除：抵免额 = 基数 × 最低档税率，
  // 因此它对高收入者的价值并不更高。这是加拿大与中美两国税制的一个结构性差异。
  const federalBefore = bracketTax(FEDERAL_BRACKETS, taxableIncome);
  const federalCredit = nonRefundableCredit(FEDERAL_BRACKETS, FEDERAL_BPA + input.ca.otherCreditBase);
  let federalTax = Math.max(0, federalBefore - federalCredit);
  const abatement = isQuebec ? federalTax * QUEBEC_ABATEMENT : 0;
  federalTax -= abatement;

  // ---- Provincial 省 ----
  const provincialBefore = bracketTax(province.brackets, taxableIncome);
  const provincialCredit = nonRefundableCredit(province.brackets, province.bpa);
  const provincialTax = Math.max(0, provincialBefore - provincialCredit);
  const surtax = computeSurtax(provincialTax, province);

  const taxBreakdown: TaxComponent[] = [
    { code: 'national', amount: federalTax },
    { code: 'regional', amount: provincialTax },
  ];
  if (surtax > 0) taxBreakdown.push({ code: 'surtax', amount: surtax });
  if (abatement > 0) taxBreakdown.push({ code: 'credit', amount: -abatement });

  const taxAnnual = federalTax + provincialTax + surtax;
  const netAnnual = grossAnnual - payroll.total - planSelfAnnual - taxAnnual;

  return {
    year,
    monthlySalary,
    grossAnnual,
    bonus,
    socialInsuranceAnnual: payroll.total,
    socialBreakdown,
    planCode: 'ca-rrsp',
    planSelfAnnual,
    planEmployerAnnual,
    deductionAnnual: planSelfAnnual,
    taxableAnnual: taxableIncome,
    taxAnnual,
    taxBreakdown,
    netAnnual,
    avgMonthlyNet: netAnnual / 12,
    effectiveTaxRate: grossAnnual > 0 ? taxAnnual / grossAnnual : 0,
    totalBurdenRate: grossAnnual > 0 ? (taxAnnual + payroll.total) / grossAnnual : 0,
  };
}

const jurisdictions: readonly Jurisdiction[] = CA_PROVINCES.map((p) => ({
  code: p.code,
  name: p.name,
  note: p.isQuebec
    ? {
        zh: `${CA_TAX_YEAR} 税年近似。魁北克使用 QPP 与 QPIP 而非 CPP，并享有 16.5% 的联邦税返还，均已建模；省级抵免的细节未完全覆盖。`,
        en: `Approximate ${CA_TAX_YEAR}. Quebec uses QPP and QPIP instead of CPP and receives a 16.5% federal abatement — both modelled; finer provincial credits are not.`,
      }
    : p.surtax
      ? {
          zh: `${CA_TAX_YEAR} 税年近似，已含省级附加税；安省健康保费（最高 900 加元）未建模。`,
          en: `Approximate ${CA_TAX_YEAR}, including the provincial surtax. The Ontario Health Premium (up to $900) is not modelled.`,
        }
      : {
          zh: `${CA_TAX_YEAR} 税年省级分档与基本个人金额的近似值，请核对。`,
          en: `Approximate ${CA_TAX_YEAR} provincial brackets and basic personal amount — verify before relying on them.`,
        },
}));

export const CA_REGION: RegionModule = {
  code: 'CA',
  currency: 'CAD',
  currencySymbol: 'C$',
  numberLocale: 'en-CA',
  planCode: 'ca-rrsp',
  planGrowth: 'market',
  planWithdrawable: false,
  taxYear: CA_TAX_YEAR,
  jurisdictions,
  defaultJurisdiction: DEFAULT_PROVINCE,
  planAnnualLimit: RRSP_DOLLAR_LIMIT,
  computeYear,
  provenanceFor: (): Provenance => ({
    // Provincial brackets are hand-maintained: upstream PolicyEngine's provincial data is
    // stuck on 2022–2023, older than this repo, so report the provincial data's year rather
    // than the federal sync year.
    // 省级分档是手工维护的：上游 PolicyEngine 的省级数据停留在 2022–2023 年，
    // 比本仓库还旧，因此以省级数据的年份为准，而不是联邦的同步年份。
    ...calendarYear(PROVINCIAL_DATA_TAX_YEAR),
    sourceUrl: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html',
    verifiedAt: CA_DATA_SYNCED_AT,
    confidence: 'estimated',
    note: `联邦分档已同步至 ${CA_TAX_YEAR} 税年，省级分档为 ${PROVINCIAL_DATA_TAX_YEAR} 税年的手工值`,
  }),
};
