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

export const CA_TAX_YEAR = CA_GENERATED.taxYear;
export const CA_DATA_SYNCED_AT = CA_GENERATED.syncedAt;

/** 联邦税率表（同步自 PolicyEngine，按生效日期取当前税年的值） */
export const FEDERAL_BRACKETS: readonly TaxBracket[] = restoreBrackets(CA_GENERATED.federalBrackets);

/**
 * CPP / EI / BPA 这批限额**每年都调**，且没有任何可自动同步的源：
 * PolicyEngine 的加拿大包里根本没有 CPP/EI 参数，CRA 只有 HTML 页面。
 *
 * 所以它们带独立的出处元数据，由 `pnpm data:audit` 在适用期结束后让 CI 变红——
 * 抓不到新值是一回事，静默地continue用旧值是另一回事。
 */
export const CA_PAYROLL_TAX_YEAR = 2025;

export const CA_PAYROLL_PROVENANCE: Provenance = {
  ...calendarYear(CA_PAYROLL_TAX_YEAR),
  sourceUrl:
    'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html',
  verifiedAt: '2026-09-12',
  confidence: 'verified',
  note: 'CPP/EI 各项限额与联邦基本个人金额为手工维护：上游 PolicyEngine 无 CPP/EI 参数，CRA 仅提供 HTML 页面',
};

/** 联邦基本个人金额（最高档）。高收入者逐步递减至 14,538，此处不建模该递减。 */
export const FEDERAL_BPA = 16_129;

/* ------------------------------------------------------------ CPP / QPP */

/** 年度最高可计退休金收入 */
export const YMPE = 71_300;
/** 第二级最高可计退休金收入 */
export const YAMPE = 81_200;
/** 基本免征额 */
export const CPP_BASIC_EXEMPTION = 3_500;
export const CPP_RATE = 0.0595;
/** 魁北克使用 QPP，费率更高 */
export const QPP_RATE = 0.064;
/** CPP2：YMPE 与 YAMPE 之间的部分 */
export const CPP2_RATE = 0.04;

/* ---------------------------------------------------------------- EI */

export const EI_MAX_INSURABLE = 65_700;
export const EI_RATE = 0.0164;
/** 魁北克因另有 QPIP，EI 费率较低 */
export const EI_RATE_QC = 0.0131;
/** 魁北克育儿保险 */
export const QPIP_RATE = 0.00494;
export const QPIP_MAX_INSURABLE = 98_000;

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
export const RRSP_DOLLAR_LIMIT = 32_490;

export function rrspRoom(earnedIncome: number): number {
  return Math.min(earnedIncome * RRSP_RATE_LIMIT, RRSP_DOLLAR_LIMIT);
}
