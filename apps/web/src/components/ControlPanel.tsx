import {
  ELECTIVE_DEFERRAL_LIMIT,
  RRSP_DOLLAR_LIMIT,
  REGION_CODES,
  defaultInput,
  getRegion,
  type RegionCode,
} from '@pmp/engine';
import type { ProjectionInputDTO } from '@pmp/shared';
import { useFormat } from '../hooks/useFormat.js';
import { useI18n, type TranslationKey } from '../i18n/index.js';
import { CheckboxField, SelectField, SliderField } from './Fields.js';

interface Props {
  input: ProjectionInputDTO;
  onChange: (next: ProjectionInputDTO) => void;
}

/**
 * Currency magnitudes differ a lot between countries, so slider maxima scale by region —
 * otherwise a US or Canadian user hits the ceiling on the first drag.
 *
 * 各国货币量级差异很大，滑杆上限按地区缩放，否则美加用户拖一下就到顶了
 */
const SALARY_MAX: Record<RegionCode, number> = { CN: 200_000, US: 80_000, CA: 80_000 };
const SPEND_MAX: Record<RegionCode, number> = { CN: 100_000, US: 40_000, CA: 40_000 };
const CAPITAL_MAX: Record<RegionCode, number> = { CN: 5_000_000, US: 2_000_000, CA: 2_000_000 };
const STEP: Record<RegionCode, number> = { CN: 100, US: 50, CA: 50 };

