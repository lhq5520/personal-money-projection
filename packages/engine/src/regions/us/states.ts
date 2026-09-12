/**
 * 美国州级所得税（2025 税年）。
 *
 * ⚠️ 覆盖范围与精度声明
 *  - 无州所得税的州：精确。
 *  - 单一税率（flat）的州：精确。
 *  - 累进税率的州：这里给出各州的分档表，但各州的标准扣除、个人豁免、
 *    地方附加税（如纽约市、马里兰县税）规则差异很大，模型只做到「州级分档 + 标准扣除」，
 *    并对已知的重要地方税给出可选的固定比例估算。
 *  - `approximate: true` 的条目表示该州实际规则比模型更复杂，结果只是量级正确。
 *
 * 所有数值都可以在界面上被覆盖。请对照你的实际报税结果核对。
 */

import type { TaxBracket } from '../../types.js';
import type { LocalizedName } from '../types.js';
import { US_GENERATED, restoreBrackets } from '../../data/generated/index.js';

export interface StateTax {
  code: string;
  name: LocalizedName;
  /** null 表示该州不征收个人所得税 */
  brackets: { single: readonly TaxBracket[]; married: readonly TaxBracket[] } | null;
  standardDeduction: { single: number; married: number };
  /** 州级强制保险（如加州 SDI、纽约州 PFL），按工资计征 */
  payroll?: { rate: number; wageCap?: number };
  /** 地方所得税的粗略估算比例（如纽约市居民、马里兰县税） */
  localRate?: number;
  localNote?: LocalizedName;
  /**
   * 个人免税额抵免：从算出的州税里直接扣除的固定金额（不是从应税所得里扣）。
   *
   * 加州、俄勒冈等州用的是「抵免」而非「扣除」，对低收入者影响尤其大——
   * 加州单身 149 美元的抵免，在年收入 4.5 万时能占到州税的近 20%。
   * 差分验证里加州低收入段的偏差正是由此而来。
   */
  exemptionCredit?: { single: number; married: number };
  /**
   * 允许从州应税所得中抵扣的 FICA 上限。目前只有麻州有这条规则
   * （最多 2,000 美元），不建模的话每年会多算约 100 美元州税。
   */
  ficaDeductionCap?: number;
  /** 该州的建模是否为近似 */
  approximate?: boolean;
}

const NO_DEDUCTION = { single: 0, married: 0 };

/** 无个人所得税的州 */
function noTax(code: string, zh: string, en: string): StateTax {
  return { code, name: { zh, en }, brackets: null, standardDeduction: NO_DEDUCTION };
}

/** 单一税率州 */
function flat(
  code: string,
  zh: string,
  en: string,
  rate: number,
  standardDeduction = NO_DEDUCTION,
): StateTax {
  const b = [{ upTo: Number.POSITIVE_INFINITY, rate }];
  return { code, name: { zh, en }, brackets: { single: b, married: b }, standardDeduction };
}

const INF = Number.POSITIVE_INFINITY;

