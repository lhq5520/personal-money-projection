/**
 * 中国城市级五险一金参数。
 *
 * ## 数据是省级的，城市只做引用
 *
 * 社保缴费基数由**省级统筹**：同省各市共用一个全口径社平工资，
 * 上下限按法定的 60% / 300% 推导。所以驱动值放在 provinces.ts，
 * 本文件只记录城市自己的东西——最低工资、失业保险费率、公积金比例、
 * 租金扣除档位，以及少数市级统筹造成的基数覆盖。
 *
 * 这条推导规则已被官方数字逐分验证：上海 2025 年度全口径社平 12,577 元 →
 * 下限 ×0.6 = 7,546、上限 ×3 = 37,731，与人社局公布值完全一致。
 *
 * ## 例外：市级统筹的险种
 *
 * 广东各市的养老按省级统筹、医疗按市级统筹，两者基数**不同**——
 * 深圳养老上限 27,549 而医保上限 33,633。这类情况用 `bases` 逐险种覆盖。
 * 公积金也普遍按本市口径定基数，与养老基数无关。
 */

import type { RentTier } from '../../types.js';
import type { Provenance } from '../../data/provenance.js';
import type { Jurisdiction, LocalizedName } from '../types.js';
import { getProvince } from './provinces.js';

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
  /**
   * 所属省级统筹单位的 code。社保基数的驱动值在 provinces.ts，
   * 同省各市共用，因此维护时只需更新省级数字。
   */
  province: string;
  /** 当地月最低工资，作为公积金缴存基数下限 */
  minWage: number;
  /** 逐险种的基数区间覆盖（市级统筹或本市另有规定时使用） */
  bases?: CityBases;
  /** 失业保险个人费率，各地在 0.2%–0.5% 之间 */
  unemployment: number;
  hfRateDefault: number;
  hfRateMin: number;
  hfRateMax: number;
  rentTier: RentTier;
}

/** 养老与医疗的个人费率全国统一 */
export const CN_PENSION_RATE = 0.08;
export const CN_MEDICAL_RATE = 0.02;

/** 法规规定的基数系数 */
export const SOCIAL_BASE_FLOOR_RATIO = 0.6;
export const SOCIAL_BASE_CEIL_RATIO = 3;

const c = (
  code: string,
  zh: string,
  en: string,
  province: string,
  minWage: number,
  hfRateDefault: number,
  rentTier: RentTier,
  extra: Partial<CityProfile> = {},
): CityProfile => ({
  code,
  name: { zh, en },
  province,
  minWage,
  unemployment: 0.005,
  hfRateDefault,
  hfRateMin: 0.05,
  hfRateMax: 0.12,
  rentTier,
  ...extra,
});

/** 广东各市共用的养老基数下限覆盖：深圳按最低工资档，低于省级推导值 */
const GD_PENSION_SHENZHEN: BaseRange = { min: 4_775, max: 27_549 };

