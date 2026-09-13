import { getRegion, type ProjectionResult } from '@pmp/engine';
import { useFormat } from '../hooks/useFormat.js';
import { taxLayerKey, useI18n, type TranslationKey } from '../i18n/index.js';

const Line = ({ k, v, title }: { k: string; v: string; title?: string }) => (
  <div className="row-line" title={title}>
    <span>{k}</span>
    <strong>{v}</strong>
  </div>
);

export function Breakdown({ result }: { result: ProjectionResult }) {
  const { t } = useI18n();
  const fmt = useFormat(result.input.region);
  const region = getRegion(result.input.region);

  const y1 = result.years[0];
  const last = result.years[result.years.length - 1];
  const m1 = result.months[0];
  if (!y1 || !last || !m1) return null;

  const planName = t(`plan.${y1.planCode}` as TranslationKey);
  const years = result.input.investment.years;

  return (
    <div className="two-col">
      <div className="panel">
        <h3>{t('breakdown.tax.title')}</h3>
        <div className="rows">
          <Line k={t('breakdown.gross')} v={fmt.money(y1.grossAnnual)} />
          {y1.bonus > 0 && <Line k={t('breakdown.bonus')} v={fmt.money(y1.bonus)} />}

          {/* Mandatory contributions itemized: pension/medical/unemployment in China, the FICA
              components in the US, CPP/EI in Canada.
              强制缴款逐项列出：中国是养老/医疗/失业，美国是 FICA 各项，加拿大是 CPP/EI */}
          {y1.socialBreakdown.map((b) => (
            <Line key={b.code} k={t(`contrib.${b.code}` as TranslationKey)} v={fmt.money(b.amount)} />
          ))}
          <Line k={t('breakdown.social')} v={fmt.money(y1.socialInsuranceAnnual)} />

          <Line k={t('breakdown.deduction')} v={fmt.money(y1.deductionAnnual)} />
          <Line k={t('breakdown.taxable')} v={fmt.money(y1.taxableAnnual)} />

          {/* Income tax by layer: federal / state-province / local / surtax / credits.
              所得税分层列出：联邦 / 州省 / 地方 / 附加税 / 抵免 */}
          {y1.taxBreakdown.map((c) => (
            <Line
              key={c.code}
              k={t(taxLayerKey(c.code, region.code))}
              v={`${c.amount < 0 ? '−' : ''}${fmt.money(Math.abs(c.amount))}`}
            />
          ))}
          <Line k={t('breakdown.tax')} v={fmt.money(y1.taxAnnual)} />
          <Line k={t('breakdown.effectiveRate')} v={fmt.percent(y1.effectiveTaxRate)} />
          <Line k={t('breakdown.burdenRate')} v={fmt.percent(y1.totalBurdenRate)} />

          {y1.bonusTaxStrategy && (
            <Line
              k={t('breakdown.bonusStrategy')}
              v={t(`breakdown.bonusStrategy.${y1.bonusTaxStrategy}` as TranslationKey)}
            />
          )}
          {y1.bonusTaxSaving !== undefined && y1.bonusTaxSaving > 0 && (
            <Line k={t('breakdown.bonusSaving')} v={fmt.money(y1.bonusTaxSaving)} />
          )}
        </div>
      </div>

      <div className="panel">
        <h3>{planName} · {t('breakdown.plan.title')}</h3>
        <div className="rows">
          <Line k={t('breakdown.plan.self')} v={fmt.money(m1.planSelf)} />
          <Line k={t('breakdown.plan.employer')} v={fmt.money(m1.planEmployer)} />
          {region.planWithdrawable && (
            <Line k={t('breakdown.plan.withdrawal')} v={fmt.money(m1.planWithdrawal)} />
          )}
          <Line k={t('breakdown.plan.balance', { years })} v={fmt.money(result.summary.finalPlanBalance)} />
          <Line k={t('breakdown.plan.totalWealth')} v={fmt.money(result.summary.finalTotalWealth)} />
          <Line k={t('breakdown.lastSalary')} v={fmt.money(last.monthlySalary)} />
          <Line k={t('breakdown.lastNet')} v={fmt.money(last.avgMonthlyNet)} />
          <Line k={t('breakdown.totalTax')} v={fmt.money(result.summary.totalTaxPaid)} />
          <Line k={t('breakdown.netReturn')} v={fmt.percent(result.summary.netAnnualReturn, 2)} />
        </div>
      </div>
    </div>
  );
}
