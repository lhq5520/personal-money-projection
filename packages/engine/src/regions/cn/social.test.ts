import { describe, expect, it } from 'vitest';
import { computeContributions, monthlySpecialDeduction } from './social.js';
import {
  CN_CITIES,
  CN_MEDICAL_RATE,
  CN_PENSION_RATE,
  baseRangeFor,
  derivedBase,
  getCity,
  housingFundBaseRange,
  socialBaseRange,
} from './cities.js';
import { CN_PROVINCES, getProvince } from './provinces.js';
import type { CnSpecialDeductions } from '../../types.js';

const shanghai = getCity('shanghai');
const base: CnSpecialDeductions = {
  childrenCount: 0,
  infantCount: 0,
  continuingEducation: 'none',
  housingType: 'none',
  elderlyCare: 'none',
};

const shRate = CN_PENSION_RATE + CN_MEDICAL_RATE + shanghai.unemployment;

describe('缴费基数按法规推导', () => {
  it('下限 = 社平 × 60%，上限 = 社平 × 300%', () => {
    const r = socialBaseRange(shanghai);
    // The average wage is the provincially pooled driver value and lives in provinces.ts.
    // 社平工资是省级统筹的驱动值，放在 provinces.ts
    const avgWage = getProvince(shanghai.province).avgWage;
    expect(r.min).toBe(Math.round(avgWage * 0.6));
    expect(r.max).toBe(Math.round(avgWage * 3));
    // Before rounding, 300% / 60% is always exactly 5×; allow 1 yuan once both ends are rounded.
    // 300% / 60% 在未取整时恒为 5 倍；两端各自四舍五入后允许 1 元误差
    expect(Math.abs(r.max - r.min * 5)).toBeLessThanOrEqual(1);
  });

  it('公积金基数下限为当地最低工资', () => {
    expect(housingFundBaseRange(shanghai).min).toBe(shanghai.minWage);
  });

  it('部分城市的基数另有规定，用显式覆盖表达', () => {
    const sz = getCity('shenzhen');
    // Shenzhen's pension is pooled provincially, so the floor is not "local average × 60%".
    // 深圳养老按省级统筹，下限不等于「本地社平 × 60%」
    expect(socialBaseRange(sz).min).toBe(4_775);
    expect(socialBaseRange(sz).min).not.toBe(derivedBase(sz).min);
  });
});

