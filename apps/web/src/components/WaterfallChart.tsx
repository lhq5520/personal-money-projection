import { useState } from 'react';
import type { RegionCode } from '@pmp/engine';
import { niceTicks } from '../lib/format.js';
import { useFormat } from '../hooks/useFormat.js';
import { useMeasure } from '../hooks/useMeasure.js';
import { useI18n } from '../i18n/index.js';

export type StepKind = 'total' | 'increase' | 'decrease' | 'result';

export interface WaterfallStep {
  label: string;
  /**
   * Increase/decrease items carry a signed delta; subtotal and result items carry an absolute value.
   * 增减项为带符号的变化量；小计与结果项为绝对值
   */
  value: number;
  kind: StepKind;
}

const PAD = { l: 58, r: 12, t: 26, b: 42 };
const HEIGHT = 300;
const GAP = 2; // 2px of background between adjacent bars so the blocks don't smear together 相邻柱之间留 2px 背景色缝隙，避免色块糊在一起

const FILL: Record<StepKind, string> = {
  total: 'var(--series-1)',
  increase: 'var(--series-3)',
  decrease: 'var(--series-2)',
  result: 'var(--series-3)',
};

/**
 * The cash-flow waterfall: gross → social insurance → income tax → take-home → allowance →
 * spending → investable.
 *
 * Every bar carries a visible direct value label — both for legibility and as the compensation
 * required by aqua's 2.74 contrast falling short of 3:1 in light mode.
 *
 * 现金流瀑布图：税前 → 五险一金 → 个税 → 到手 → 补贴 → 开销 → 可投。
 *
 * 每根柱都带可见数值直标——既是易读性需要，也是浅色模式下
 * aqua 对比度 2.74 未达 3:1 所要求的补偿手段。
 */
export function WaterfallChart({ steps, region }: { steps: WaterfallStep[]; region: RegionCode }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { t } = useI18n();
  const fmt = useFormat(region);

  const innerW = Math.max(120, width - PAD.l - PAD.r);
  const innerH = HEIGHT - PAD.t - PAD.b;

  // Accumulate step by step to get each bar's start and end position.
  // 逐步累加出每根柱的起止位置
  let running = 0;
  const bars = steps.map((s) => {
    const isAnchor = s.kind === 'total' || s.kind === 'result';
    const from = isAnchor ? 0 : running;
    const to = isAnchor ? s.value : running + s.value;
    running = to;
    return { ...s, from, to };
  });

  // Monthly cash flow naturally sits in the thousands, and abbreviating to 万 would flatten both
  // 18,250 and 15,003 into "2万" — so this chart's axis and labels always use full grouped numbers.
  // 月度现金流天然在千元量级，用「万」缩写会把 18250 和 15003 都压成「2万」，
  // 所以这张图的轴和直标一律用带千分位的完整数字。
  const ticks = niceTicks(Math.max(1, ...bars.map((b) => Math.max(b.from, b.to))), 4);
  const maxY = ticks[ticks.length - 1]!;
  const bandW = innerW / Math.max(1, bars.length);
  const barW = Math.max(8, bandW - GAP * 2);
  const yScale = (v: number) => PAD.t + innerH - (v / maxY) * innerH;
  const cx = (i: number) => PAD.l + bandW * i + bandW / 2;


  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart-svg"
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={t('waterfall.aria')}
      >
        {ticks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={PAD.l + innerW} y1={yScale(tick)} y2={yScale(tick)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={PAD.l - 8} y={yScale(tick) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {fmt.plain(tick)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const top = yScale(Math.max(b.from, b.to));
          const h = Math.max(2, Math.abs(yScale(b.from) - yScale(b.to)));
          return (
            <g key={b.label}>
              {/* Connector line carrying the previous bar's end across to the next bar's start.
                  连接线，把上一根柱的终点引到下一根柱的起点 */}
              {i > 0 && (
                <line
                  x1={cx(i - 1) + barW / 2}
                  x2={cx(i) - barW / 2}
                  y1={yScale(bars[i - 1]!.to)}
                  y2={yScale(bars[i - 1]!.to)}
                  stroke="var(--axis)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
              <rect
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={3}
                fill={FILL[b.kind]}
                opacity={hover === null || hover === i ? 1 : 0.55}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              {/* Direct labels: value above the bar, caption below the axis.
                  直标：数值在柱顶，标签在轴下 */}
              <text x={cx(i)} y={top - 7} textAnchor="middle" fontSize={11} fill="var(--text-primary)" fontVariant="tabular-nums">
                {b.kind === 'decrease' ? '−' : ''}
                {fmt.plain(Math.abs(b.value))}
              </text>
              <text x={cx(i)} y={HEIGHT - 24} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
                {b.label}
              </text>
            </g>
          );
        })}

        <line x1={PAD.l} x2={PAD.l + innerW} y1={PAD.t + innerH} y2={PAD.t + innerH} stroke="var(--axis)" strokeWidth={1} />
      </svg>

      {hover !== null && bars[hover] && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(cx(hover) - 80, 8), Math.max(8, width - 170)), top: 4 }}
        >
          <div className="t-title">{bars[hover]!.label}</div>
          <div className="t-row">
            <span>
              {bars[hover]!.kind === 'decrease'
                ? t('waterfall.tooltip.decrease')
                : bars[hover]!.kind === 'increase'
                  ? t('waterfall.tooltip.increase')
                  : t('waterfall.tooltip.subtotal')}
            </span>
            <strong>
              {bars[hover]!.kind === 'decrease' ? '−' : ''}
              {fmt.money(Math.abs(bars[hover]!.value))}
            </strong>
          </div>
          <div className="t-row"><span>{t('waterfall.tooltip.running')}</span><strong>{fmt.money(bars[hover]!.to)}</strong></div>
        </div>
      )}
    </div>
  );
}
