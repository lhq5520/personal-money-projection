/**
 * 城市级五险一金参数。
 *
 * ⚠️ 数据准确性声明 —— 请务必阅读
 * 社保缴费基数上下限每年随「上年度全口径城镇单位就业人员平均工资」调整（多数城市在 7 月切换年度），
 * 公积金缴存比例和基数上限也逐年变化。下面的数值是 2024–2025 社保年度的**近似默认值**，
 * 用于给出合理的起始点，**不是权威数据**。
 *
 * 因此本引擎的设计是：
 *   1. 每个字段都可以被 ProjectionInput.overrides 覆盖；
 *   2. UI 层必须允许用户照着自己的工资条改这些数字；
 *   3. profile.effectiveNote 会在界面上明示数据口径与核对方式。
 *
 * 核对渠道：当地人社局 / 公积金管理中心官网年度公告，或直接看你自己的工资条。
 */

import type { RentTier } from '../../types.js';

export interface CityProfile {
  code: string;
  name: string;
  /** 数据口径说明，会原样展示给用户 */
  effectiveNote: string;
  social: {
    baseMin: number;
    baseMax: number;
    /** 养老保险个人费率 */
    pension: number;
    /** 医疗保险个人费率 */
    medical: number;
    /** 失业保险个人费率 */
    unemployment: number;
  };
  housingFund: {
    baseMin: number;
    baseMax: number;
    /** 默认缴存比例（个人与单位通常同比例） */
    rateDefault: number;
    rateMin: number;
    rateMax: number;
  };
  /** 个税住房租金专项附加扣除的城市档位 */
  rentTier: RentTier;
}

const NOTE_2024 = '基于 2024–2025 社保年度公布值的近似默认，请对照工资条或当地官网年度公告核对';

export const CN_CITIES: readonly CityProfile[] = [
  {
    code: 'shanghai',
    name: '上海',
    effectiveNote: NOTE_2024,
    social: { baseMin: 7384, baseMax: 36921, pension: 0.08, medical: 0.02, unemployment: 0.005 },
    housingFund: { baseMin: 2690, baseMax: 36921, rateDefault: 0.07, rateMin: 0.05, rateMax: 0.07 },
    rentTier: 'tier1',
  },
  {
    code: 'beijing',
    name: '北京',
    effectiveNote: NOTE_2024,
    social: { baseMin: 6821, baseMax: 35283, pension: 0.08, medical: 0.02, unemployment: 0.005 },
    housingFund: { baseMin: 2420, baseMax: 35283, rateDefault: 0.12, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'shenzhen',
    name: '深圳',
    effectiveNote: `${NOTE_2024}（深圳医保分一/二/三档，此处按一档估算）`,
    social: { baseMin: 2360, baseMax: 27927, pension: 0.08, medical: 0.02, unemployment: 0.003 },
    housingFund: { baseMin: 2360, baseMax: 40260, rateDefault: 0.05, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'guangzhou',
    name: '广州',
    effectiveNote: NOTE_2024,
    social: { baseMin: 4546, baseMax: 26421, pension: 0.08, medical: 0.02, unemployment: 0.002 },
    housingFund: { baseMin: 2300, baseMax: 39457, rateDefault: 0.05, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'hangzhou',
    name: '杭州',
    effectiveNote: NOTE_2024,
    social: { baseMin: 4462, baseMax: 24930, pension: 0.08, medical: 0.02, unemployment: 0.005 },
    housingFund: { baseMin: 2490, baseMax: 37401, rateDefault: 0.12, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'chengdu',
    name: '成都',
    effectiveNote: NOTE_2024,
    social: { baseMin: 4511, baseMax: 22557, pension: 0.08, medical: 0.02, unemployment: 0.004 },
    housingFund: { baseMin: 2100, baseMax: 33835, rateDefault: 0.08, rateMin: 0.06, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'nanjing',
    name: '南京',
    effectiveNote: NOTE_2024,
    social: { baseMin: 4879, baseMax: 24396, pension: 0.08, medical: 0.02, unemployment: 0.005 },
    housingFund: { baseMin: 2280, baseMax: 36594, rateDefault: 0.08, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'wuhan',
    name: '武汉',
    effectiveNote: NOTE_2024,
    social: { baseMin: 4571, baseMax: 22854, pension: 0.08, medical: 0.02, unemployment: 0.003 },
    housingFund: { baseMin: 2210, baseMax: 34281, rateDefault: 0.08, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier1',
  },
  {
    code: 'suzhou',
    name: '苏州',
    effectiveNote: NOTE_2024,
    social: { baseMin: 4494, baseMax: 24042, pension: 0.08, medical: 0.02, unemployment: 0.005 },
    housingFund: { baseMin: 2280, baseMax: 36063, rateDefault: 0.08, rateMin: 0.05, rateMax: 0.12 },
    rentTier: 'tier2',
  },
  {
    code: 'custom',
    name: '自定义',
    effectiveNote: '全部参数由你自己填写，引擎不做任何默认假设',
    social: { baseMin: 0, baseMax: Number.POSITIVE_INFINITY, pension: 0.08, medical: 0.02, unemployment: 0.005 },
    housingFund: { baseMin: 0, baseMax: Number.POSITIVE_INFINITY, rateDefault: 0.07, rateMin: 0, rateMax: 0.12 },
    rentTier: 'tier1',
  },
];

export const DEFAULT_CITY = 'shanghai';

export function getCity(code: string): CityProfile {
  return CN_CITIES.find((c) => c.code === code) ?? CN_CITIES.find((c) => c.code === DEFAULT_CITY)!;
}
