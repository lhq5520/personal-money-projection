import type { MonteCarloResult, ProjectionResult } from '@pmp/engine';
import { useFormat } from '../hooks/useFormat.js';
import { useI18n } from '../i18n/index.js';
import type { ValueMode } from './FanChart.js';

interface Props {
  result: ProjectionResult;
  mc: MonteCarloResult | null;
  mode: ValueMode;
}

export function MetricCards({ result, mc, mode }: Props) {
  const { t } = useI18n();
  const { summary, input } = result;
  const fmt = useFormat(input.region);
  const years = input.investment.years;
  const deflator = Math.pow(1 + input.inflation.annualRate, years);
  const adjust = (v: number) => (mode === 'real' ? v / deflator : v);

  // mc.terminal 是名义口径的分位数，实际购买力口径统一在这里折现
  const median = mc ? adjust(mc.terminal.p50) : adjust(summary.finalValue);
  const p10 = mc ? adjust(mc.terminal.p10) : median;
  const p90 = mc ? adjust(mc.terminal.p90) : median;

  return (
    <div className="cards">
      <div className="metric">
        <div className="k">{t('metric.netMonthly')}</div>
        <div className="v">{fmt.money(summary.avgMonthlyNet)}</div>
        <p className="sub">{t('metric.netMonthly.sub')}</p>
      </div>
      <div className="metric">
        <div className="k">{t('metric.investable')}</div>
        <div className="v">{fmt.money(summary.monthlyInvestable)}</div>
        <p className="sub">{t('metric.investable.sub')}</p>
      </div>
      <div className="metric">
        <div className="k">{t('metric.contribution')}</div>
        <div className="v">{fmt.money(adjust(summary.totalContribution))}</div>
        <p className="sub">{t('metric.contribution.sub', { years })}</p>
      </div>
      <div className="metric">
        <div className="k">{t('metric.terminal')}</div>
        <div className="v">{fmt.money(median)}</div>
        <p className="sub">
          {t('metric.terminal.sub', { p10: fmt.money(p10), p90: fmt.money(p90) })}
          {mc && ` · ${t('metric.terminal.loss', { rate: fmt.percent(mc.lossProbability, 0) })}`}
        </p>
      </div>
    </div>
  );
}
