/**
 * Canadian provincial income tax (2026 tax year).
 *
 * Data comes from the CRA's official "Current year tax rates and income brackets" page, with
 * Quebec from Revenu Québec (the CRA does not administer Quebec tax). Basic Personal Amounts
 * come from the TaxTips summary.
 *
 * **Maintained by hand**: upstream PolicyEngine's provincial data has been stuck on 2022–2023
 * for a long time, so syncing would be a regression; `pnpm data:sync` actively flags it in red
 * as not to be trusted. After an update, the bracket monotonicity and magnitude checks in
 * ca.test.ts are the guardrail.
 *
 * ⚠️ Precision note:
 * Ontario's surtax matters materially and is modeled; the Ontario Health Premium (up to CAD
 * 900) and assorted small provincial credits are not. Quebec runs its own tax system with a
 * federal abatement, handled separately.
 *
 * 加拿大省级个人所得税（2026 税年）。
 *
 * 数据来自 CRA「Current year tax rates and income brackets」官方页面，
 * 魁北克来自 Revenu Québec（CRA 不代管魁北克税）。基本个人金额来自 TaxTips 汇总。
 *
 * **手工维护**：上游 PolicyEngine 的省级数据长期停留在 2022–2023 年，
 * 同步反而是倒退；`pnpm data:sync` 会主动标红警告不要采信。
 * 更新后由 ca.test.ts 的分档单调性与量级校验把关。
 *
 * ⚠️ 精度声明：
 * 安大略省的附加税（surtax）影响显著，已建模；安省健康保费（最高 900 加元）
 * 与各省的其他小额抵免未建模。魁北克使用独立税制，另有联邦返还，已单独处理。
 */

import type { TaxBracket } from '../../types.js';
import type { LocalizedName } from '../types.js';

export interface ProvinceTax {
  code: string;
  name: LocalizedName;
  brackets: readonly TaxBracket[];
  /**
   * Provincial Basic Personal Amount, converted into a non-refundable credit at the lowest
   * bracket rate.
   * 省级基本个人金额，按最低档税率折算为不可退还抵免
   */
  bpa: number;
  /**
   * Provincial surtax: a further tax on the provincial tax itself, above a threshold.
   * Only Ontario has a material effect today.
   *
   * 省级附加税：对超出门槛的省税本身再征税。
   * 目前只有安大略省有实质影响。
   */
  surtax?: { threshold: number; rate: number }[];
  isQuebec?: boolean;
}

const INF = Number.POSITIVE_INFINITY;