export const US_STATES: readonly StateTax[] = [
  // ---------- 无所得税 ----------
  noTax('TX', '得克萨斯', 'Texas'),
  noTax('FL', '佛罗里达', 'Florida'),
  noTax('WA', '华盛顿州', 'Washington'),
  noTax('NV', '内华达', 'Nevada'),
  noTax('TN', '田纳西', 'Tennessee'),
  noTax('WY', '怀俄明', 'Wyoming'),
  noTax('SD', '南达科他', 'South Dakota'),
  noTax('AK', '阿拉斯加', 'Alaska'),
  noTax('NH', '新罕布什尔', 'New Hampshire'),

  // ---------- 累进 ----------
  {
    code: 'CA',
    name: { zh: '加利福尼亚', en: 'California' },
    brackets: {
      single: [
        { upTo: 10_756, rate: 0.01 },
        { upTo: 25_499, rate: 0.02 },
        { upTo: 40_245, rate: 0.04 },
        { upTo: 55_866, rate: 0.06 },
        { upTo: 70_606, rate: 0.08 },
        { upTo: 360_659, rate: 0.093 },
        { upTo: 432_787, rate: 0.103 },
        { upTo: 721_314, rate: 0.113 },
        { upTo: INF, rate: 0.123 },
      ],
      married: [
        { upTo: 21_512, rate: 0.01 },
        { upTo: 50_998, rate: 0.02 },
        { upTo: 80_490, rate: 0.04 },
        { upTo: 111_732, rate: 0.06 },
        { upTo: 141_212, rate: 0.08 },
        { upTo: 721_318, rate: 0.093 },
        { upTo: 865_574, rate: 0.103 },
        { upTo: 1_442_628, rate: 0.113 },
        { upTo: INF, rate: 0.123 },
      ],
    },
    standardDeduction: { single: 5_540, married: 11_080 },
    // 加州 SDI 自 2024 年起取消工资上限，全额工资计征
    payroll: { rate: 0.012 },
    exemptionCredit: { single: 149, married: 298 },
    approximate: true,
  },
  {
    code: 'NY',
    name: { zh: '纽约州', en: 'New York' },
    brackets: {
      single: [
        { upTo: 8_500, rate: 0.04 },
        { upTo: 11_700, rate: 0.045 },
        { upTo: 13_900, rate: 0.0525 },
        { upTo: 80_650, rate: 0.055 },
        { upTo: 215_400, rate: 0.06 },
        { upTo: 1_077_550, rate: 0.0685 },
        { upTo: 5_000_000, rate: 0.0965 },
        { upTo: 25_000_000, rate: 0.103 },
        { upTo: INF, rate: 0.109 },
      ],
      married: [
        { upTo: 17_150, rate: 0.04 },
        { upTo: 23_600, rate: 0.045 },
        { upTo: 27_900, rate: 0.0525 },
        { upTo: 161_550, rate: 0.055 },
        { upTo: 323_200, rate: 0.06 },
        { upTo: 2_155_350, rate: 0.0685 },
        { upTo: 5_000_000, rate: 0.0965 },
        { upTo: 25_000_000, rate: 0.103 },
        { upTo: INF, rate: 0.109 },
      ],
    },
    standardDeduction: { single: 8_000, married: 16_050 },
    approximate: true,
  },
  {
    code: 'NYC',
    name: { zh: '纽约市（含市税）', en: 'New York City (incl. city tax)' },
    brackets: {
      single: [
        { upTo: 8_500, rate: 0.04 },
        { upTo: 11_700, rate: 0.045 },
        { upTo: 13_900, rate: 0.0525 },
        { upTo: 80_650, rate: 0.055 },
        { upTo: 215_400, rate: 0.06 },
        { upTo: 1_077_550, rate: 0.0685 },
        { upTo: 5_000_000, rate: 0.0965 },
        { upTo: 25_000_000, rate: 0.103 },
        { upTo: INF, rate: 0.109 },
      ],
      married: [
        { upTo: 17_150, rate: 0.04 },
        { upTo: 23_600, rate: 0.045 },
        { upTo: 27_900, rate: 0.0525 },
        { upTo: 161_550, rate: 0.055 },
        { upTo: 323_200, rate: 0.06 },
        { upTo: 2_155_350, rate: 0.0685 },
        { upTo: 5_000_000, rate: 0.0965 },
        { upTo: 25_000_000, rate: 0.103 },
        { upTo: INF, rate: 0.109 },
      ],
    },
    standardDeduction: { single: 8_000, married: 16_050 },
    localRate: 0.03876,
    localNote: {
      zh: '纽约市居民所得税按约 3.876% 的顶档比例估算，实际为 3.078%–3.876% 的累进',
      en: 'NYC resident tax estimated at the top 3.876% rate; actual is progressive 3.078%–3.876%.',
    },
    approximate: true,
  },
  {
    code: 'NJ',
    name: { zh: '新泽西', en: 'New Jersey' },
    brackets: {
      single: [
        { upTo: 20_000, rate: 0.014 },
        { upTo: 35_000, rate: 0.0175 },
        { upTo: 40_000, rate: 0.035 },
        { upTo: 75_000, rate: 0.05525 },
        { upTo: 500_000, rate: 0.0637 },
        { upTo: 1_000_000, rate: 0.0897 },
        { upTo: INF, rate: 0.1075 },
      ],
      married: [
        { upTo: 20_000, rate: 0.014 },
        { upTo: 50_000, rate: 0.0175 },
        { upTo: 70_000, rate: 0.0245 },
        { upTo: 80_000, rate: 0.035 },
        { upTo: 150_000, rate: 0.05525 },
        { upTo: 500_000, rate: 0.0637 },
        { upTo: 1_000_000, rate: 0.0897 },
        { upTo: INF, rate: 0.1075 },
      ],
    },
    // 新泽西没有标准扣除，只有个人豁免（单身 1000 / 已婚 2000）
    standardDeduction: { single: 1_000, married: 2_000 },
    approximate: true,
  },
  {
    code: 'VA',
    name: { zh: '弗吉尼亚', en: 'Virginia' },
    brackets: {
      single: [
        { upTo: 3_000, rate: 0.02 },
        { upTo: 5_000, rate: 0.03 },
        { upTo: 17_000, rate: 0.05 },
        { upTo: INF, rate: 0.0575 },
      ],
      married: [
        { upTo: 3_000, rate: 0.02 },
        { upTo: 5_000, rate: 0.03 },
        { upTo: 17_000, rate: 0.05 },
        { upTo: INF, rate: 0.0575 },
      ],
    },
    standardDeduction: { single: 8_500, married: 17_000 },
    approximate: true,
  },
  {
    code: 'MN',
    name: { zh: '明尼苏达', en: 'Minnesota' },
    brackets: {
      single: [
        { upTo: 32_570, rate: 0.0535 },
        { upTo: 106_990, rate: 0.068 },
        { upTo: 198_630, rate: 0.0785 },
        { upTo: INF, rate: 0.0985 },
      ],
      married: [
        { upTo: 47_620, rate: 0.0535 },
        { upTo: 189_180, rate: 0.068 },
        { upTo: 330_410, rate: 0.0785 },
        { upTo: INF, rate: 0.0985 },
      ],
    },
    standardDeduction: { single: 14_950, married: 29_900 },
    approximate: true,
  },
  {
    code: 'OR',
    name: { zh: '俄勒冈', en: 'Oregon' },
    brackets: {
      single: [
        { upTo: 4_300, rate: 0.0475 },
        { upTo: 10_750, rate: 0.0675 },
        { upTo: 125_000, rate: 0.0875 },
        { upTo: INF, rate: 0.099 },
      ],
      married: [
        { upTo: 8_600, rate: 0.0475 },
        { upTo: 21_500, rate: 0.0675 },
        { upTo: 250_000, rate: 0.0875 },
        { upTo: INF, rate: 0.099 },
      ],
    },
    standardDeduction: { single: 2_800, married: 5_600 },
    exemptionCredit: { single: 250, married: 500 },
    approximate: true,
  },
  {
    code: 'OH',
    name: { zh: '俄亥俄', en: 'Ohio' },
    // 俄亥俄 2026 年完成多年的税率扁平化：原 0% / 2.75% / 3.5% 三档变为
    // 26,050 美元以下免税、以上单一 2.75%。
    //
    // 已知建模缺口：俄亥俄的个人免税额按 AGI 分三档递减、另有营业所得扣除与
    // 联合申报抵免，本模型都未覆盖，差分验证中低收入段偏差可达 30% 以上。
    //
    // 这个州刻意不走 data:sync——上游把第一档编码成 0.0127448 的「隐含平均税率」
    // 用来模拟跨档时加收的固定额，当成边际税率从 0 起征会对低收入者多征税。
    // 详见 scripts/sources.ts。
    brackets: {
      single: [
        { upTo: 26_050, rate: 0 },
        { upTo: INF, rate: 0.0275 },
      ],
      married: [
        { upTo: 26_050, rate: 0 },
        { upTo: INF, rate: 0.0275 },
      ],
    },
    standardDeduction: NO_DEDUCTION,
    approximate: true,
  },
  {
    code: 'MD',
    name: { zh: '马里兰', en: 'Maryland' },
    brackets: {
      single: [
        { upTo: 1_000, rate: 0.02 },
        { upTo: 2_000, rate: 0.03 },
        { upTo: 3_000, rate: 0.04 },
        { upTo: 100_000, rate: 0.0475 },
        { upTo: 125_000, rate: 0.05 },
        { upTo: 150_000, rate: 0.0525 },
        { upTo: 250_000, rate: 0.055 },
        { upTo: INF, rate: 0.0575 },
      ],
      married: [
        { upTo: 1_000, rate: 0.02 },
        { upTo: 2_000, rate: 0.03 },
        { upTo: 3_000, rate: 0.04 },
        { upTo: 150_000, rate: 0.0475 },
        { upTo: 175_000, rate: 0.05 },
        { upTo: 225_000, rate: 0.0525 },
        { upTo: 300_000, rate: 0.055 },
        { upTo: INF, rate: 0.0575 },
      ],
    },
    standardDeduction: { single: 2_700, married: 5_450 },
    localRate: 0.032,
    localNote: {
      zh: '马里兰各县另征 2.25%–3.20% 的县税，此处按 3.2% 估算',
      en: 'Maryland counties levy 2.25%–3.20%; estimated here at 3.2%.',
    },
    approximate: true,
  },

  // ---------- 单一税率 ----------
  flat('CO', '科罗拉多', 'Colorado', 0.044, { single: 15_000, married: 30_000 }),
  flat('IL', '伊利诺伊', 'Illinois', 0.0495),
  flat('IN', '印第安纳', 'Indiana', 0.0305),
  flat('MI', '密歇根', 'Michigan', 0.0425),
  flat('NC', '北卡罗来纳', 'North Carolina', 0.0425, { single: 12_750, married: 25_500 }),
  flat('PA', '宾夕法尼亚', 'Pennsylvania', 0.0307),
  flat('UT', '犹他', 'Utah', 0.0455),
  flat('KY', '肯塔基', 'Kentucky', 0.04, { single: 3_270, married: 6_540 }),
  {
    code: 'MA',
    name: { zh: '马萨诸塞', en: 'Massachusetts' },
    // 麻州在 5% 单一税率之上另有「百万富翁附加税」（2022 年 Fair Share 修正案）：
    // 超过门槛的部分加征 4%，等效于第二档 9%。门槛随通胀调整，2026 年为 1,053,750。
    //
    // 麻州也不走 data:sync：它按 A/B/C 类收入分别计税，上游没有可直接采用的分档文件。
    brackets: {
      single: [
        { upTo: 1_053_750, rate: 0.05 },
        { upTo: INF, rate: 0.09 },
      ],
      married: [
        { upTo: 1_053_750, rate: 0.05 },
        { upTo: INF, rate: 0.09 },
      ],
    },
    // 麻州的个人免税额（单身 4,400 / 已婚 8,800）作用等同于标准扣除，
    // 另外允许从应税所得里抵扣最多 2,000 美元的 FICA。
    standardDeduction: { single: 4_400, married: 8_800 },
    ficaDeductionCap: 2_000,
    approximate: true,
  },
  flat('AZ', '亚利桑那', 'Arizona', 0.025, { single: 15_000, married: 30_000 }),
  flat('GA', '佐治亚', 'Georgia', 0.0519, { single: 12_000, married: 24_000 }),
  flat('ID', '爱达荷', 'Idaho', 0.05695, { single: 15_000, married: 30_000 }),
  flat('MS', '密西西比', 'Mississippi', 0.044, { single: 2_300, married: 4_600 }),

  // ---------- 全手动 ----------
  {
    code: 'CUSTOM',
    name: { zh: '自定义', en: 'Custom' },
    brackets: null,
    standardDeduction: NO_DEDUCTION,
  },
];

