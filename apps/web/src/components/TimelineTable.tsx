import type { MonteCarloResult, ProjectionResult } from '@pmp/engine';
import { useFormat } from '../hooks/useFormat.js';
import { useI18n } from '../i18n/index.js';
import type { ValueMode } from './FanChart.js';

/**
 * A table alternative for reading the charts.
 *
 * Both an accessibility requirement and one of the compensations for the aqua series falling short
 * of 3:1 contrast in light mode: any reader who can't distinguish the colors gets exactly the same
 * data here.
 *
 * 图表的表格替代读法。
 *
 * 既是无障碍要求，也是浅色模式下 aqua 系列未达 3:1 对比度所需的补偿手段之一：
 * 任何看不清颜色的读者都能从这里拿到完全相同的数据。
 */
export function TimelineTable({
  result, mc, mode,
}: { result: ProjectionResult; mc: MonteCarloResult | null; mode: ValueMode }) {
  const { t } = useI18n();
  const fmt = useFormat(result.input.region);
  const rate = result.input.inflation.annualRate;
  const adjust = (v: number, y: number) => (mode === 'real' ? v / Math.pow(1 + rate, y) : v);

  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">
          {t('table.caption')} · {mode === 'real' ? t('mode.real') : t('mode.nominal')}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('table.year')}</th>
            <th scope="col">{t('table.contribution')}</th>
            <th scope="col">P10</th>
            <th scope="col">P50</th>
            <th scope="col">P90</th>
          </tr>
        </thead>
        <tbody>
          {result.timeline.map((row) => {
            const pt = row.year === 0 ? null : mc?.byYear[row.year - 1];
            const p = pt ? (mode === 'real' ? pt.real : pt) : null;
            return (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                <td>{fmt.money(adjust(row.contribution, row.year))}</td>
                <td>{p ? fmt.money(p.p10) : '—'}</td>
                <td>{p ? fmt.money(p.p50) : fmt.money(adjust(row.value, row.year))}</td>
                <td>{p ? fmt.money(p.p90) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
