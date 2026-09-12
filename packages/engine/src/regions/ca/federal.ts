/**
 * 加拿大联邦个人所得税、CPP 与 EI。
 *
 * 联邦税率表由 `pnpm data:sync` 从 PolicyEngine 生成，按生效日期取值，
 * 因此能正确处理年中生效的变更：最低档联邦税率自 2025-07-01 起由 15% 降至 14%，
 * 2025 全年适用 14.5% 的混合税率，2026 起为 14%。
 *
 * **省级税率表不走同步**——上游的省级数据长期停留在 2022–2023 年，
 * 比本仓库手工核对的值还旧，盲目采信会造成倒退。见 provinces.ts。
 *
 * CPP/EI 的各项限额与基本个人金额目前仍为手工维护。
 */

import type { TaxBracket } from '../../types.js';
import type { Provenance } from '../../data/provenance.js';
import { calendarYear } from '../../data/provenance.js';
import { CA_GENERATED, restoreBrackets } from '../../data/generated/index.js';

export const CA_TAX_YEAR = 2026;
export const CA_DATA_SYNCED_AT = CA_GENERATED.syncedAt;

/**
 * 联邦税率表（2026 税年，手工维护）。
 *
 * **为什么不用同步值**：上游 PolicyEngine 的联邦表里，费率更新到了 2026（0.14），
 * 阈值却停留在 2025。取「不晚于目标年的最新值」就会把 2025 的阈值当成 2026 用——
 * 错得悄无声息。sync.ts 现在会逐字段检测并报警，但修复只能靠手工值。
 *
 * 这些数字可由 CRA 公布的 2026 年通胀指数化系数 2.0% 从 2025 值验算得出：
 *   57,375 × 1.02 = 58,523　114,750 × 1.02 = 117,045
 *   177,882 × 1.02 = 181,440　253,414 × 1.02 = 258,482
 * 四个阈值全部吻合，见 ca.test.ts 的指数化校验。
 */
export const FEDERAL_INDEXATION_2026 = 1.02;

export const FEDERAL_BRACKETS: readonly TaxBracket[] = [
  { upTo: 58_523, rate: 0.14 },
  { upTo: 117_045, rate: 0.205 },
  { upTo: 181_440, rate: 0.26 },
  { upTo: 258_482, rate: 0.29 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.33 },
];

/** 上一税年的联邦阈值，供指数化校验用 */
export const FEDERAL_BRACKETS_PREV_YEAR: readonly number[] = [57_375, 114_750, 177_882, 253_414];

/** 上游同步下来的联邦表，仅作交叉对照，不参与计算 */
export const FEDERAL_BRACKETS_UPSTREAM = restoreBrackets(CA_GENERATED.federalBrackets);

/**
 * CPP / EI / BPA 这批限额**每年都调**，且没有任何可自动同步的源：
 * PolicyEngine 的加拿大包里根本没有 CPP/EI 参数，CRA 只有 HTML 页面。
 *
 * 所以它们带独立的出处元数据，由 `pnpm data:audit` 在适用期结束后让 CI 变红——
 * 抓不到新值是一回事，静默地continue用旧值是另一回事。
 */
export const CA_PAYROLL_TAX_YEAR = 2026;

export const CA_PAYROLL_PROVENANCE: Provenance = {
  ...calendarYear(CA_PAYROLL_TAX_YEAR),
  sourceUrl:
    'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html',
  verifiedAt: '2026-09-12',
  confidence: 'verified',
  note: 'CPP/EI 各项限额与联邦基本个人金额为手工维护：上游 PolicyEngine 无 CPP/EI 参数，CRA 仅提供 HTML 页面',
};

/** 联邦基本个人金额（最高档，2026）。高收入者自 181,440 起递减至 14,829，此处不建模该递减。 */
export const FEDERAL_BPA = 16_452;

/* ------------------------------------------------------------ CPP / QPP */

/** 年度最高可计退休金收入 */
export const YMPE = 74_600;
/** 第二级最高可计退休金收入 */
export const YAMPE = 85_000;
/** 基本免征额 */
export const CPP_BASIC_EXEMPTION = 3_500;
export const CPP_RATE = 0.0595;
/** 魁北克使用 QPP，费率更高 */
export const QPP_RATE = 0.064;
/** CPP2：YMPE 与 YAMPE 之间的部分 */
export const CPP2_RATE = 0.04;

/* ---------------------------------------------------------------- EI */

export const EI_MAX_INSURABLE = 68_900;
export const EI_RATE = 0.0163;
/** 魁北克因另有 QPIP，EI 费率较低 */
export const EI_RATE_QC = 0.013;
/** 魁北克育儿保险 */
export const QPIP_RATE = 0.0043;
export const QPIP_MAX_INSURABLE = 103_000;

/** 魁北克居民的联邦税返还比例 */
export const QUEBEC_ABATEMENT = 0.165;

export interface PayrollResult {
  cpp: number;
  cpp2: number;
  ei: number;
  /** 魁北克育儿保险，其他省为 0 */
  qpip: number;
  total: number;
  cppCapped: boolean;
  eiCapped: boolean;
}

/**
 * CPP/QPP 与 EI 的员工缴款。
 *
 * CPP 有基本免征额（前 3,500 加元不计缴），这一点常被忽略；
 * 且 CPP 与 EI 各有独立的收入上限，超出后不再增加。
 */
export function computePayroll(grossAnnual: number, isQuebec: boolean): PayrollResult {
  const pensionable = Math.max(0, Math.min(grossAnnual, YMPE) - CPP_BASIC_EXEMPTION);
  const cpp = pensionable * (isQuebec ? QPP_RATE : CPP_RATE);

  const tier2 = Math.max(0, Math.min(grossAnnual, YAMPE) - YMPE);
  const cpp2 = tier2 * CPP2_RATE;

  const insurable = Math.min(grossAnnual, EI_MAX_INSURABLE);
  const ei = insurable * (isQuebec ? EI_RATE_QC : EI_RATE);

  const qpip = isQuebec ? Math.min(grossAnnual, QPIP_MAX_INSURABLE) * QPIP_RATE : 0;

  return {
    cpp,
    cpp2,
    ei,
    qpip,
    total: cpp + cpp2 + ei + qpip,
    cppCapped: grossAnnual > YAMPE,
    eiCapped: grossAnnual > EI_MAX_INSURABLE,
  };
}

/** RRSP 年度缴款上限：上年度收入的 18%，且不超过绝对上限 */
export const RRSP_RATE_LIMIT = 0.18;
export const RRSP_DOLLAR_LIMIT = 33_810;

export function rrspRoom(earnedIncome: number): number {
  return Math.min(earnedIncome * RRSP_RATE_LIMIT, RRSP_DOLLAR_LIMIT);
}
