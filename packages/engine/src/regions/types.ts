/** 地区模块接口：所有国别差异都收敛在这后面，通用流程与地区无关。 */

import type {
  PlanCode,
  PlanGrowth,
  ProjectionInput,
  RegionCode,
  YearIncome,
} from '../types.js';

/** 双语名称。引擎不做翻译，只把两种写法都带上，由 UI 按当前语言取用。 */
export interface LocalizedName {
  zh: string;
  en: string;
}

/** 辖区：中国的城市 / 美国的州 / 加拿大的省 */
export interface Jurisdiction {
  code: string;
  name: LocalizedName;
  /** 数据口径与核对方式，会原样展示给用户 */
  note: LocalizedName;
}

export interface RegionModule {
  code: RegionCode;
  currency: string;
  currencySymbol: string;
  /** 数字格式化用的 BCP 47 标签 */
  numberLocale: string;
  planCode: PlanCode;
  planGrowth: PlanGrowth;
  /** 该地区的储蓄计划是否支持提取（只有中国公积金支持） */
  planWithdrawable: boolean;
  /** 适用的税年，用于在界面上明示数据时效 */
  taxYear: number;
  jurisdictions: readonly Jurisdiction[];
  defaultJurisdiction: string;
  /** 储蓄计划的法定年度缴纳上限；undefined 表示无上限 */
  planAnnualLimit?: number;

  computeYear(input: ProjectionInput, year: number, monthlySalary: number): YearIncome;
}

export function findJurisdiction(m: RegionModule, code: string): Jurisdiction {
  return (
    m.jurisdictions.find((j) => j.code === code) ??
    m.jurisdictions.find((j) => j.code === m.defaultJurisdiction) ??
    m.jurisdictions[0]!
  );
}
