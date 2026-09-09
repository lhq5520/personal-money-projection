/**
 * 中国城市级五险一金参数。
 *
 * ## 为什么只编码「社平工资」一个数字
 *
 * 社保缴费基数的上下限由法规推导，不是随意规定的：
 *     下限 = 上年度全口径城镇单位就业人员月平均工资 × 60%
 *     上限 = 同一社平工资 × 300%
 *
 * 这条规则已被官方数字逐分验证：上海 2025 年度全口径社平 12,577 元 →
 * 下限 12,577 × 0.6 = 7,546、上限 × 3 = 37,731，与人社局公布值完全一致。
 * 所以只需核对一个数字，而不是四个互相关联的数字。
 *
 * ## 例外：险种级基数
 *
 * 广东各市的养老按省级统筹、医疗按市级统筹，两者基数**不同**——
 * 深圳养老上限 27,549 而医保上限 33,633。这类情况用 `bases` 逐险种覆盖。
 *
 * ## 数据时效
 *
 * 中国社保年度为每年 7 月 1 日至次年 6 月 30 日，各地人社局在 7–8 月陆续公告。
 * 每个城市都带 provenance：适用期、来源 URL、核对日期与可信度。
 * `estimated` 的城市只保证量级正确，界面上会明确标注，请自行核对后覆盖。
 *
 * 中国没有可用的官方 API（国家统计局 easyquery 对自动化访问返回 403），
 * 因此本文件靠 `pnpm data:check:cn` 做变更检测 + 人工核对更新，见 scripts/check-cn.ts。
 */

import type { RentTier } from '../../types.js';
import type { Provenance } from '../../data/provenance.js';
import { cnSocialYear } from '../../data/provenance.js';
import type { Jurisdiction, LocalizedName } from '../types.js';

export interface BaseRange {
  min: number;
  max: number;
}

/** 参与逐险种基数覆盖的项目 */
export interface CityBases {
  pension?: BaseRange;
  medical?: BaseRange;
  unemployment?: BaseRange;
  housingFund?: BaseRange;
}

export interface CityProfile {
  code: string;
  name: LocalizedName;
  /** 全口径城镇单位就业人员月平均工资；未在 bases 中单独指定的险种由它推导 */
  avgWage: number;
  /** 当地月最低工资，作为公积金缴存基数下限 */
  minWage: number;
  /** 逐险种的基数区间覆盖（广东各市养老与医疗分别统筹时必须用） */
  bases?: CityBases;
  /** 失业保险个人费率，各地在 0.2%–0.5% 之间 */
  unemployment: number;
  hfRateDefault: number;
  hfRateMin: number;
  hfRateMax: number;
  rentTier: RentTier;
  provenance: Provenance;
}

/** 养老与医疗的个人费率全国统一 */
export const CN_PENSION_RATE = 0.08;
export const CN_MEDICAL_RATE = 0.02;

/** 法规规定的基数系数 */
export const SOCIAL_BASE_FLOOR_RATIO = 0.6;
export const SOCIAL_BASE_CEIL_RATIO = 3;

const SY_2026 = cnSocialYear(2026);
const SY_2024 = cnSocialYear(2024);

/** 未逐一核对的城市：沿用 2024 年度的近似社平工资，界面上标注为待核对 */
const estimated = (): Provenance => ({
  ...SY_2024,
  verifiedAt: '2026-09-09',
  confidence: 'estimated',
});

/** 简写构造器，只用于 estimated 城市 */
const c = (
  code: string,
  zh: string,
  en: string,
  avgWage: number,
  minWage: number,
  hfRateDefault: number,
  rentTier: RentTier,
  extra: Partial<CityProfile> = {},
): CityProfile => ({
  code,
  name: { zh, en },
  avgWage,
  minWage,
  unemployment: 0.005,
  hfRateDefault,
  hfRateMin: 0.05,
  hfRateMax: 0.12,
  rentTier,
  provenance: estimated(),
  ...extra,
});

