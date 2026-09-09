import { checkFreshness, getRegion, type RegionCode } from '@pmp/engine';
import { useI18n, type TranslationKey } from '../i18n/index.js';

/**
 * 数据口径徽标。
 *
 * 一个财务工具最容易骗人的地方，不是算错，而是拿两年前的参数算得一丝不苟。
 * 所以「这个数字有多新」必须和数字本身一样显眼，而不是藏在免责声明的第三段里。
 */
export function DataBadge({ region, jurisdiction }: { region: RegionCode; jurisdiction: string }) {
  const { t } = useI18n();
  const p = getRegion(region).provenanceFor(jurisdiction);
  const f = checkFreshness(p, new Date());

  const tone = f.expired ? 'bad' : p.confidence === 'verified' ? 'good' : 'warn';
  const label = f.expired ? t('data.expired') : t(`data.${p.confidence}` as TranslationKey);

  const detail = [
    p.effectiveTo ? t('data.effective', { from: p.effectiveFrom, to: p.effectiveTo }) : null,
    t('data.verifiedAt', { date: p.verifiedAt }),
    p.note,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span className={`data-badge ${tone}`} title={detail}>
      {/* 图标 + 文字，状态不靠颜色单独传达 */}
      <span aria-hidden="true">{f.expired ? '⚠' : p.confidence === 'verified' ? '✓' : '~'}</span>
      <span>
        {t('data.freshness')}: {label}
      </span>
      {p.sourceUrl && (
        <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener">
          {new URL(p.sourceUrl).hostname}
        </a>
      )}
    </span>
  );
}
