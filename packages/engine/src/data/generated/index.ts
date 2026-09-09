/**
 * 由 `pnpm data:sync` 从 PolicyEngine 生成的税率数据。
 *
 * **不要手工编辑这个目录下的 JSON**——下次同步会覆盖。
 * 需要修正请改上游，或在 regions/ 里显式覆盖并写明理由。
 */

import usRaw from './us.json' with { type: 'json' };
import caRaw from './ca.json' with { type: 'json' };

export interface GeneratedBracket {
  /** null 表示无上界（JSON 不支持 Infinity），读取时还原 */
  upTo: number | null;
  rate: number;
}

interface GeneratedUs {
  taxYear: number;
  syncedAt: string;
  source: string;
  brackets: Record<string, GeneratedBracket[]>;
  standardDeduction: Record<string, number>;
  socialSecurityWageBase: number;
}

interface GeneratedCa {
  taxYear: number;
  syncedAt: string;
  source: string;
  federalBrackets: GeneratedBracket[];
  provincialBrackets: Record<string, GeneratedBracket[]>;
}

/** JSON 里的 null 上界还原为 Infinity */
export function restoreBrackets(rows: readonly GeneratedBracket[]): { upTo: number; rate: number }[] {
  return rows.map((b) => ({ upTo: b.upTo ?? Number.POSITIVE_INFINITY, rate: b.rate }));
}

export const US_GENERATED = usRaw as GeneratedUs;
export const CA_GENERATED = caRaw as GeneratedCa;
