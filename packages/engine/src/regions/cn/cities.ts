/**
 * 中国城市级五险一金参数。
 *
 * ⚠️ 数据口径 —— 请务必阅读
 *
 * 社保缴费基数的上下限不是随意规定的数字，而是由法规推导出来的：
 *     下限 = 上年度全口径城镇单位就业人员月平均工资 × 60%
 *     上限 = 同一社平工资 × 300%
 *
 * 所以这里只编码 `avgWage`（社平工资）这一个驱动值，上下限由规则算出来。
 * 这样做的好处是：你只需要核对一个数字，而不是核对四个互相关联的数字；
 * 每年 7 月社平工资更新时，改一处即可。
 *
 * 部分城市另有规定（例如深圳养老保险下限按最低工资而非 60% 社平），
 * 用 socialBaseMin / socialBaseMax 显式覆盖。
 *
 * avgWage 取 2024 年前后公布值的近似，**不是权威数据**。
 * 江浙等省份按省级统筹，同省各市共用一个社平工资。
 * 请对照当地人社局年度公告或你自己的工资条核对——界面上每个参数都能直接改。
 */

import type { RentTier } from '../../types.js';
import type { Jurisdiction, LocalizedName } from '../types.js';

export interface CityProfile {
  code: string;
  name: LocalizedName;
  /** 上年度全口径城镇单位就业人员月平均工资，驱动社保基数上下限 */
  avgWage: number;
  /** 当地月最低工资，作为公积金缴存基数下限 */
  minWage: number;
  /** 社保基数下限的显式覆盖（部分城市不按 60% 社平） */
  socialBaseMin?: number;
  /** 社保基数上限的显式覆盖 */
  socialBaseMax?: number;
  /** 失业保险个人费率，各地在 0.2%–0.5% 之间 */
  unemployment: number;
  /** 公积金缴存比例：默认值与可选区间 */
  hfRateDefault: number;
  hfRateMin: number;
  hfRateMax: number;
  /** 公积金缴存基数上限的显式覆盖 */
  hfBaseMax?: number;
  /** 个税住房租金专项附加扣除的城市档位 */
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
  ...extra,
});

