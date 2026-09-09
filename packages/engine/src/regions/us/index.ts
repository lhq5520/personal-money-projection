/** 美国地区模块：联邦 + FICA + 州（+ 已知的重要地方税）。 */

import type {
  ContributionComponent,
  ProjectionInput,
  TaxComponent,
  UsFilingStatus,
  YearIncome,
} from '../../types.js';
import { bracketTax } from '../../tax/brackets.js';
import type { Jurisdiction, RegionModule } from '../types.js';
import { calendarYear } from '../../data/provenance.js';
import type { Provenance } from '../../data/provenance.js';
import {
  ELECTIVE_DEFERRAL_LIMIT,
  US_DATA_SYNCED_AT,
  FEDERAL_BRACKETS,
  FEDERAL_STANDARD_DEDUCTION,
  US_TAX_YEAR,
  childTaxCredit,
  computeFica,
} from './federal.js';
import { DEFAULT_STATE, STATE_DATA_TAX_YEAR, US_STATES, getState } from './states.js';

/** 州级税率表只区分「单身档」与「已婚合并档」 */
const stateBand = (status: UsFilingStatus): 'single' | 'married' =>
  status === 'married-joint' ? 'married' : 'single';

function computeYear(input: ProjectionInput, year: number, monthlySalary: number): YearIncome {
  const { filingStatus, qualifyingChildren, itemizedDeduction, pretaxRetirementRate, employerMatchRate } =
    input.us;
  const state = getState(input.jurisdiction);

  const grossAnnual = monthlySalary * input.income.salaryMonths;
  const bonus = monthlySalary * Math.max(0, input.income.salaryMonths - 12);

  // 401(k) 传统缴款受法定年度上限约束
  const planSelfAnnual = Math.min(grossAnnual * pretaxRetirementRate, ELECTIVE_DEFERRAL_LIMIT);
  const planEmployerAnnual = grossAnnual * employerMatchRate;

  // 关键：401(k) 只降低所得税税基，**不降低 FICA 税基**
  const fica = computeFica(grossAnnual, filingStatus);

  const statePayroll = state.payroll
    ? Math.min(grossAnnual, state.payroll.wageCap ?? Number.POSITIVE_INFINITY) * state.payroll.rate
    : 0;

  const socialBreakdown: ContributionComponent[] = [
    { code: 'us-social-security', amount: fica.socialSecurity, capped: fica.socialSecurityCapped },
    { code: 'us-medicare', amount: fica.medicare, capped: false },
  ];
  if (fica.additionalMedicare > 0) {
    socialBreakdown.push({ code: 'us-medicare-additional', amount: fica.additionalMedicare, capped: false });
  }
  if (statePayroll > 0) {
    socialBreakdown.push({ code: 'us-state-disability', amount: statePayroll, capped: false });
  }
  const socialInsuranceAnnual = fica.total + statePayroll;

  // ---- 联邦 ----
  const agi = grossAnnual - planSelfAnnual;
  const federalDeduction = Math.max(FEDERAL_STANDARD_DEDUCTION[filingStatus], itemizedDeduction);
  const federalTaxable = Math.max(0, agi - federalDeduction);
  const federalBeforeCredit = bracketTax(FEDERAL_BRACKETS[filingStatus], federalTaxable);
  const credit = Math.min(federalBeforeCredit, childTaxCredit(qualifyingChildren, agi, filingStatus));
  const federalTax = federalBeforeCredit - credit;

  // ---- 州与地方 ----
  const band = stateBand(filingStatus);
  const stateTaxable = state.brackets ? Math.max(0, agi - state.standardDeduction[band]) : 0;
  const stateTax = state.brackets ? bracketTax(state.brackets[band], stateTaxable) : 0;
  const localTax = state.localRate ? stateTaxable * state.localRate : 0;

  const taxBreakdown: TaxComponent[] = [{ code: 'national', amount: federalTax }];
  if (stateTax > 0) taxBreakdown.push({ code: 'regional', amount: stateTax });
  if (localTax > 0) taxBreakdown.push({ code: 'local', amount: localTax });
  if (credit > 0) taxBreakdown.push({ code: 'credit', amount: -credit });

  const taxAnnual = federalTax + stateTax + localTax;
  const netAnnual = grossAnnual - socialInsuranceAnnual - planSelfAnnual - taxAnnual;

  return {
    year,
    monthlySalary,
    grossAnnual,
    bonus,
    socialInsuranceAnnual,
    socialBreakdown,
    planCode: 'us-401k',
    planSelfAnnual,
    planEmployerAnnual,
    deductionAnnual: federalDeduction,
    taxableAnnual: federalTaxable,
    taxAnnual,
    taxBreakdown,
    netAnnual,
    avgMonthlyNet: netAnnual / 12,
    effectiveTaxRate: grossAnnual > 0 ? taxAnnual / grossAnnual : 0,
    totalBurdenRate: grossAnnual > 0 ? (taxAnnual + socialInsuranceAnnual) / grossAnnual : 0,
  };
}

const jurisdictions: readonly Jurisdiction[] = US_STATES.map((s) => ({
  code: s.code,
  name: s.name,
  note:
    s.brackets === null && s.code !== 'CUSTOM'
      ? { zh: '该州不征收个人所得税，仅需缴纳联邦税与 FICA', en: 'No state income tax — federal tax and FICA only.' }
      : s.code === 'CUSTOM'
        ? { zh: '不套用任何州税规则，只算联邦税与 FICA', en: 'No state rules applied — federal tax and FICA only.' }
        : s.localNote
          ? {
              zh: `${s.localNote.zh}。州级分档为 ${US_TAX_YEAR} 税年近似，请核对。`,
              en: `${s.localNote.en} State brackets are ${US_TAX_YEAR} approximations — verify before relying on them.`,
            }
          : {
              zh: `${US_TAX_YEAR} 税年州级分档与标准扣除的近似值。各州的豁免、抵免与地方税规则更复杂，请核对。`,
              en: `Approximate ${US_TAX_YEAR} state brackets and standard deduction. Exemptions, credits and local taxes are more complex — verify.`,
            },
}));

export const US_REGION: RegionModule = {
  code: 'US',
  currency: 'USD',
  currencySymbol: '$',
  numberLocale: 'en-US',
  planCode: 'us-401k',
  planGrowth: 'market',
  planWithdrawable: false,
  taxYear: US_TAX_YEAR,
  jurisdictions,
  defaultJurisdiction: DEFAULT_STATE,
  planAnnualLimit: ELECTIVE_DEFERRAL_LIMIT,
  computeYear,
  provenanceFor: (jurisdiction): Provenance => {
    const state = getState(jurisdiction);
    // 联邦分档由 data:sync 同步到当前税年；州级分档目前仍是手工维护的 2025 值。
    // 取两者中更旧的年份作为该辖区的整体口径——一个组件过期，结论就不能算新鲜。
    const stateYear = STATE_DATA_TAX_YEAR;
    const effectiveYear = Math.min(US_TAX_YEAR, state.brackets ? stateYear : US_TAX_YEAR);
    return {
      ...calendarYear(effectiveYear),
      sourceUrl: 'https://github.com/PolicyEngine/policyengine-us',
      verifiedAt: US_DATA_SYNCED_AT,
      confidence: state.approximate ? 'estimated' : 'derived',
      note:
        state.brackets && stateYear < US_TAX_YEAR
          ? `联邦分档已同步至 ${US_TAX_YEAR} 税年，州级分档仍为 ${stateYear} 税年的手工值`
          : undefined,
    };
  },
};
