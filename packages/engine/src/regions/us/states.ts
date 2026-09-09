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
    standardDeduction: { single: 14_575, married: 29_150 },
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
    standardDeduction: { single: 2_745, married: 5_495 },
    approximate: true,
  },
  {
    code: 'OH',
    name: { zh: '俄亥俄', en: 'Ohio' },
    brackets: {
      single: [
        { upTo: 26_050, rate: 0 },
        { upTo: 100_000, rate: 0.0275 },
        { upTo: INF, rate: 0.035 },
      ],
      married: [
        { upTo: 26_050, rate: 0 },
        { upTo: 100_000, rate: 0.0275 },
        { upTo: INF, rate: 0.035 },
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
  flat('MA', '马萨诸塞', 'Massachusetts', 0.05),
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

/**
 * 州级分档数据所属的税年。
 *
 * 联邦分档由 data:sync 自动同步，州级则是手工维护——51 个州的上游 YAML 结构各异，
 * 逐个解析不现实。改用 `pnpm data:verify` 对 PolicyEngine 实时 API 做差分验证，
 * 州级数据漂移会在那里显现为超出容差的差异。
 */
export const STATE_DATA_TAX_YEAR = 2025;

export const DEFAULT_STATE = 'CA';

export function getState(code: string): StateTax {
  return US_STATES.find((s) => s.code === code) ?? US_STATES.find((s) => s.code === DEFAULT_STATE)!;
}
