import { useMemo, useState } from 'react';
import type { MonteCarloResult, RegionCode, YearPoint } from '@pmp/engine';
import { niceTicks } from '../lib/format.js';
import { useFormat } from '../hooks/useFormat.js';
import { useMeasure } from '../hooks/useMeasure.js';
import { useI18n } from '../i18n/index.js';

export type ValueMode = 'nominal' | 'real';

interface Props {
  timeline: YearPoint[];
  mc: MonteCarloResult | null;
  mode: ValueMode;
  inflationRate: number;
  region: RegionCode;
}

const PAD = { l: 62, r: 92, t: 16, b: 30 };
const HEIGHT = 340;

/**
 * The percentile fan chart.
 *
 * Replaces the prototype page's single deterministic curve: a range is the honest answer to this
 * question. The two solid lines are two distinct entities (account value / principal contributed)
 * and therefore get two categorical color slots. The fan band is not a third entity but the
 * uncertainty of "account value" itself, so it shares the median line's color and only drops in
 * opacity.
 *
 * 分位数扇形图。
 *
 * 取代原型页面的单条确定性曲线：区间才是这个问题的诚实答案。
 * 两条实线是两个不同的实体（账户价值 / 投入本金），因此用两个分类色槽；
 * 扇形区间不是第三个实体，而是「账户价值」自身的不确定性，
 * 所以与中位线同色、只降透明度。
 */
export function FanChart({ timeline, mc, mode, inflationRate, region }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { t } = useI18n();
  const fmt = useFormat(region);

  const years = timeline.length - 1;
  const innerW = Math.max(120, width - PAD.l - PAD.r);
  const innerH = HEIGHT - PAD.t - PAD.b;

  const series = useMemo(() => {
    const discount = (v: number, y: number) =>
      mode === 'real' ? v / Math.pow(1 + inflationRate, y) : v;

    const contribution = timeline.map((p, y) => discount(p.contribution, y));
    const median: number[] = [timeline[0]?.contribution ?? 0];
    const lo10: number[] = [median[0]!];
    const hi90: number[] = [median[0]!];
    const lo25: number[] = [median[0]!];
    const hi75: number[] = [median[0]!];

    for (let y = 1; y <= years; y++) {
      const pt = mc?.byYear[y - 1];
      if (pt) {
        const p = mode === 'real' ? pt.real : pt;
        median.push(p.p50);
        lo10.push(p.p10);
        hi90.push(p.p90);
        lo25.push(p.p25);
        hi75.push(p.p75);
      } else {
        // While the Monte Carlo is still running, stand in with the deterministic path so the
        // chart doesn't flicker.
        // 蒙特卡洛尚未算完时先用确定性路径占位，避免图表闪烁
        const v = discount(timeline[y]?.value ?? 0, y);
        median.push(v); lo10.push(v); hi90.push(v); lo25.push(v); hi75.push(v);
      }
    }
    return { contribution, median, lo10, hi90, lo25, hi75 };
  }, [timeline, mc, mode, inflationRate, years]);

  // Compute the ticks first, then align the top of the range to the last tick — that way the axis
  // never ends on a half-finished number.
  // 刻度先算好，再把量程顶端对齐到最后一个刻度，轴上就不会出现半截数字
  const ticks = niceTicks(Math.max(1, ...series.hi90, ...series.contribution));
  const maxY = ticks[ticks.length - 1]!;
  const x = (y: number) => PAD.l + (years === 0 ? 0 : (y / years) * innerW);
  const yScale = (v: number) => PAD.t + innerH - (v / maxY) * innerH;

  const line = (vals: number[]) => vals.map((v, y) => `${y ? 'L' : 'M'}${x(y)},${yScale(v)}`).join(' ');
  const band = (lo: number[], hi: number[]) =>
    `${hi.map((v, y) => `${y ? 'L' : 'M'}${x(y)},${yScale(v)}`).join(' ')} ` +
    `${lo.map((_, y) => `L${x(lo.length - 1 - y)},${yScale(lo[lo.length - 1 - y]!)}`).join(' ')} Z`;

  const yearTicks = Array.from({ length: years + 1 }, (_, i) => i).filter(
    (i) => i === 0 || i === years || i % Math.max(1, Math.round(years / 6)) === 0,
  );

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.round(((e.clientX - rect.left - PAD.l) / innerW) * years);
    setHover(y >= 0 && y <= years ? y : null);
  };

  const suffix = mode === 'real' ? ` · ${t('mode.real')}` : '';

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart-svg"
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={t('chart.aria.fan', { years })}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={PAD.l + innerW} y1={yScale(tick)} y2={yScale(tick)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={PAD.l - 8} y={yScale(tick) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {fmt.compact(tick)}
            </text>
          </g>
        ))}

        <path d={band(series.lo10, series.hi90)} fill="var(--series-1)" opacity={0.14} />
        <path d={band(series.lo25, series.hi75)} fill="var(--series-1)" opacity={0.26} />

        <path d={line(series.contribution)} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
        <path d={line(series.median)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />

        {/* Label the end of each line directly, so the reader isn't bouncing between legend and
            curve. 直接标注末端，读者不必在图例和曲线之间来回找 */}
        <text x={x(years) + 7} y={yScale(series.median[years]!) + 4} fontSize={11.5} fill="var(--text-secondary)">
          {t('chart.series.value')}
        </text>
        <text x={x(years) + 7} y={yScale(series.contribution[years]!) + 4} fontSize={11.5} fill="var(--text-secondary)">
          {t('chart.series.contributionShort')}
        </text>

        <line x1={PAD.l} x2={PAD.l + innerW} y1={PAD.t + innerH} y2={PAD.t + innerH} stroke="var(--axis)" strokeWidth={1} />
        {yearTicks.map((y) => (
          <text key={y} x={x(y)} y={HEIGHT - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
            {t('chart.axis.year', { n: y })}
          </text>
        ))}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--axis)" strokeWidth={1} />
            {/* A 2px stroke in the background color separates the marker from the curve and band
                beneath it. 2px 同背景色描边，让标记点从下方的曲线和色带里分离出来 */}
            <circle cx={x(hover)} cy={yScale(series.median[hover]!)} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={x(hover)} cy={yScale(series.contribution[hover]!)} r={5} fill="var(--series-2)" stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(x(hover) + 12, 8), Math.max(8, width - 210)), top: PAD.t + 4 }}
        >
          <div className="t-title">{t('chart.axis.year', { n: hover })}{suffix}</div>
          <div className="t-row"><span>{t('chart.tooltip.p90')}</span><strong>{fmt.money(series.hi90[hover]!)}</strong></div>
          <div className="t-row"><span>{t('chart.tooltip.p50')}</span><strong>{fmt.money(series.median[hover]!)}</strong></div>
          <div className="t-row"><span>{t('chart.tooltip.p10')}</span><strong>{fmt.money(series.lo10[hover]!)}</strong></div>
          <div className="t-row"><span>{t('chart.series.contributionShort')}</span><strong>{fmt.money(series.contribution[hover]!)}</strong></div>
        </div>
      )}
    </div>
  );
}