export function ControlPanel({ input, onChange }: Props) {
  const { t, name } = useI18n();
  const region = getRegion(input.region);
  const fmt = useFormat(input.region);
  const code = input.region;

  const setIncome = (patch: Partial<ProjectionInputDTO['income']>) =>
    onChange({ ...input, income: { ...input.income, ...patch } });
  const setExpense = (patch: Partial<ProjectionInputDTO['expense']>) =>
    onChange({ ...input, expense: { ...input.expense, ...patch } });
  const setPlan = (patch: Partial<ProjectionInputDTO['employerPlan']>) =>
    onChange({ ...input, employerPlan: { ...input.employerPlan, ...patch } });
  const setInv = (patch: Partial<ProjectionInputDTO['investment']>) =>
    onChange({ ...input, investment: { ...input.investment, ...patch } });
  const setCn = (patch: Partial<ProjectionInputDTO['cn']>) =>
    onChange({ ...input, cn: { ...input.cn, ...patch } });
  const setCnDeductions = (patch: Partial<ProjectionInputDTO['cn']['deductions']>) =>
    setCn({ deductions: { ...input.cn.deductions, ...patch } });
  const setUs = (patch: Partial<ProjectionInputDTO['us']>) =>
    onChange({ ...input, us: { ...input.us, ...patch } });
  const setCa = (patch: Partial<ProjectionInputDTO['ca']>) =>
    onChange({ ...input, ca: { ...input.ca, ...patch } });

  /**
   * The trade-off when switching countries:
   *
   * Currency-denominated fields (salary, spending, principal) and country-convention fields
   * (salary months, housing fund withdrawal, fund fees, dividend withholding) all reset to the
   * new region's defaults — otherwise ¥14,600 would become $14,600 verbatim, a 7× difference in
   * magnitude, and a China-specific convention like "15 salaries a year" is meaningless in the US.
   *
   * The "market view" you've tuned (horizon, expected return, volatility, invest ratio) and all
   * three regions' tax parameters are preserved, because they're either country-agnostic or
   * stored separately to begin with.
   *
   * 换国家时的取舍：
   *
   * 以货币计价的字段（薪资、开销、本金）和各国惯例字段（薪数、公积金提取、
   * 基金费率、股息预扣税）都重置为新地区的默认值——否则 ¥14,600 会原样变成
   * $14,600，量级差七倍；「15 薪」这种中国特有惯例带到美国也毫无意义。
   *
   * 你调过的「市场观点」（年限、预期收益、波动率、投入比例）和三个地区各自的
   * 税务参数全部保留，因为它们与国家无关或本就分开存放。
   */
  const switchRegion = (next: RegionCode) => {
    const seed = defaultInput(next) as ProjectionInputDTO;
    onChange({
      ...seed,
      income: { ...seed.income, salarySteps: input.income.salarySteps },
      investment: {
        ...seed.investment,
        years: input.investment.years,
        expectedAnnualReturn: input.investment.expectedAnnualReturn,
        annualVolatility: input.investment.annualVolatility,
        investRatio: input.investment.investRatio,
      },
      // Each region's tax settings are stored independently, so switching loses none of them.
      // 三个地区的税务设置各自独立存放，切换时一份都不丢
      cn: input.cn,
      us: input.us,
      ca: input.ca,
      overrides: input.overrides,
    });
  };

  const planName = t(`plan.${region.planCode}` as TranslationKey);

  return (
    <section className="panel controls" aria-label={t('ctl.title')}>
      <h2>{t('ctl.title')}</h2>

      <fieldset className="group">
        <legend>{t('ctl.group.region')}</legend>
        <SelectField
          label={t('region.label')}
          value={code}
          onChange={switchRegion}
          options={REGION_CODES.map((r) => ({ value: r, label: t(`region.${r}` as TranslationKey) }))}
          hint={t('region.taxYear', { year: region.taxYear })}
        />
        <SelectField
          label={t(`region.jurisdiction.${code}` as TranslationKey)}
          value={input.jurisdiction}
          onChange={(v) => onChange({ ...input, jurisdiction: v })}
          options={region.jurisdictions.map((j) => ({ value: j.code, label: name(j.name) }))}
          hint={name(region.jurisdictions.find((j) => j.code === input.jurisdiction)?.note ?? { zh: '', en: '' })}
        />
      </fieldset>

      <fieldset className="group">
        <legend>{t('ctl.group.income')}</legend>
        <SliderField label={t('ctl.salary')} value={input.income.monthlySalary} onChange={(v) => setIncome({ monthlySalary: v })}
          min={0} max={SALARY_MAX[code]} step={STEP[code]} suffix={region.currencySymbol} />
        <SliderField label={t('ctl.salaryMonths')} value={input.income.salaryMonths} onChange={(v) => setIncome({ salaryMonths: v })}
          min={12} max={24} step={0.5} decimals={1} suffix={t('unit.month')} hint={t('ctl.salaryMonths.hint')} />
        <SliderField label={t('ctl.allowance')} value={input.income.taxFreeAllowance} onChange={(v) => setIncome({ taxFreeAllowance: v })}
          min={0} max={5_000} step={50} suffix={region.currencySymbol} hint={t('ctl.allowance.hint')} />
        <SliderField label={t('ctl.salaryGrowth')} value={input.income.annualGrowthRate} onChange={(v) => setIncome({ annualGrowthRate: v })}
          min={0} max={0.3} step={0.005} scale={100} decimals={1} suffix="%" hint={t('ctl.salaryGrowth.hint')} />
      </fieldset>

      {code === 'CN' && (
        <fieldset className="group">
          <legend>{t('ctl.group.cnDeduction')}</legend>
          <CheckboxField label={t('ctl.cn.bonusTax')} checked={input.cn.allowSeparateBonusTax}
            onChange={(v) => setCn({ allowSeparateBonusTax: v })} hint={t('ctl.cn.bonusTax.hint')} />
          <SliderField label={t('ctl.cn.children')} value={input.cn.deductions.childrenCount}
            onChange={(v) => setCnDeductions({ childrenCount: Math.round(v) })}
            min={0} max={5} step={1} suffix={t('unit.person')} hint={t('ctl.cn.children.hint')} />
          <SliderField label={t('ctl.cn.infants')} value={input.cn.deductions.infantCount}
            onChange={(v) => setCnDeductions({ infantCount: Math.round(v) })}
            min={0} max={5} step={1} suffix={t('unit.person')} hint={t('ctl.cn.children.hint')} />
          <SelectField label={t('ctl.cn.continuing')} value={input.cn.deductions.continuingEducation}
            onChange={(v) => setCnDeductions({ continuingEducation: v })}
            options={(['none', 'degree', 'vocational'] as const).map((v) => ({
              value: v, label: t(`ctl.cn.continuing.${v}` as TranslationKey),
            }))} />
          <SelectField label={t('ctl.cn.housing')} value={input.cn.deductions.housingType}
            onChange={(v) => setCnDeductions({ housingType: v })}
            options={(['none', 'rent', 'loan'] as const).map((v) => ({
              value: v, label: t(`ctl.cn.housing.${v}` as TranslationKey),
            }))}
            hint={t('ctl.cn.housing.hint')} />
          {input.cn.deductions.housingType === 'rent' && (
            <SelectField label={t('ctl.cn.rentTier')} value={input.cn.deductions.rentTier ?? 'tier1'}
              onChange={(v) => setCnDeductions({ rentTier: v })}
              options={(['tier1', 'tier2', 'tier3'] as const).map((v) => ({
                value: v, label: t(`ctl.cn.rentTier.${v}` as TranslationKey),
              }))} />
          )}
          <SelectField label={t('ctl.cn.elderly')} value={input.cn.deductions.elderlyCare}
            onChange={(v) => setCnDeductions({ elderlyCare: v, elderlyShareAmount: v === 'shared' ? (input.cn.deductions.elderlyShareAmount ?? 1_500) : undefined })}
            options={(['none', 'only-child', 'shared'] as const).map((v) => ({
              value: v, label: t(`ctl.cn.elderly.${v}` as TranslationKey),
            }))} />
          {input.cn.deductions.elderlyCare === 'shared' && (
            <SliderField label={t('ctl.cn.elderlyShare')} value={input.cn.deductions.elderlyShareAmount ?? 1_500}
              onChange={(v) => setCnDeductions({ elderlyShareAmount: v })}
              min={0} max={1_500} step={100} suffix={region.currencySymbol} hint={t('ctl.cn.elderlyShare.hint')} />
          )}
        </fieldset>
      )}

      {code === 'US' && (
        <fieldset className="group">
          <legend>{t('ctl.group.usTax')}</legend>
          <SelectField label={t('ctl.us.filing')} value={input.us.filingStatus}
            onChange={(v) => setUs({ filingStatus: v })}
            options={(['single', 'married-joint', 'married-separate', 'head-of-household'] as const).map((v) => ({
              value: v, label: t(`ctl.us.filing.${v}` as TranslationKey),
            }))} />
          <SliderField label={t('ctl.us.children')} value={input.us.qualifyingChildren}
            onChange={(v) => setUs({ qualifyingChildren: Math.round(v) })}
            min={0} max={6} step={1} hint={t('ctl.us.children.hint')} />
          <SliderField label={t('ctl.us.itemized')} value={input.us.itemizedDeduction}
            onChange={(v) => setUs({ itemizedDeduction: v })}
            min={0} max={100_000} step={500} suffix={region.currencySymbol} hint={t('ctl.us.itemized.hint')} />
          <SliderField label={t('ctl.us.pretax')} value={input.us.pretaxRetirementRate}
            onChange={(v) => setUs({ pretaxRetirementRate: v })}
            min={0} max={0.5} step={0.005} scale={100} decimals={1} suffix="%"
            hint={t('ctl.us.pretax.hint', { limit: fmt.money(ELECTIVE_DEFERRAL_LIMIT) })} />
          <SliderField label={t('ctl.us.match')} value={input.us.employerMatchRate}
            onChange={(v) => setUs({ employerMatchRate: v })}
            min={0} max={0.2} step={0.005} scale={100} decimals={1} suffix="%" />
        </fieldset>
      )}

      {code === 'CA' && (
        <fieldset className="group">
          <legend>{t('ctl.group.caTax')}</legend>
          <SelectField label={t('ctl.ca.filing')} value={input.ca.filingStatus}
            onChange={(v) => setCa({ filingStatus: v })}
            options={(['single', 'married'] as const).map((v) => ({
              value: v, label: t(`ctl.ca.filing.${v}` as TranslationKey),
            }))} />
          <SliderField label={t('ctl.ca.rrsp')} value={input.ca.rrspRate}
            onChange={(v) => setCa({ rrspRate: v })}
            min={0} max={0.3} step={0.005} scale={100} decimals={1} suffix="%"
            hint={t('ctl.ca.rrsp.hint', { limit: fmt.money(RRSP_DOLLAR_LIMIT) })} />
          <SliderField label={t('ctl.ca.match')} value={input.ca.employerMatchRate}
            onChange={(v) => setCa({ employerMatchRate: v })}
            min={0} max={0.2} step={0.005} scale={100} decimals={1} suffix="%" />
          <SliderField label={t('ctl.ca.credit')} value={input.ca.otherCreditBase}
            onChange={(v) => setCa({ otherCreditBase: v })}
            min={0} max={50_000} step={500} suffix={region.currencySymbol} hint={t('ctl.ca.credit.hint')} />
        </fieldset>
      )}

      <fieldset className="group">
        <legend>{t('ctl.group.expense')}</legend>
        <SliderField label={t('ctl.spend')} value={input.expense.monthlySpend} onChange={(v) => setExpense({ monthlySpend: v })}
          min={0} max={SPEND_MAX[code]} step={STEP[code]} suffix={region.currencySymbol} />
        <SliderField label={t('ctl.spendGrowth')} value={input.expense.annualGrowthRate} onChange={(v) => setExpense({ annualGrowthRate: v })}
          min={0} max={0.15} step={0.005} scale={100} decimals={1} suffix="%" />
      </fieldset>

      <fieldset className="group">
        <legend>{t('ctl.group.plan', { plan: planName })}</legend>
        {region.planWithdrawable ? (
          <>
            <SliderField label={t('ctl.plan.withdrawal')} value={input.employerPlan.monthlyWithdrawal}
              onChange={(v) => setPlan({ monthlyWithdrawal: v })}
              min={0} max={20_000} step={100} suffix={region.currencySymbol} hint={t('ctl.plan.withdrawal.hint')} />
            <SliderField label={t('ctl.plan.interest')} value={input.employerPlan.annualInterestRate}
              onChange={(v) => setPlan({ annualInterestRate: v })}
              min={0} max={0.05} step={0.001} scale={100} decimals={2} suffix="%" hint={t('ctl.plan.interest.hint')} />
            <CheckboxField label={t('ctl.plan.invest')} checked={input.employerPlan.investWithdrawal}
              onChange={(v) => setPlan({ investWithdrawal: v })} />
          </>
        ) : (
          // The 401(k) / RRSP contribution rate is set in each region's own tax section; this
          // only describes the account's behavior.
          // 401(k) / RRSP 的缴纳比例在各自的税务分区里设置，这里只说明账户行为
          <p className="hint" style={{ marginTop: 0 }}>{t('ctl.plan.marketNote', { plan: planName })}</p>
        )}
      </fieldset>

      <fieldset className="group">
        <legend>{t('ctl.group.investment')}</legend>
        <SliderField label={t('ctl.initialCapital')} value={input.investment.initialCapital} onChange={(v) => setInv({ initialCapital: v })}
          min={0} max={CAPITAL_MAX[code]} step={STEP[code] * 50} suffix={region.currencySymbol} />
        <SliderField label={t('ctl.years')} value={input.investment.years} onChange={(v) => setInv({ years: Math.round(v) })}
          min={1} max={50} step={1} suffix={t('unit.year')} />
        <SliderField label={t('ctl.return')} value={input.investment.expectedAnnualReturn} onChange={(v) => setInv({ expectedAnnualReturn: v })}
          min={0} max={0.2} step={0.005} scale={100} decimals={1} suffix="%" hint={t('ctl.return.hint')} />
        <SliderField label={t('ctl.volatility')} value={input.investment.annualVolatility} onChange={(v) => setInv({ annualVolatility: v })}
          min={0} max={0.5} step={0.01} scale={100} decimals={0} suffix="%" hint={t('ctl.volatility.hint')} />
        <SliderField label={t('ctl.fee')} value={input.investment.feeDragAnnual} onChange={(v) => setInv({ feeDragAnnual: v })}
          min={0} max={0.03} step={0.0001} scale={100} decimals={2} suffix="%" hint={t('ctl.fee.hint')} />
        <SliderField label={t('ctl.dividend')} value={input.investment.dividendYield} onChange={(v) => setInv({ dividendYield: v })}
          min={0} max={0.06} step={0.001} scale={100} decimals={2} suffix="%" />
        <SliderField label={t('ctl.withholding')} value={input.investment.dividendWithholdingTax} onChange={(v) => setInv({ dividendWithholdingTax: v })}
          min={0} max={0.4} step={0.01} scale={100} decimals={0} suffix="%" hint={t('ctl.withholding.hint')} />
        <SliderField label={t('ctl.investRatio')} value={input.investment.investRatio} onChange={(v) => setInv({ investRatio: v })}
          min={0} max={1} step={0.05} scale={100} decimals={0} suffix="%" hint={t('ctl.investRatio.hint')} />
      </fieldset>

      <fieldset className="group">
        <legend>{t('ctl.group.inflation')}</legend>
        <SliderField label={t('ctl.inflation')} value={input.inflation.annualRate}
          onChange={(v) => onChange({ ...input, inflation: { annualRate: v } })}
          min={0} max={0.15} step={0.005} scale={100} decimals={1} suffix="%" hint={t('ctl.inflation.hint')} />
      </fieldset>
    </section>
  );
}
