import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_INPUT } from '@pmp/engine';
import { buildShareUrl, readInputFromUrl, type ProjectionInputDTO } from '@pmp/shared';
import { useProjection } from './hooks/useProjection.js';
import { applyTheme, loadLocalInput, loadTheme, saveLocalInput, saveTheme, type ThemePref } from './lib/storage.js';
import { money, percent } from './lib/format.js';
import { ControlPanel } from './components/ControlPanel.js';
import { MetricCards } from './components/MetricCards.js';
import { FanChart, type ValueMode } from './components/FanChart.js';
import { WaterfallChart, type WaterfallStep } from './components/WaterfallChart.js';
import { Breakdown } from './components/Breakdown.js';
import { TimelineTable } from './components/TimelineTable.js';
import { Warnings } from './components/Warnings.js';
import { SyncPanel } from './components/SyncPanel.js';
import { Disclaimer } from './components/Disclaimer.js';

/** 启动时的参数优先级：分享链接 > 本地存档 > 默认值 */
function initialInput(): ProjectionInputDTO {
  return readInputFromUrl(window.location.search) ?? loadLocalInput() ?? (DEFAULT_INPUT as ProjectionInputDTO);
}

export function App() {
  const [input, setInput] = useState<ProjectionInputDTO>(initialInput);
  const [mode, setMode] = useState<ValueMode>('nominal');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [theme, setTheme] = useState<ThemePref>(loadTheme);
  const [copied, setCopied] = useState(false);

  const { result, mc, mcPending } = useProjection(input);

  useEffect(() => { saveLocalInput(input); }, [input]);
  useEffect(() => { applyTheme(theme); saveTheme(theme); }, [theme]);

  const share = useCallback(async () => {
    const url = buildShareUrl(window.location.origin + window.location.pathname, input);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // 剪贴板被拒时退回地址栏，用户仍能手动复制
      window.history.replaceState(null, '', url);
    }
  }, [input]);

  const waterfall = useMemo<WaterfallStep[]>(() => {
    const y1 = result.years[0];
    const m1 = result.months[0];
    if (!y1 || !m1) return [];
    return [
      { label: '税前收入', value: y1.grossAnnual / 12, kind: 'total' },
      { label: '五险一金', value: -(m1.socialInsurance + m1.housingFundSelf), kind: 'decrease' },
      { label: '个税', value: -y1.taxAnnual / 12, kind: 'decrease' },
      { label: '到手现金', value: y1.avgMonthlyNet, kind: 'total' },
      { label: '餐补', value: m1.mealAllowance, kind: 'increase' },
      { label: '公积金提取', value: m1.housingFundWithdrawal, kind: 'increase' },
      { label: '生活开销', value: -m1.spend, kind: 'decrease' },
      { label: '每月可投', value: m1.invested, kind: 'result' },
    ];
  }, [result]);

  const terminal = mc
    ? mode === 'real'
      ? mc.byYear[mc.byYear.length - 1]?.real.p50 ?? 0
      : mc.terminal.p50
    : mode === 'real'
      ? result.summary.finalValueReal
      : result.summary.finalValue;

  return (
    <main className="wrap">
      <div className="topbar">
        <div>
          <h1>Personal Money Projection</h1>
          <p className="sub">
            从工资条到长期投资的个人财务投影。中国个税与五险一金按城市精算，
            结果同时给出名义金额与今日购买力两个口径，并用分布而不是单条曲线来表达不确定性。
          </p>
        </div>
        <div className="btn-row">
          <div className="toggle-group" role="group" aria-label="主题">
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>浅色</button>
            <button aria-pressed={theme === 'system'} onClick={() => setTheme('system')}>跟随系统</button>
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>深色</button>
          </div>
          <button onClick={() => void share()}>{copied ? '链接已复制' : '复制分享链接'}</button>
          <button onClick={() => setInput(DEFAULT_INPUT as ProjectionInputDTO)}>重置参数</button>
        </div>
      </div>

      <div className="layout">
        <ControlPanel input={input} onChange={setInput} />

        <div className="stack">
          <div>
            <div className="chart-head">
              <div className="toggle-group" role="group" aria-label="金额口径">
                <button aria-pressed={mode === 'nominal'} onClick={() => setMode('nominal')}>名义金额</button>
                <button aria-pressed={mode === 'real'} onClick={() => setMode('real')}>今日购买力</button>
              </div>
              <span className="muted">
                {mode === 'real'
                  ? `已按 ${percent(input.inflation.annualRate)} 年通胀折现`
                  : '未扣除通胀影响'}
              </span>
            </div>
            <MetricCards result={result} mc={mc} mode={mode} />
          </div>

          <Warnings items={result.warnings} />

          <section className="panel">
            <div className="chart-head">
              <h2 style={{ margin: 0 }}>
                账户价值投影
                {mcPending && <span className="muted" style={{ fontWeight: 400 }}> · 正在模拟…</span>}
              </h2>
              <div className="btn-row">
                <span className="pill">
                  {input.investment.years} 年后中位 {money(terminal)}
                </span>
                <div className="toggle-group" role="group" aria-label="展示方式">
                  <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>图表</button>
                  <button aria-pressed={view === 'table'} onClick={() => setView('table')}>表格</button>
                </div>
              </div>
            </div>

            {view === 'chart' ? (
              <FanChart timeline={result.timeline} mc={mc} mode={mode} inflationRate={input.inflation.annualRate} />
            ) : (
              <TimelineTable result={result} mc={mc} mode={mode} />
            )}

            <div className="legend">
              <span><i className="swatch" style={{ background: 'var(--series-1)' }} />账户价值 · 中位数</span>
              <span><i className="swatch band" style={{ background: 'var(--series-1)' }} />P10–P90 区间</span>
              <span><i className="swatch" style={{ background: 'var(--series-2)' }} />累计投入本金</span>
              {mc && <span className="muted">{mc.paths.toLocaleString('zh-CN')} 条模拟路径 · 固定随机种子，结果可复现</span>}
            </div>
          </section>

          <section className="panel">
            <div className="chart-head">
              <h2 style={{ margin: 0 }}>首月现金流分解</h2>
              <div className="legend">
                <span><i className="swatch" style={{ background: 'var(--series-1)' }} />小计</span>
                <span><i className="swatch" style={{ background: 'var(--series-2)' }} />扣减</span>
                <span><i className="swatch" style={{ background: 'var(--series-3)' }} />增项与结果</span>
              </div>
            </div>
            <WaterfallChart steps={waterfall} />
          </section>

          <Breakdown result={result} />

          <SyncPanel input={input} onLoad={setInput} />

          <Disclaimer city={input.city} />
        </div>
      </div>
    </main>
  );
}