export const CN_CITIES: readonly CityProfile[] = [
  // ---------------- 已核对：2026 社保年度 ----------------
  {
    code: 'shanghai',
    name: { zh: '上海', en: 'Shanghai' },
    // 2025 年度全口径社平 12,577 元/月 → 下限 7,546、上限 37,731
    avgWage: 12_577,
    minWage: 2_740,
    unemployment: 0.005,
    hfRateDefault: 0.07,
    hfRateMin: 0.05,
    hfRateMax: 0.07,
    rentTier: 'tier1',
    provenance: {
      ...SY_2026,
      sourceUrl: 'https://rsj.sh.gov.cn/',
      verifiedAt: '2026-09-09',
      confidence: 'verified',
      note: '2025 年度全口径社平工资 12,577 元/月，2026-08-18 公布',
    },
  },
  {
    code: 'beijing',
    name: { zh: '北京', en: 'Beijing' },
    // 公布口径为上下限 7,270 / 36,348，反推社平 12,116 元/月
    avgWage: 12_116,
    minWage: 2_540,
    unemployment: 0.005,
    hfRateDefault: 0.12,
    hfRateMin: 0.05,
    hfRateMax: 0.12,
    rentTier: 'tier1',
    provenance: {
      ...SY_2026,
      sourceUrl: 'https://rsj.beijing.gov.cn/zmsxw/xwsl/202608/t20260825_4836135.html',
      verifiedAt: '2026-09-09',
      confidence: 'verified',
      note: '2026 年度上下限 7,270 / 36,348 元，2026-08-21 公布',
    },
  },
  {
    code: 'shenzhen',
    name: { zh: '深圳', en: 'Shenzhen' },
    // 广东省全口径社平 9,183 元/月（养老按省级统筹）
    avgWage: 9_183,
    minWage: 2_520,
    bases: {
      // 养老：省级统筹，下限为当地最低工资档，上限 3 倍省社平
      pension: { min: 4_775, max: 27_549 },
      // 医保：市级统筹，自成一套基数，与养老完全不同
      medical: { min: 6_727, max: 33_633 },
      unemployment: { min: 4_775, max: 27_549 },
      // 公积金按深圳本市口径，与按省社平推导的养老基数无关
      housingFund: { min: 2_520, max: 40_260 },
    },
    unemployment: 0.003,
    hfRateDefault: 0.05,
    hfRateMin: 0.05,
    hfRateMax: 0.12,
    rentTier: 'tier1',
    provenance: {
      ...SY_2026,
      sourceUrl: 'https://hsa.sz.gov.cn/',
      verifiedAt: '2026-09-09',
      confidence: 'verified',
      note: '养老/失业 4,775–27,549（2025-07 起）；医保 6,727–33,633（2026 自然年）。两者分别统筹，基数不同。',
    },
  },
  {
    code: 'guangzhou',
    name: { zh: '广州', en: 'Guangzhou' },
    avgWage: 9_183,
    minWage: 2_500,
    bases: {
      pension: { min: 5_510, max: 27_549 },
      medical: { min: 6_234, max: 31_170 },
      unemployment: { min: 5_510, max: 27_549 },
      housingFund: { min: 2_500, max: 39_457 },
    },
    unemployment: 0.002,
    hfRateDefault: 0.05,
    hfRateMin: 0.05,
    hfRateMax: 0.12,
    rentTier: 'tier1',
    provenance: {
      ...SY_2026,
      sourceUrl: 'https://rsj.gz.gov.cn/',
      verifiedAt: '2026-09-09',
      confidence: 'verified',
      note: '养老 5,510–27,549；医保 6,234–31,170。养老按省级统筹、医疗按市级统筹，基数不同。',
    },
  },

  // ---------------- 待核对：沿用 2024 年度近似值 ----------------
  c('hangzhou', '杭州', 'Hangzhou', 8_380, 2_490, 0.12, 'tier1'),
  c('nanjing', '南京', 'Nanjing', 8_990, 2_490, 0.08, 'tier1'),
  c('suzhou', '苏州', 'Suzhou', 8_990, 2_490, 0.08, 'tier2'),
  c('wuxi', '无锡', 'Wuxi', 8_990, 2_490, 0.08, 'tier2'),
  c('chengdu', '成都', 'Chengdu', 7_521, 2_100, 0.08, 'tier1', { unemployment: 0.004, hfRateMin: 0.06 }),
  c('chongqing', '重庆', 'Chongqing', 6_903, 2_100, 0.08, 'tier1', { unemployment: 0.004 }),
  c('wuhan', '武汉', 'Wuhan', 7_620, 2_210, 0.08, 'tier1', { unemployment: 0.003 }),
  c('xian', '西安', "Xi'an", 7_089, 2_160, 0.08, 'tier1', { unemployment: 0.003 }),
  c('tianjin', '天津', 'Tianjin', 8_092, 2_320, 0.08, 'tier1'),
  c('changsha', '长沙', 'Changsha', 7_228, 2_100, 0.08, 'tier1', { unemployment: 0.002 }),
  c('zhengzhou', '郑州', 'Zhengzhou', 6_501, 2_100, 0.08, 'tier1', { unemployment: 0.003 }),
  c('qingdao', '青岛', 'Qingdao', 7_468, 2_200, 0.08, 'tier1'),
  c('ningbo', '宁波', 'Ningbo', 8_380, 2_490, 0.12, 'tier1'),
  c('hefei', '合肥', 'Hefei', 6_800, 2_060, 0.08, 'tier1'),
  c('dongguan', '东莞', 'Dongguan', 9_183, 1_900, 0.05, 'tier2', {
    unemployment: 0.002,
    bases: {
      pension: { min: 4_775, max: 27_549 },
      unemployment: { min: 4_775, max: 27_549 },
      housingFund: { min: 1_900, max: 27_549 },
    },
  }),
  c('foshan', '佛山', 'Foshan', 9_183, 1_900, 0.05, 'tier2', {
    unemployment: 0.002,
    bases: {
      pension: { min: 4_775, max: 27_549 },
      unemployment: { min: 4_775, max: 27_549 },
      housingFund: { min: 1_900, max: 27_549 },
    },
  }),
  c('shenyang', '沈阳', 'Shenyang', 6_800, 1_910, 0.08, 'tier1'),
  c('dalian', '大连', 'Dalian', 7_000, 1_910, 0.08, 'tier2'),
  c('jinan', '济南', 'Jinan', 7_468, 2_200, 0.08, 'tier1'),
  c('xiamen', '厦门', 'Xiamen', 8_500, 2_030, 0.08, 'tier2'),
  c('fuzhou', '福州', 'Fuzhou', 7_500, 2_030, 0.08, 'tier1'),
  c('kunming', '昆明', 'Kunming', 6_700, 1_990, 0.08, 'tier1'),
  c('harbin', '哈尔滨', 'Harbin', 6_200, 1_860, 0.08, 'tier1'),
  c('changchun', '长春', 'Changchun', 6_300, 1_880, 0.08, 'tier1'),
  c('shijiazhuang', '石家庄', 'Shijiazhuang', 6_500, 2_200, 0.08, 'tier1'),
  c('taiyuan', '太原', 'Taiyuan', 6_600, 1_980, 0.08, 'tier1'),
  c('nanchang', '南昌', 'Nanchang', 6_500, 1_850, 0.08, 'tier1'),
  c('guiyang', '贵阳', 'Guiyang', 6_800, 1_890, 0.08, 'tier1'),
  c('nanning', '南宁', 'Nanning', 6_300, 1_810, 0.08, 'tier1'),
  c('lanzhou', '兰州', 'Lanzhou', 6_400, 1_870, 0.08, 'tier1'),

  // ---------------- 全手动 ----------------
  {
    code: 'custom',
    name: { zh: '自定义', en: 'Custom' },
    avgWage: 10_000,
    minWage: 2_000,
    bases: {
      pension: { min: 0, max: Number.POSITIVE_INFINITY },
      medical: { min: 0, max: Number.POSITIVE_INFINITY },
      unemployment: { min: 0, max: Number.POSITIVE_INFINITY },
      housingFund: { min: 0, max: Number.POSITIVE_INFINITY },
    },
    unemployment: 0.005,
    hfRateDefault: 0.07,
    hfRateMin: 0,
    hfRateMax: 0.12,
    rentTier: 'tier1',
    provenance: {
      effectiveFrom: '1970-01-01',
      verifiedAt: '2026-09-09',
      confidence: 'verified',
      note: '全部参数由你自己填写，引擎不做任何默认假设',
    },
  },
];

