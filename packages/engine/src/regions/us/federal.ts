/**
 * 美国联邦个人所得税与 FICA（2025 税年）。
 *
 * ⚠️ 税率表与各项限额每年随通胀调整（IRS Rev. Proc. 公布）。
 * 下列数值为 2025 税年，请在使用前核对当年的官方数字。
 */

import type { TaxBracket, UsFilingStatus } from '../../types.js';

export const US_TAX_YEAR = 2025;

/** 联邦普通所得税率表。美国的表不使用速算扣除数，由引擎逐档累进计算。 */
export const FEDERAL_BRACKETS: Record<UsFilingStatus, readonly TaxBracket[]> = {
  single: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  'married-joint': [
    { upTo: 23_850, rate: 0.1 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  'married-separate': [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 375_800, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  'head-of-household': [
    { upTo: 17_000, rate: 0.1 },
    { upTo: 64_850, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_500, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
};

export const FEDERAL_STANDARD_DEDUCTION: Record<UsFilingStatus, number> = {
  single: 15_000,
  'married-joint': 30_000,
  'married-separate': 15_000,
  'head-of-household': 22_500,
};

/* --------------------------------------------------------------- FICA */

export const SOCIAL_SECURITY_RATE = 0.062;
/** 社会保障税的工资基数上限，每年调整 */
export const SOCIAL_SECURITY_WAGE_BASE = 176_100;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;

/** 附加医疗保险税的起征点（按申报身份） */
export const ADDITIONAL_MEDICARE_THRESHOLD: Record<UsFilingStatus, number> = {
  single: 200_000,
  'married-joint': 250_000,
  'married-separate': 125_000,
  'head-of-household': 200_000,
};

/** 401(k) 员工选择性递延的年度上限（不含 50 岁以上的追加额度） */
export const ELECTIVE_DEFERRAL_LIMIT = 23_500;

/* -------------------------------------------------------- 儿童税收抵免 */

export const CHILD_TAX_CREDIT_PER_CHILD = 2_000;
export const CHILD_TAX_CREDIT_PHASEOUT_START: Record<UsFilingStatus, number> = {
  single: 200_000,
  'married-joint': 400_000,
  'married-separate': 200_000,
  'head-of-household': 200_000,
};
/** 每超出 1000 美元减少 50 美元 */
const PHASEOUT_STEP = 1_000;
const PHASEOUT_REDUCTION = 50;

export function childTaxCredit(children: number, magi: number, status: UsFilingStatus): number {
  if (children <= 0) return 0;
  const full = children * CHILD_TAX_CREDIT_PER_CHILD;
  const start = CHILD_TAX_CREDIT_PHASEOUT_START[status];
  if (magi <= start) return full;
  const steps = Math.ceil((magi - start) / PHASEOUT_STEP);
  return Math.max(0, full - steps * PHASEOUT_REDUCTION);
}

export interface FicaResult {
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  total: number;
  /** 工资是否已触及社会保障税基数上限 */
  socialSecurityCapped: boolean;
}

/**
 * FICA 计算。
 *
 * 关键细节：401(k) **传统缴款不减少 FICA 税基**——它只降低联邦和州的所得税，
 * 这是很多计算器算错的地方。所以这里传入的是税前全额工资。
 */
export function computeFica(grossWages: number, status: UsFilingStatus): FicaResult {
  const ssBase = Math.min(grossWages, SOCIAL_SECURITY_WAGE_BASE);
  const socialSecurity = ssBase * SOCIAL_SECURITY_RATE;
  const medicare = grossWages * MEDICARE_RATE;

  const threshold = ADDITIONAL_MEDICARE_THRESHOLD[status];
  const additionalMedicare = Math.max(0, grossWages - threshold) * ADDITIONAL_MEDICARE_RATE;

  return {
    socialSecurity,
    medicare,
    additionalMedicare,
    total: socialSecurity + medicare + additionalMedicare,
    socialSecurityCapped: grossWages > SOCIAL_SECURITY_WAGE_BASE,
  };
}
