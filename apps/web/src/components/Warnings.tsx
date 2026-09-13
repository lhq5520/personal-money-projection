import { getJurisdiction, type ProjectionResult, type RegionCode } from '@pmp/engine';
import { useFormat } from '../hooks/useFormat.js';
import { useI18n, type TranslationKey } from '../i18n/index.js';

/**
 * The engine emits a structured code + params pair; translation happens here.
 * Amount-valued params only get currency formatting at this layer — the engine doesn't know, and
 * shouldn't know, which symbol to use.
 *
 * 引擎产出的是结构化的 code + 参数，翻译发生在这里。
 * 金额类参数在这一层才套上货币格式——引擎不知道也不该知道用什么符号。
 */
export function Warnings({ warnings, region }: { warnings: ProjectionResult['warnings']; region: RegionCode }) {
  const { t, name } = useI18n();
  const fmt = useFormat(region);
  if (warnings.length === 0) return null;

  /**
   * These params are amounts and need region-aware currency formatting; the rest (years, counts)
   * are interpolated as-is.
   *
   * 这些参数是金额，需要按地区货币格式化；其余（年份、条数）原样插值
   */
  const MONEY_PARAMS = new Set(['salary', 'requested', 'spend', 'disposable', 'amount', 'quota', 'limit']);

  return (
    <div className="warnings" role="status" aria-live="polite">
      {warnings.map((w) => {
        const params: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(w.params)) {
          if (MONEY_PARAMS.has(k) && typeof v === 'number') params[k] = fmt.money(v);
          else if (k === 'item') params[k] = t(`contrib.${v}` as TranslationKey);
          else if (k === 'plan') params[k] = t(`plan.${v}` as TranslationKey);
          // The engine only knows the jurisdiction code; swap in the current language's name for
          // display.
          // 引擎只知道辖区 code，展示时换成当前语言的名称
          else if (k === 'jurisdiction') params[k] = name(getJurisdiction(region, String(v)).name);
          else params[k] = v;
        }
        return (
          <div className="warn" key={`${w.code}-${JSON.stringify(w.params)}`}>
            {/* Icon + text, so status is never conveyed by color alone.
                图标 + 文字，不靠颜色单独传达状态 */}
            <span className="icon" aria-hidden="true">⚠</span>
            <span>{t(`warn.${w.code}` as TranslationKey, params)}</span>
          </div>
        );
      })}
    </div>
  );
}
