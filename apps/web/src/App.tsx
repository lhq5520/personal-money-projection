import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultInput, getRegion } from '@pmp/engine';
import { buildShareUrl, readInputFromUrl, type ProjectionInputDTO } from '@pmp/shared';
import { useProjection } from './hooks/useProjection.js';
import { useFormat } from './hooks/useFormat.js';
import { applyTheme, loadLocalInput, loadTheme, saveLocalInput, saveTheme, type ThemePref } from './lib/storage.js';
import { LANGS, useI18n, type TranslationKey } from './i18n/index.js';
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
  return readInputFromUrl(window.location.search) ?? loadLocalInput() ?? (defaultInput('CN') as ProjectionInputDTO);
}

export function App() {
  const { t, lang, setLang } = useI18n();
  const [input, setInput] = useState<ProjectionInputDTO>(initialInput);
  const [mode, setMode] = useState<ValueMode>('nominal');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [theme, setTheme] = useState<ThemePref>(loadTheme);
  const [copied, setCopied] = useState(false);

  const { result, mc, mcPending } = useProjection(input);
  const fmt = useFormat(input.region);
  const region = getRegion(input.region);

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
    const steps: WaterfallStep[] = [
      { label: t('waterfall.gross'), value: y1.grossAnnual / 12, kind: 'total' },
      { label: t(`waterfall.social.${input.region}` as TranslationKey), value: -(m1.socialInsurance + m1.planSelf), kind: 'decrease' },
      { label: t('waterfall.tax'), value: -y1.taxAnnual / 12, kind: 'decrease' },
      { label: t('waterfall.net'), value: y1.avgMonthlyNet, kind: 'total' },
    ];
    // 只在实际存在时才占一格，避免图上出现一堆高度为 0 的柱子
    if (m1.taxFreeAllowance > 0) {
      steps.push({ label: t('waterfall.allowance'), value: m1.taxFreeAllowance, kind: 'increase' });
    }
    if (m1.planWithdrawal > 0) {
      steps.push({ label: t('waterfall.withdrawal'), value: m1.planWithdrawal, kind: 'increase' });
    }
    steps.push(
      { label: t('waterfall.spend'), value: -m1.spend, kind: 'decrease' },
      { label: t('waterfall.investable'), value: m1.invested, kind: 'result' },
    );
    return steps;
  }, [result, input.region, t]);

  const terminal = mc
    ? mode === 'real'
      ? (mc.byYear[mc.byYear.length - 1]?.real.p50 ?? 0)
      : mc.terminal.p50
    : mode === 'real'
      ? result.summary.finalValueReal
      : result.summary.finalValue;

  return (
    <main className="wrap">
      <div className="topbar">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="sub">{t('app.subtitle')}</p>
        </div>
        <div className="btn-row">
          <div className="toggle-group" role="group" aria-label={t('nav.lang')}>
            {LANGS.map((l) => (
              <button key={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="toggle-group" role="group" aria-label={t('nav.theme')}>
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>{t('nav.theme.light')}</button>
            <button aria-pressed={theme === 'system'} onClick={() => setTheme('system')}>{t('nav.theme.system')}</button>
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>{t('nav.theme.dark')}</button>
          </div>
          <button onClick={() => void share()}>{copied ? t('nav.shared') : t('nav.share')}</button>
          <button onClick={() => setInput(defaultInput(input.region) as ProjectionInputDTO)}>
            {t('nav.reset')}
          </button>
        </div>
      </div>

      <div className="layout">
        <ControlPanel input={input} onChange={setInput} />

        <div className="stack">
          <div>
            <div className="chart-head">
              <div className="toggle-group" role="group" aria-label={t('mode.nominal')}>
                <button aria-pressed={mode === 'nominal'} onClick={() => setMode('nominal')}>{t('mode.nominal')}</button>
                <button aria-pressed={mode === 'real'} onClick={() => setMode('real')}>{t('mode.real')}</button>
              </div>
              <span className="muted">
                {mode === 'real'
                  ? t('mode.realNote', { rate: fmt.percent(input.inflation.annualRate) })
                  : t('mode.nominalNote')}
              </span>
            </div>
            <MetricCards result={result} mc={mc} mode={mode} />
          </div>

          <Warnings warnings={result.warnings} region={input.region} />

          <section className="panel">
            <div className="chart-head">
              <h2 style={{ margin: 0 }}>
                {t('chart.title')}
                {mcPending && <span className="muted" style={{ fontWeight: 400 }}> · {t('chart.simulating')}</span>}
              </h2>
              <div className="btn-row">
                <span className="pill">
                  {t('chart.terminalPill', { years: input.investment.years, value: fmt.money(terminal) })}
                </span>
                <div className="toggle-group" role="group" aria-label={t('chart.view.chart')}>
                  <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>{t('chart.view.chart')}</button>
                  <button aria-pressed={view === 'table'} onClick={() => setView('table')}>{t('chart.view.table')}</button>
                </div>
              </div>
            </div>

            {view === 'chart' ? (
              <FanChart
                timeline={result.timeline}
                mc={mc}
                mode={mode}
                inflationRate={input.inflation.annualRate}
                region={input.region}
              />
            ) : (
              <TimelineTable result={result} mc={mc} mode={mode} />
            )}

            <div className="legend">
              <span><i className="swatch" style={{ background: 'var(--series-1)' }} />{t('chart.series.median')}</span>
              <span><i className="swatch band" style={{ background: 'var(--series-1)' }} />{t('chart.series.band')}</span>
              <span><i className="swatch" style={{ background: 'var(--series-2)' }} />{t('chart.series.contribution')}</span>
              {mc && <span className="muted">{t('chart.paths', { paths: mc.paths.toLocaleString(region.numberLocale) })}</span>}
            </div>
          </section>

          <section className="panel">
            <div className="chart-head">
              <h2 style={{ margin: 0 }}>{t('waterfall.title')}</h2>
              <div className="legend">
                <span><i className="swatch" style={{ background: 'var(--series-1)' }} />{t('waterfall.legend.subtotal')}</span>
                <span><i className="swatch" style={{ background: 'var(--series-2)' }} />{t('waterfall.legend.decrease')}</span>
                <span><i className="swatch" style={{ background: 'var(--series-3)' }} />{t('waterfall.legend.increase')}</span>
              </div>
            </div>
            <WaterfallChart steps={waterfall} region={input.region} />
          </section>

          <Breakdown result={result} />

          <SyncPanel input={input} onLoad={setInput} />

          <Disclaimer region={input.region} jurisdiction={input.jurisdiction} />
        </div>
      </div>
    </main>
  );
}