export const DEFAULT_CITY = 'shanghai';

export function getCity(code: string): CityProfile {
  return CN_CITIES.find((x) => x.code === code) ?? CN_CITIES.find((x) => x.code === DEFAULT_CITY)!;
}

/** 按法定 60% / 300% 规则从社平工资推导的默认基数区间 */
export function derivedBase(city: CityProfile): BaseRange {
  return {
    min: Math.round(city.avgWage * SOCIAL_BASE_FLOOR_RATIO),
    max: Math.round(city.avgWage * SOCIAL_BASE_CEIL_RATIO),
  };
}

/** 取某一险种的基数区间：优先用逐险种覆盖，否则按规则推导 */
export function baseRangeFor(city: CityProfile, item: keyof CityBases): BaseRange {
  return city.bases?.[item] ?? derivedBase(city);
}

/** 公积金基数区间：下限为当地最低工资，上限通常同样是 3 倍社平 */
export function housingFundBaseRange(city: CityProfile): BaseRange {
  return city.bases?.housingFund ?? { min: city.minWage, max: derivedBase(city).max };
}

/** 兼容旧调用点：养老险的基数区间即通常意义上的「社保基数」 */
export function socialBaseRange(city: CityProfile): BaseRange {
  return baseRangeFor(city, 'pension');
}

