import type { MonteCarloResult, ProjectionResult } from '@pmp/engine';
import { money, percent } from '../lib/format.js';
import type { ValueMode } from './FanChart.js';

interface Props {
  result: ProjectionResult;
  mc: MonteCarloResult | null;
  mode: ValueMode;
}

export function MetricCards({ result, mc, mode }: Props) {
  const { summary, input } = result;
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
        <div className="k">首年月均到手</div>
        <div className="v">{money(summary.avgMonthlyNet)}</div>
        <p className="sub">已扣五险一金与个税</p>
      </div>
      <div className="metric">
        <div className="k">首月可投金额</div>
        <div className="v">{money(summary.monthlyInvestable)}</div>
        <p className="sub">随涨薪与开销通胀逐年变化</p>
      </div>
      <div className="metric">
        <div className="k">累计投入本金</div>
        <div className="v">{money(adjust(summary.totalContribution))}</div>
        <p className="sub">{years} 年合计，含初始本金</p>
      </div>
      <div className="metric">
        <div className="k">期末中位值 · P50</div>
        <div className="v">{money(median)}</div>
        <p className="sub">
          P10 {money(p10)} — P90 {money(p90)}
          {mc && ` · 亏损概率 ${percent(mc.lossProbability, 0)}`}
        </p>
      </div>
    </div>
  );
}