export const CA_PROVINCES: readonly ProvinceTax[] = [
  {
    code: 'ON',
    name: { zh: '安大略', en: 'Ontario' },
    brackets: [
      { upTo: 53_891, rate: 0.0505 },
      { upTo: 107_785, rate: 0.0915 },
      { upTo: 150_000, rate: 0.1116 },
      { upTo: 220_000, rate: 0.1216 },
      { upTo: INF, rate: 0.1316 },
    ],
    bpa: 12_989,
    // Ontario's surtax is levied on the provincial tax amount, not on income, and the two
    // tiers stack. Thresholds drift up each year with Ontario's 1.9% indexation factor:
    // 5,710 × 1.019 = 5,818 and 7,307 × 1.019 = 7,446.
    // 安省附加税按「省税额」而非收入计征，两档叠加
    // 门槛随安省 1.9% 的指数化系数逐年上移：5,710 × 1.019 = 5,818，7,307 × 1.019 = 7,446
    surtax: [
      { threshold: 5_818, rate: 0.2 },
      { threshold: 7_446, rate: 0.36 },
    ],
  },
  {
    code: 'BC',
    name: { zh: '不列颠哥伦比亚', en: 'British Columbia' },
    brackets: [
      { upTo: 50_363, rate: 0.056 },
      { upTo: 100_728, rate: 0.077 },
      { upTo: 115_648, rate: 0.105 },
      { upTo: 140_430, rate: 0.1229 },
      { upTo: 190_405, rate: 0.147 },
      { upTo: 265_545, rate: 0.168 },
      { upTo: INF, rate: 0.205 },
    ],
    bpa: 13_216,
  },
  {
    code: 'AB',
    name: { zh: '艾伯塔', en: 'Alberta' },
    brackets: [
      { upTo: 61_200, rate: 0.08 },
      { upTo: 154_259, rate: 0.1 },
      { upTo: 185_111, rate: 0.12 },
      { upTo: 246_813, rate: 0.13 },
      { upTo: 370_220, rate: 0.14 },
      { upTo: INF, rate: 0.15 },
    ],
    bpa: 22_769,
  },
  {
    code: 'QC',
    name: { zh: '魁北克', en: 'Quebec' },
    brackets: [
      { upTo: 54_345, rate: 0.14 },
      { upTo: 108_680, rate: 0.19 },
      { upTo: 132_245, rate: 0.24 },
      { upTo: INF, rate: 0.2575 },
    ],
    bpa: 18_952,
    isQuebec: true,
  },
  {
    code: 'MB',
    name: { zh: '马尼托巴', en: 'Manitoba' },
    brackets: [
      { upTo: 47_564, rate: 0.108 },
      { upTo: 101_200, rate: 0.1275 },
      { upTo: INF, rate: 0.174 },
    ],
    bpa: 15_780,
  },
  {
    code: 'SK',
    name: { zh: '萨斯喀彻温', en: 'Saskatchewan' },
    brackets: [
      { upTo: 54_532, rate: 0.105 },
      { upTo: 155_805, rate: 0.125 },
      { upTo: INF, rate: 0.145 },
    ],
    bpa: 20_381,
  },
  {
    code: 'NS',
    name: { zh: '新斯科舍', en: 'Nova Scotia' },
    brackets: [
      { upTo: 30_995, rate: 0.0879 },
      { upTo: 61_991, rate: 0.1495 },
      { upTo: 97_417, rate: 0.1667 },
      { upTo: 157_124, rate: 0.175 },
      { upTo: INF, rate: 0.21 },
    ],
    bpa: 11_932,
  },
  {
    code: 'NB',
    name: { zh: '新不伦瑞克', en: 'New Brunswick' },
    brackets: [
      { upTo: 52_333, rate: 0.094 },
      { upTo: 104_666, rate: 0.14 },
      { upTo: 193_861, rate: 0.16 },
      { upTo: INF, rate: 0.195 },
    ],
    bpa: 13_664,
  },
  {
    code: 'NL',
    name: { zh: '纽芬兰与拉布拉多', en: 'Newfoundland and Labrador' },
    brackets: [
      { upTo: 44_678, rate: 0.087 },
      { upTo: 89_354, rate: 0.145 },
      { upTo: 159_528, rate: 0.158 },
      { upTo: 223_340, rate: 0.178 },
      { upTo: 285_319, rate: 0.198 },
      { upTo: 570_638, rate: 0.208 },
      { upTo: 1_141_275, rate: 0.213 },
      { upTo: INF, rate: 0.218 },
    ],
    bpa: 11_188,
  },
  {
    code: 'PE',
    name: { zh: '爱德华王子岛', en: 'Prince Edward Island' },
    brackets: [
      { upTo: 33_928, rate: 0.095 },
      { upTo: 65_820, rate: 0.1347 },
      { upTo: 106_890, rate: 0.166 },
      { upTo: 142_520, rate: 0.1762 },
      { upTo: 200_000, rate: 0.19 },
      { upTo: INF, rate: 0.2 },
    ],
    bpa: 15_000,
  },
];

/**
 * The tax year the provincial bracket data belongs to. Maintained by hand — upstream
 * PolicyEngine's provincial data has long been stuck on 2022–2023, older than what's here, so
 * syncing would be a regression.
 *
 * 省级分档数据所属的税年。手工维护——上游 PolicyEngine 的省级数据
 * 长期停留在 2022–2023 年，比这里还旧，同步反而是倒退。
 */
export const PROVINCIAL_DATA_TAX_YEAR = 2026;

export const DEFAULT_PROVINCE = 'ON';

export function getProvince(code: string): ProvinceTax {
  return (
    CA_PROVINCES.find((p) => p.code === code) ??
    CA_PROVINCES.find((p) => p.code === DEFAULT_PROVINCE)!
  );
}

/**
 * Ontario-style surtax: tiered surcharges levied on the provincial tax amount itself.
 * 安省式附加税：对省税额本身分档加征
 */
export function computeSurtax(provincialTax: number, province: ProvinceTax): number {
  if (!province.surtax) return 0;
  return province.surtax.reduce(
    (sum, s) => sum + Math.max(0, provincialTax - s.threshold) * s.rate,
    0,
  );
}