export const CN_CITIES: readonly CityProfile[] = [
  // ---- 直辖市 ----
  c('shanghai', '上海', 'Shanghai', 'shanghai', 2_740, 0.07, 'tier1', { hfRateMax: 0.07 }),
  c('beijing', '北京', 'Beijing', 'beijing', 2_540, 0.12, 'tier1'),
  c('tianjin', '天津', 'Tianjin', 'tianjin', 2_320, 0.08, 'tier1'),
  c('chongqing', '重庆', 'Chongqing', 'chongqing', 2_100, 0.08, 'tier1', { unemployment: 0.004 }),

  // ---- 广东：养老省级统筹、医保市级统筹，基数不同 ----
  c('shenzhen', '深圳', 'Shenzhen', 'guangdong', 2_520, 0.05, 'tier1', {
    unemployment: 0.003,
    bases: {
      pension: GD_PENSION_SHENZHEN,
      unemployment: GD_PENSION_SHENZHEN,
      medical: { min: 6_727, max: 33_633 },
      housingFund: { min: 2_520, max: 40_260 },
    },
  }),
  c('guangzhou', '广州', 'Guangzhou', 'guangdong', 2_500, 0.05, 'tier1', {
    unemployment: 0.002,
    bases: {
      medical: { min: 6_234, max: 31_170 },
      housingFund: { min: 2_500, max: 39_457 },
    },
  }),
  c('dongguan', '东莞', 'Dongguan', 'guangdong', 1_900, 0.05, 'tier2', {
    unemployment: 0.002,
    bases: { housingFund: { min: 1_900, max: 27_549 } },
  }),
  c('foshan', '佛山', 'Foshan', 'guangdong', 1_900, 0.05, 'tier2', {
    unemployment: 0.002,
    bases: { housingFund: { min: 1_900, max: 27_549 } },
  }),

  // ---- 江苏 ----
  c('nanjing', '南京', 'Nanjing', 'jiangsu', 2_490, 0.08, 'tier1'),
  c('suzhou', '苏州', 'Suzhou', 'jiangsu', 2_490, 0.08, 'tier2'),
  c('wuxi', '无锡', 'Wuxi', 'jiangsu', 2_490, 0.08, 'tier2'),

  // ---- 浙江 ----
  c('hangzhou', '杭州', 'Hangzhou', 'zhejiang', 2_490, 0.12, 'tier1'),
  // 宁波是计划单列市，租金扣除按 tier1
  c('ningbo', '宁波', 'Ningbo', 'zhejiang', 2_490, 0.12, 'tier1'),

  // ---- 其余省会与重点城市 ----
  c('chengdu', '成都', 'Chengdu', 'sichuan', 2_100, 0.08, 'tier1', { unemployment: 0.004, hfRateMin: 0.06 }),
  c('wuhan', '武汉', 'Wuhan', 'hubei', 2_210, 0.08, 'tier1', { unemployment: 0.003 }),
  c('xian', '西安', "Xi'an", 'shaanxi', 2_160, 0.08, 'tier1', { unemployment: 0.003 }),
  c('zhengzhou', '郑州', 'Zhengzhou', 'henan', 2_100, 0.08, 'tier1', { unemployment: 0.003 }),
  // 青岛是计划单列市
  c('qingdao', '青岛', 'Qingdao', 'shandong', 2_200, 0.08, 'tier1'),
  c('jinan', '济南', 'Jinan', 'shandong', 2_200, 0.08, 'tier1'),
  c('taiyuan', '太原', 'Taiyuan', 'shanxi', 1_980, 0.08, 'tier1'),
  c('changsha', '长沙', 'Changsha', 'hunan', 2_100, 0.08, 'tier1', { unemployment: 0.002 }),
  c('shenyang', '沈阳', 'Shenyang', 'liaoning', 1_910, 0.08, 'tier1'),
  // 大连是计划单列市，租金扣除按 tier1
  c('dalian', '大连', 'Dalian', 'liaoning', 1_910, 0.08, 'tier1'),
  // 厦门是计划单列市，租金扣除按 tier1
  c('xiamen', '厦门', 'Xiamen', 'fujian', 2_030, 0.08, 'tier1'),
  c('fuzhou', '福州', 'Fuzhou', 'fujian', 2_030, 0.08, 'tier1'),
  c('shijiazhuang', '石家庄', 'Shijiazhuang', 'hebei', 2_200, 0.08, 'tier1'),
  c('changchun', '长春', 'Changchun', 'jilin', 1_880, 0.08, 'tier1'),
  c('lanzhou', '兰州', 'Lanzhou', 'gansu', 1_870, 0.08, 'tier1'),
  c('nanning', '南宁', 'Nanning', 'guangxi', 1_810, 0.08, 'tier1'),
  c('guiyang', '贵阳', 'Guiyang', 'guizhou', 1_890, 0.08, 'tier1'),
  c('kunming', '昆明', 'Kunming', 'yunnan', 1_990, 0.08, 'tier1'),
  c('hefei', '合肥', 'Hefei', 'anhui', 2_060, 0.08, 'tier1'),
  c('harbin', '哈尔滨', 'Harbin', 'heilongjiang', 1_860, 0.08, 'tier1'),
  c('nanchang', '南昌', 'Nanchang', 'jiangxi', 1_850, 0.08, 'tier1'),

  // ---- 全手动 ----
  c('custom', '自定义', 'Custom', 'custom', 2_000, 0.07, 'tier1', {
    hfRateMin: 0,
    bases: {
      pension: { min: 0, max: Number.POSITIVE_INFINITY },
      medical: { min: 0, max: Number.POSITIVE_INFINITY },
      unemployment: { min: 0, max: Number.POSITIVE_INFINITY },
      housingFund: { min: 0, max: Number.POSITIVE_INFINITY },
    },
  }),
];

export const DEFAULT_CITY = 'shanghai';

export function getCity(code: string): CityProfile {
  return CN_CITIES.find((x) => x.code === code) ?? CN_CITIES.find((x) => x.code === DEFAULT_CITY)!;
}

/** 城市的数据出处即其所属省份的出处——基数是省级统筹的 */
export function cityProvenance(city: CityProfile): Provenance {
  if (city.code === 'custom') {
    return {
      effectiveFrom: '1970-01-01',
      verifiedAt: '2026-09-12',
      confidence: 'verified',
      note: '全部参数由你自己填写，引擎不做任何默认假设',
    };
  }
  return getProvince(city.province).provenance;
}

/** 按法定 60% / 300% 规则从所属省份的社平工资推导的默认基数区间 */
export function derivedBase(city: CityProfile): BaseRange {
  const avgWage = getProvince(city.province).avgWage;
  return {
    min: Math.round(avgWage * SOCIAL_BASE_FLOOR_RATIO),
    max: Math.round(avgWage * SOCIAL_BASE_CEIL_RATIO),
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
  if (city.code === 'custom') {
    return {
      code: city.code,
      name: city.name,
      note: {
        zh: '全部参数由你自己填写，引擎不做任何默认假设',
        en: 'All parameters are yours to fill in; the engine assumes nothing.',
      },
    };
  }

  const prov = getProvince(city.province);
  const p = baseRangeFor(city, 'pension');
  const pv = prov.provenance;
  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '∞');
  const period = `${pv.effectiveFrom} ~ ${pv.effectiveTo ?? '—'}`;
  const verified = pv.confidence === 'verified';

  return {
    code: city.code,
    name: city.name,
    note: {
      zh: verified
        ? `已核对 · ${prov.name.zh}省级统筹（适用期 ${period}）：养老基数 ¥${fmt(p.min)}–¥${fmt(p.max)}。${pv.note ?? ''}`
        : `⚠ 待核对 · ${prov.name.zh}：养老基数 ¥${fmt(p.min)}–¥${fmt(p.max)}，数据停留在 ${period}。${pv.note ?? ''}`,
      en: verified
        ? `Verified · pooled at ${prov.name.en} province level (effective ${period}): pension base ${fmt(p.min)}–${fmt(p.max)}. ${pv.note ?? ''}`
        : `⚠ Unverified · ${prov.name.en}: pension base ${fmt(p.min)}–${fmt(p.max)}, data from ${period}. ${pv.note ?? ''}`,
    },
  };
});
