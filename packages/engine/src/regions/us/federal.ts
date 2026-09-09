/**
 * 美国联邦个人所得税与 FICA。
 *
 * 税率表、标准扣除与社保工资基数上限**不再硬编码**，而是由
 * `pnpm data:sync` 从 PolicyEngine 拉取后生成到 data/generated/us.json。
 * 那份数据按生效日期分版本、带法条引用，能正确反映年中生效的变更——
 * 例如 2025 年 7 月 OBBBA 追溯把单身标准扣除由 15,000 提高到 15,750。
 *
 * 仍然硬编码在本文件里的是**税法结构**（费率、起征点规则、抵免公式），
 * 这些变动频率远低于金额，且变动时需要改代码而不只是改数字。
 */

import type { TaxBracket, UsFilingStatus } from '../../types.js';
import { US_GENERATED, restoreBrackets } from '../../data/generated/index.js';

export const US_TAX_YEAR = US_GENERATED.taxYear;
export const US_DATA_SYNCED_AT = US_GENERATED.syncedAt;

/** 联邦普通所得税率表。美国的表不使用速算扣除数，由引擎逐档累进计算。 */
export const FEDERAL_BRACKETS: Record<UsFilingStatus, readonly TaxBracket[]> = {
  single: restoreBrackets(US_GENERATED.brackets.single ?? []),
  'married-joint': restoreBrackets(US_GENERATED.brackets['married-joint'] ?? []),
  'married-separate': restoreBrackets(US_GENERATED.brackets['married-separate'] ?? []),
  'head-of-household': restoreBrackets(US_GENERATED.brackets['head-of-household'] ?? []),
};

export const FEDERAL_STANDARD_DEDUCTION: Record<UsFilingStatus, number> = {
  single: US_GENERATED.standardDeduction.single!,
  'married-joint': US_GENERATED.standardDeduction['married-joint']!,
  'married-separate': US_GENERATED.standardDeduction['married-separate']!,
  'head-of-household': US_GENERATED.standardDeduction['head-of-household']!,
};

/* --------------------------------------------------------------- FICA */

export const SOCIAL_SECURITY_RATE = 0.062;
/** 社会保障税的工资基数上限，每年随全国平均工资指数调整 */
export const SOCIAL_SECURITY_WAGE_BASE = US_GENERATED.socialSecurityWageBase;
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