/** 未能同步、仍为手工维护的州所对应的税年 */
export const MANUAL_STATE_TAX_YEAR = 2026;

/**
 * 取某个州当前实际生效的分档表。
 *
 * 优先用 `data:sync` 同步下来的值——州级分档每年随通胀调整，手写的必然会过期。
 * 上游没有、或刻意排除的州（如俄亥俄，见 scripts/sources.ts 的说明）回落到本文件的手工值。
 */
function bracketsFor(
  code: string,
  fallback: { single: readonly TaxBracket[]; married: readonly TaxBracket[] } | null,
): { single: readonly TaxBracket[]; married: readonly TaxBracket[] } | null {
  const synced = US_GENERATED.states?.[code];
  if (!synced) return fallback;
  return { single: restoreBrackets(synced.single), married: restoreBrackets(synced.married) };
}

/** 该州的分档是同步来的还是手工维护的，决定它的数据时效口径 */
export function stateDataTaxYear(code: string): number {
  return US_GENERATED.states?.[code] ? US_GENERATED.taxYear : MANUAL_STATE_TAX_YEAR;
}

export const DEFAULT_STATE = 'CA';

export function getState(code: string): StateTax {
  const base = US_STATES.find((s) => s.code === code) ?? US_STATES.find((s) => s.code === DEFAULT_STATE)!;
  // 纽约市共用纽约州的分档，另加市税
  const syncKey = base.code === 'NYC' ? 'NY' : base.code;
  const brackets = bracketsFor(syncKey, base.brackets);
  return brackets === base.brackets ? base : { ...base, brackets };
}
