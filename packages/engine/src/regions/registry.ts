/**
 * The region registry: generic flows reach the active region's implementation through it and
 * never depend on any specific country directly.
 *
 * 地区注册表：通用流程通过它拿到当前地区的实现，不直接依赖任何具体国家。
 */

import type { RegionCode } from '../types.js';
import type { Jurisdiction, RegionModule } from './types.js';
import { CN_REGION } from './cn/index.js';
import { US_REGION } from './us/index.js';
import { CA_REGION } from './ca/index.js';

export const REGIONS: Record<RegionCode, RegionModule> = {
  CN: CN_REGION,
  US: US_REGION,
  CA: CA_REGION,
};

export const REGION_CODES: readonly RegionCode[] = ['CN', 'US', 'CA'];

export function getRegion(code: RegionCode): RegionModule {
  return REGIONS[code] ?? CN_REGION;
}

export function getJurisdiction(code: RegionCode, jurisdiction: string): Jurisdiction {
  const region = getRegion(code);
  return (
    region.jurisdictions.find((j) => j.code === jurisdiction) ??
    region.jurisdictions.find((j) => j.code === region.defaultJurisdiction) ??
    region.jurisdictions[0]!
  );
}