export const CN_JURISDICTIONS: readonly Jurisdiction[] = CN_CITIES.map((city) => {
  const p = baseRangeFor(city, 'pension');
  const custom = city.code === 'custom';
  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '∞');

  if (custom) {
    return {
      code: city.code,
      name: city.name,
      note: {
        zh: '全部参数由你自己填写，引擎不做任何默认假设',
        en: 'All parameters are yours to fill in; the engine assumes nothing.',
      },
    };
  }

  const verified = city.provenance.confidence === 'verified';
  const period = `${city.provenance.effectiveFrom} ~ ${city.provenance.effectiveTo ?? '—'}`;
  return {
    code: city.code,
    name: city.name,
    note: {
      zh: verified
        ? `已核对（适用期 ${period}）：养老基数 ¥${fmt(p.min)}–¥${fmt(p.max)}。${city.provenance.note ?? ''}`
        : `⚠ 待核对：按社平工资 ¥${fmt(city.avgWage)}/月 推导出基数 ¥${fmt(p.min)}–¥${fmt(p.max)}，` +
          `数据停留在 ${period} 社保年度。请对照当地人社局最新公告或工资条修正。`,
      en: verified
        ? `Verified (effective ${period}): pension base ${fmt(p.min)}–${fmt(p.max)}. ${city.provenance.note ?? ''}`
        : `⚠ Unverified: derived from an average wage of ${fmt(city.avgWage)}/month, giving a base of ` +
          `${fmt(p.min)}–${fmt(p.max)}. Data is from the ${period} social-insurance year — check the latest local notice or your payslip.`,
    },
  };
});
