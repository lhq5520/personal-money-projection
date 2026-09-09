/**
 * 加拿大省级个人所得税（2025 税年）。
 *
 * ⚠️ 精度声明：省级分档与基本个人金额取 2025 税年的近似值。
 * 安大略省的附加税（surtax）影响显著，已建模；安省健康保费（最高 900 加元）
 * 与各省的其他小额抵免未建模。魁北克使用独立税制，另有联邦返还，已单独处理。
 */

import type { TaxBracket } from '../../types.js';
import type { LocalizedName } from '../types.js';

export interface ProvinceTax {
  code: string;
  name: LocalizedName;
  brackets: readonly TaxBracket[];
  /** 省级基本个人金额，按最低档税率折算为不可退还抵免 */
  bpa: number;
  /**
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
      { upTo: 52_886, rate: 0.0505 },
      { upTo: 105_775, rate: 0.0915 },
      { upTo: 150_000, rate: 0.1116 },
      { upTo: 220_000, rate: 0.1216 },
      { upTo: INF, rate: 0.1316 },
    ],
    bpa: 12_747,
    // 安省附加税按「省税额」而非收入计征，两档叠加
    surtax: [
      { threshold: 5_710, rate: 0.2 },
      { threshold: 7_307, rate: 0.36 },
    ],
  },
  {
    code: 'BC',
    name: { zh: '不列颠哥伦比亚', en: 'British Columbia' },
    brackets: [
      { upTo: 49_279, rate: 0.0506 },
      { upTo: 98_560, rate: 0.077 },
      { upTo: 113_158, rate: 0.105 },
      { upTo: 137_407, rate: 0.1229 },
      { upTo: 186_306, rate: 0.147 },
      { upTo: 259_829, rate: 0.168 },
      { upTo: INF, rate: 0.205 },
    ],
    bpa: 12_932,
  },
  {
    code: 'AB',
    name: { zh: '艾伯塔', en: 'Alberta' },
    brackets: [
      { upTo: 60_000, rate: 0.08 },
      { upTo: 151_234, rate: 0.1 },
      { upTo: 181_481, rate: 0.12 },
      { upTo: 241_974, rate: 0.13 },
      { upTo: 362_961, rate: 0.14 },
      { upTo: INF, rate: 0.15 },
    ],
    bpa: 22_323,
  },
  {
    code: 'QC',
    name: { zh: '魁北克', en: 'Quebec' },
    brackets: [
      { upTo: 53_255, rate: 0.14 },
      { upTo: 106_495, rate: 0.19 },
      { upTo: 129_590, rate: 0.24 },
      { upTo: INF, rate: 0.2575 },
    ],
    bpa: 18_571,
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
    bpa: 15_969,
  },
  {
    code: 'SK',
    name: { zh: '萨斯喀彻温', en: 'Saskatchewan' },
    brackets: [
      { upTo: 53_463, rate: 0.105 },
      { upTo: 152_750, rate: 0.125 },
      { upTo: INF, rate: 0.145 },
    ],
    bpa: 18_991,
  },
  {
    code: 'NS',
    name: { zh: '新斯科舍', en: 'Nova Scotia' },
    brackets: [
      { upTo: 30_507, rate: 0.0879 },
      { upTo: 61_015, rate: 0.1495 },
      { upTo: 95_883, rate: 0.1667 },
      { upTo: 154_650, rate: 0.175 },
      { upTo: INF, rate: 0.21 },
    ],
    bpa: 11_744,
  },
  {
    code: 'NB',
    name: { zh: '新不伦瑞克', en: 'New Brunswick' },
    brackets: [
      { upTo: 51_306, rate: 0.094 },
      { upTo: 102_614, rate: 0.14 },
      { upTo: 190_060, rate: 0.16 },
      { upTo: INF, rate: 0.195 },
    ],
    bpa: 13_396,
  },
  {
    code: 'NL',
    name: { zh: '纽芬兰与拉布拉多', en: 'Newfoundland and Labrador' },
    brackets: [
      { upTo: 44_192, rate: 0.087 },
      { upTo: 88_382, rate: 0.145 },
      { upTo: 157_792, rate: 0.158 },
      { upTo: 220_910, rate: 0.178 },
      { upTo: 282_214, rate: 0.198 },
      { upTo: 564_429, rate: 0.208 },
      { upTo: 1_128_858, rate: 0.213 },
      { upTo: INF, rate: 0.218 },
    ],
    bpa: 11_067,
  },
  {
    code: 'PE',
    name: { zh: '爱德华王子岛', en: 'Prince Edward Island' },
    brackets: [
      { upTo: 33_328, rate: 0.095 },
      { upTo: 64_656, rate: 0.1347 },
      { upTo: 105_000, rate: 0.166 },
      { upTo: 140_000, rate: 0.1762 },
      { upTo: INF, rate: 0.19 },
    ],
    bpa: 14_250,
  },
];

/**
 * 省级分档数据所属的税年。手工维护——上游 PolicyEngine 的省级数据
 * 长期停留在 2022–2023 年，比这里还旧，同步反而是倒退。
 */
export const PROVINCIAL_DATA_TAX_YEAR = 2025;

export const DEFAULT_PROVINCE = 'ON';

export function getProvince(code: string): ProvinceTax {
  return (
    CA_PROVINCES.find((p) => p.code === code) ??
    CA_PROVINCES.find((p) => p.code === DEFAULT_PROVINCE)!
  );
}

/** 安省式附加税：对省税额本身分档加征 */
export function computeSurtax(provincialTax: number, province: ProvinceTax): number {
  if (!province.surtax) return 0;
  return province.surtax.reduce(
    (sum, s) => sum + Math.max(0, provincialTax - s.threshold) * s.rate,
    0,
  );
}