describe('缴费基数上下限', () => {
  it('月薪高于上限时按上限封顶——原型页面缺这一步，会高估高薪者的社保支出', () => {
    const max = socialBaseRange(shanghai).max;
    const c = computeContributions(60_000, shanghai);
    expect(c.socialBase).toBe(max);
    expect(c.socialBaseCapped).toBe(true);
    expect(c.socialTotal).toBeCloseTo(max * shRate, 2);
    expect(c.socialTotal).toBeLessThan(60_000 * shRate);
  });

  it('月薪低于下限时按下限保底', () => {
    const c = computeContributions(3_000, shanghai);
    expect(c.socialBase).toBe(socialBaseRange(shanghai).min);
    expect(c.socialBaseCapped).toBe(false);
  });

  it('月薪在区间内时按实际工资计缴', () => {
    const c = computeContributions(14_600, shanghai);
    expect(c.socialBase).toBe(14_600);
    expect(c.socialTotal).toBeCloseTo(14_600 * shRate, 6);
    expect(c.housingFundSelf).toBeCloseTo(14_600 * shanghai.hfRateDefault, 6);
    expect(c.housingFundEmployer).toBeCloseTo(14_600 * shanghai.hfRateDefault, 6);
  });

  it('明细拆分为养老/医疗/失业三项，合计与总额一致', () => {
    const c = computeContributions(14_600, shanghai);
    expect(c.breakdown.map((b) => b.code)).toEqual(['cn-pension', 'cn-medical', 'cn-unemployment']);
    expect(c.breakdown.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(c.socialTotal, 9);
  });

  it('个税专项扣除 = 社保个人部分 + 公积金个人部分', () => {
    const c = computeContributions(14_600, shanghai);
    expect(c.taxDeductible).toBeCloseTo(c.socialTotal + c.housingFundSelf, 9);
  });

  it('公积金基数与养老基数各自独立封顶', () => {
    const sz = getCity('shenzhen');
    const hf = housingFundBaseRange(sz);
    const c = computeContributions(35_000, sz);
    expect(c.socialBase).toBe(socialBaseRange(sz).max); // 养老 27,549，已封顶
    expect(c.housingFundBase).toBe(35_000); // 公积金上限 40,260，未封顶
    expect(hf.max).toBeGreaterThan(socialBaseRange(sz).max);
    expect(c.housingFundBaseCapped).toBe(false);
  });

  it('overrides 能完全接管默认值，供工资条对不上的人使用', () => {
    const c = computeContributions(20_000, shanghai, {
      socialBaseMax: 20_000,
      socialRateSelf: 0.08,
      planRateSelf: 0.12,
      planRateEmployer: 0.05,
    });
    expect(c.socialTotal).toBeCloseTo(20_000 * 0.08, 6);
    expect(c.housingFundSelf).toBeCloseTo(20_000 * 0.12, 6);
    expect(c.housingFundEmployer).toBeCloseTo(20_000 * 0.05, 6);
  });
});

describe('逐险种基数（广东各市养老与医疗分别统筹）', () => {
  it('深圳养老与医疗的基数区间不同——用统一基数会算错', () => {
    const sz = getCity('shenzhen');
    const pension = baseRangeFor(sz, 'pension');
    const medical = baseRangeFor(sz, 'medical');
    expect(pension.max).toBe(27_549);
    expect(medical.max).toBe(33_633);
    expect(medical.max).not.toBe(pension.max);
    expect(medical.min).not.toBe(pension.min);
  });

  it('月薪落在两个上限之间时，养老已封顶而医疗未封顶', () => {
    const sz = getCity('shenzhen');
    const c = computeContributions(30_000, sz); // 27,549 < 30,000 < 33,633
    const pension = c.breakdown.find((b) => b.code === 'cn-pension')!;
    const medical = c.breakdown.find((b) => b.code === 'cn-medical')!;
    expect(pension.capped).toBe(true);
    expect(medical.capped).toBe(false);
    expect(pension.amount).toBeCloseTo(27_549 * CN_PENSION_RATE, 2);
    expect(medical.amount).toBeCloseTo(30_000 * CN_MEDICAL_RATE, 2);
    expect(c.socialBase).toBe(27_549);
    expect(c.medicalBase).toBe(30_000);
  });

  it('若沿用旧的「单一社保基数」模型，深圳高薪者的医保会被少算', () => {
    const sz = getCity('shenzhen');
    const c = computeContributions(32_000, sz);
    const medical = c.breakdown.find((b) => b.code === 'cn-medical')!.amount;
    const legacy = 27_549 * CN_MEDICAL_RATE; // old model: medical capped at the pension ceiling too 旧模型：医保也按养老上限封顶
    expect(medical).toBeGreaterThan(legacy);
  });

  it('未指定逐险种基数的城市，三个险种共用推导值', () => {
    const sh = getCity('shanghai');
    for (const k of ['pension', 'medical', 'unemployment'] as const) {
      expect(baseRangeFor(sh, k)).toEqual(derivedBase(sh));
    }
  });
});

describe('专项附加扣除', () => {
  it('无任何扣除项时为 0', () => {
    expect(monthlySpecialDeduction(base, shanghai)).toBe(0);
  });

  it('子女教育每人每月 2000', () => {
    expect(monthlySpecialDeduction({ ...base, childrenCount: 2 }, shanghai)).toBe(4_000);
  });

  it('3 岁以下婴幼儿照护每人每月 2000', () => {
    expect(monthlySpecialDeduction({ ...base, infantCount: 1 }, shanghai)).toBe(2_000);
  });

  it('学历继续教育 400/月；职业资格 3600/年按月摊', () => {
    expect(monthlySpecialDeduction({ ...base, continuingEducation: 'degree' }, shanghai)).toBe(400);
    expect(monthlySpecialDeduction({ ...base, continuingEducation: 'vocational' }, shanghai)).toBe(300);
  });

  it('住房租金按城市档位；上海为 tier1 = 1500', () => {
    expect(monthlySpecialDeduction({ ...base, housingType: 'rent' }, shanghai)).toBe(1_500);
    expect(monthlySpecialDeduction({ ...base, housingType: 'rent', rentTier: 'tier3' }, shanghai)).toBe(800);
  });

  it('苏州档位为 tier2，租金扣除 1100', () => {
    expect(monthlySpecialDeduction({ ...base, housingType: 'rent' }, getCity('suzhou'))).toBe(1_100);
  });

  it('住房贷款利息 1000/月，且与租金互斥（由联合类型在编译期保证）', () => {
    expect(monthlySpecialDeduction({ ...base, housingType: 'loan' }, shanghai)).toBe(1_000);
  });

  it('赡养老人：独生子女 3000，非独生子女分摊上限 1500', () => {
    expect(monthlySpecialDeduction({ ...base, elderlyCare: 'only-child' }, shanghai)).toBe(3_000);
    expect(monthlySpecialDeduction({ ...base, elderlyCare: 'shared', elderlyShareAmount: 1_200 }, shanghai)).toBe(1_200);
    expect(monthlySpecialDeduction({ ...base, elderlyCare: 'shared', elderlyShareAmount: 3_000 }, shanghai)).toBe(1_500);
  });

  it('多项叠加：2 个孩子 + 租房 + 独生子女赡养 = 8500/月，一年 10.2 万', () => {
    const d: CnSpecialDeductions = { ...base, childrenCount: 2, housingType: 'rent', elderlyCare: 'only-child' };
    expect(monthlySpecialDeduction(d, shanghai)).toBe(8_500);
    expect(monthlySpecialDeduction(d, shanghai) * 12).toBe(102_000);
  });
});

describe('城市与省份覆盖', () => {
  it('包含 30 个以上城市，且 code 唯一', () => {
    expect(CN_CITIES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CN_CITIES.map((c) => c.code)).size).toBe(CN_CITIES.length);
  });

  it('每个城市都指向一个存在的省级统筹单位', () => {
    const provinceCodes = new Set(CN_PROVINCES.map((p) => p.code));
    for (const city of CN_CITIES) {
      if (city.code === 'custom') continue;
      expect(provinceCodes.has(city.province)).toBe(true);
    }
  });

  it('同省各市共用同一套推导基数——这正是省级统筹的含义', () => {
    // Nanjing, Suzhou and Wuxi are all in Jiangsu.
    // 南京、苏州、无锡同属江苏
    const js = ['nanjing', 'suzhou', 'wuxi'].map((c) => derivedBase(getCity(c)));
    expect(js[1]).toEqual(js[0]);
    expect(js[2]).toEqual(js[0]);
    // But their rent deduction tiers differ — Nanjing is the provincial capital, the others aren't.
    // 但它们的租金扣除档位不同（南京是省会，苏州无锡不是）
    expect(getCity('nanjing').rentTier).toBe('tier1');
    expect(getCity('suzhou').rentTier).toBe('tier2');
  });

  it('省级数据一改，全省各市一起更新——维护量从 34 个数字降到 21 个', () => {
    expect(CN_PROVINCES.length).toBeLessThan(CN_CITIES.length);
    const verified = CN_PROVINCES.filter((p) => p.provenance.confidence === 'verified');
    expect(verified.length).toBeGreaterThanOrEqual(20);
  });
});
