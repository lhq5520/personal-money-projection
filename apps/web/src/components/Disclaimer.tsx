import { getJurisdiction, getRegion, type RegionCode } from '@pmp/engine';
import { useI18n, type TranslationKey } from '../i18n/index.js';

export function Disclaimer({ region, jurisdiction }: { region: RegionCode; jurisdiction: string }) {
  const { t, name } = useI18n();
  const mod = getRegion(region);
  const j = getJurisdiction(region, jurisdiction);

  return (
    <p className="note">
      <strong>{t('disclaimer.model')}</strong> {t(`disclaimer.model.${region}` as TranslationKey)}{' '}
      {t('disclaimer.monthly')}
      {' '}
      {/* Separate with · rather than brackets or a colon: Chinese and English use different
          characters for both, and hard-coding either looks wrong in the other language.
          用 · 分隔而不是括号冒号：中英文的括号与冒号是不同字符，硬编码任何一种都会在另一种语言下出戏 */}
      <strong>{t('disclaimer.jurisdiction')}</strong> {name(j.name)} ·{' '}
      {t('region.taxYear', { year: mod.taxYear })} · {name(j.note)}
      {' '}
      <strong>{t('disclaimer.investment')}</strong> {t('disclaimer.investment.body')}
      {' '}
      <strong>{t('disclaimer.missing')}</strong> {t('disclaimer.missing.body')}
    </p>
  );
}
