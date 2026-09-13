/**
 * The region module interface: every country-specific difference is confined behind it, so
 * the generic flows stay region-agnostic.
 *
 * 地区模块接口：所有国别差异都收敛在这后面，通用流程与地区无关。
 */

import type {
  PlanCode,
  PlanGrowth,
  ProjectionInput,
  RegionCode,
  YearIncome,
} from '../types.js';
import type { Provenance } from '../data/provenance.js';

/**
 * A bilingual name. The engine does no translation — it carries both forms and lets the UI
 * pick whichever matches the active language.
 *
 * 双语名称。引擎不做翻译，只把两种写法都带上，由 UI 按当前语言取用。
 */
export interface LocalizedName {
  zh: string;
  en: string;
}

/** A jurisdiction: a Chinese city / US state / Canadian province. 辖区：中国的城市 / 美国的州 / 加拿大的省 */
export interface Jurisdiction {
  code: string;
  name: LocalizedName;
  /**
   * What the data covers and how it was verified; shown to the user verbatim.
   * 数据口径与核对方式，会原样展示给用户
   */
  note: LocalizedName;
}

export interface RegionModule {
  code: RegionCode;
  currency: string;
  currencySymbol: string;
  /** BCP 47 tag used for number formatting. 数字格式化用的 BCP 47 标签 */
  numberLocale: string;
  planCode: PlanCode;
  planGrowth: PlanGrowth;
  /**
   * Whether this region's savings plan supports withdrawals — only China's housing fund does.
   * 该地区的储蓄计划是否支持提取（只有中国公积金支持）
   */
  planWithdrawable: boolean;
  /**
   * The applicable tax year, surfaced in the UI to make data vintage explicit.
   * 适用的税年，用于在界面上明示数据时效
   */
  taxYear: number;
  jurisdictions: readonly Jurisdiction[];
  defaultJurisdiction: string;
  /**
   * Statutory annual contribution cap for the savings plan; undefined means uncapped.
   * 储蓄计划的法定年度缴纳上限；undefined 表示无上限
   */
  planAnnualLimit?: number;

  computeYear(input: ProjectionInput, year: number, monthlySalary: number): YearIncome;

  /**
   * Where this jurisdiction's current data came from, and how fresh it is.
   * The engine emits expiry warnings from this — it will never silently plan someone's next
   * decade off a contribution base from two years ago.
   *
   * 该辖区当前所用数据的出处与时效。
   * 引擎据此产出过期警告——绝不静默地拿两年前的缴费基数给人做十年期规划。
   */
  provenanceFor(jurisdiction: string): Provenance;
}

export function findJurisdiction(m: RegionModule, code: string): Jurisdiction {
  return (
    m.jurisdictions.find((j) => j.code === code) ??
    m.jurisdictions.find((j) => j.code === m.defaultJurisdiction) ??
    m.jurisdictions[0]!
  );
}
