import { useMemo } from 'react';
import { getRegion, type RegionCode } from '@pmp/engine';
import { makeFormatter, type Formatter } from '../lib/format.js';
import { useI18n } from '../i18n/index.js';

/**
 * Currency formatting follows the region and compact notation follows the language; the two are
 * orthogonal.
 *
 * 货币格式跟随地区、紧凑写法跟随语言，两者正交
 */
export function useFormat(region: RegionCode): Formatter {
  const { lang } = useI18n();
  return useMemo<Formatter>(() => makeFormatter(getRegion(region), lang), [region, lang]);
}