export const CN_CITIES: readonly CityProfile[] = [
  // ---- 一线 ----
  c('shanghai', '上海', 'Shanghai', 12307, 2690, 0.07, 'tier1', { hfRateMax: 0.07 }),
  c('beijing', '北京', 'Beijing', 11761, 2420, 0.12, 'tier1'),
  c('shenzhen', '深圳', 'Shenzhen', 9309, 2360, 0.05, 'tier1', {
    // 深圳养老保险下限按最低工资，且失业保险个人费率为 0.3%
    socialBaseMin: 2360,
    unemployment: 0.003,
    hfBaseMax: 40260,
  }),
  c('guangzhou', '广州', 'Guangzhou', 9309, 2300, 0.05, 'tier1', {
    socialBaseMin: 4546,
    unemployment: 0.002,
  }),

  // ---- 新一线 ----
  c('hangzhou', '杭州', 'Hangzhou', 8380, 2490, 0.12, 'tier1'),
  c('nanjing', '南京', 'Nanjing', 8990, 2490, 0.08, 'tier1'),
  c('suzhou', '苏州', 'Suzhou', 8990, 2490, 0.08, 'tier2'),
  c('wuxi', '无锡', 'Wuxi', 8990, 2490, 0.08, 'tier2'),
  c('chengdu', '成都', 'Chengdu', 7521, 2100, 0.08, 'tier1', { unemployment: 0.004, hfRateMin: 0.06 }),
  c('chongqing', '重庆', 'Chongqing', 6903, 2100, 0.08, 'tier1', { unemployment: 0.004 }),
  c('wuhan', '武汉', 'Wuhan', 7620, 2210, 0.08, 'tier1', { unemployment: 0.003 }),
  c('xian', '西安', "Xi'an", 7089, 2160, 0.08, 'tier1', { unemployment: 0.003 }),
  c('tianjin', '天津', 'Tianjin', 8092, 2320, 0.08, 'tier1'),
  c('changsha', '长沙', 'Changsha', 7228, 2100, 0.08, 'tier1', { unemployment: 0.002 }),
  c('zhengzhou', '郑州', 'Zhengzhou', 6501, 2100, 0.08, 'tier1', { unemployment: 0.003 }),
  c('qingdao', '青岛', 'Qingdao', 7468, 2200, 0.08, 'tier1'),
  c('ningbo', '宁波', 'Ningbo', 8380, 2490, 0.12, 'tier1'),
  c('hefei', '合肥', 'Hefei', 6800, 2060, 0.08, 'tier1'),
  c('dongguan', '东莞', 'Dongguan', 9309, 1900, 0.05, 'tier2', { unemployment: 0.002 }),
  c('foshan', '佛山', 'Foshan', 9309, 1900, 0.05, 'tier2', { unemployment: 0.002 }),

  // ---- 其他省会与重点城市 ----
  c('shenyang', '沈阳', 'Shenyang', 6800, 1910, 0.08, 'tier1'),
  c('dalian', '大连', 'Dalian', 7000, 1910, 0.08, 'tier2'),
  c('jinan', '济南', 'Jinan', 7468, 2200, 0.08, 'tier1'),
  c('xiamen', '厦门', 'Xiamen', 8500, 2030, 0.08, 'tier2'),
  c('fuzhou', '福州', 'Fuzhou', 7500, 2030, 0.08, 'tier1'),
  c('kunming', '昆明', 'Kunming', 6700, 1990, 0.08, 'tier1'),
  c('harbin', '哈尔滨', 'Harbin', 6200, 1860, 0.08, 'tier1'),
  c('changchun', '长春', 'Changchun', 6300, 1880, 0.08, 'tier1'),
  c('shijiazhuang', '石家庄', 'Shijiazhuang', 6500, 2200, 0.08, 'tier1'),
  c('taiyuan', '太原', 'Taiyuan', 6600, 1980, 0.08, 'tier1'),
  c('nanchang', '南昌', 'Nanchang', 6500, 1850, 0.08, 'tier1'),
  c('guiyang', '贵阳', 'Guiyang', 6800, 1890, 0.08, 'tier1'),
  c('nanning', '南宁', 'Nanning', 6300, 1810, 0.08, 'tier1'),
  c('lanzhou', '兰州', 'Lanzhou', 6400, 1870, 0.08, 'tier1'),

  // ---- 全手动 ----
  c('custom', '自定义', 'Custom', 10000, 2000, 0.07, 'tier1', {
    socialBaseMin: 0,
    socialBaseMax: Number.POSITIVE_INFINITY,
    hfBaseMax: Number.POSITIVE_INFINITY,
    hfRateMin: 0,
  }),
];

export const DEFAULT_CITY = 'shanghai';

export function getCity(code: string): CityProfile {
  return CN_CITIES.find((x) => x.code === code) ?? CN_CITIES.find((x) => x.code === DEFAULT_CITY)!;
}

/** 按法规推导的社保缴费基数区间 */
export function socialBaseRange(city: CityProfile): { min: number; max: number } {
  return {
    min: city.socialBaseMin ?? Math.round(city.avgWage * SOCIAL_BASE_FLOOR_RATIO),
    max: city.socialBaseMax ?? Math.round(city.avgWage * SOCIAL_BASE_CEIL_RATIO),
  };
}

/** 公积金缴存基数区间：下限为当地最低工资，上限通常同样是 3 倍社平 */
export function housingFundBaseRange(city: CityProfile): { min: number; max: number } {
  return {
    min: city.minWage,
    max: city.hfBaseMax ?? Math.round(city.avgWage * SOCIAL_BASE_CEIL_RATIO),
  };
}

export const CN_JURISDICTIONS: readonly Jurisdiction[] = CN_CITIES.map((city) => {
  const s = socialBaseRange(city);
  const custom = city.code === 'custom';
  return {
    code: city.code,
    name: city.name,
    note: custom
      ? {
          zh: '全部参数由你自己填写，引擎不做任何默认假设',
          en: 'All parameters are yours to fill in; the engine assumes nothing.',
        }
      : {
          zh:
            `按社平工资 ¥${city.avgWage.toLocaleString('zh-CN')}/月 推导：` +
            `社保基数 ¥${s.min.toLocaleString('zh-CN')}–¥${s.max.toLocaleString('zh-CN')}（60%–300%）。` +
            '社平工资每年调整，请对照当地公告或工资条核对。',
          en:
            `Derived from an average wage of ${city.avgWage.toLocaleString('en-US')}/month: ` +
            `contribution base ${s.min.toLocaleString('en-US')}–${s.max.toLocaleString('en-US')} (60%–300%). ` +
            'The average wage is revised annually — verify against local notices or your payslip.',
        },
  };
});
