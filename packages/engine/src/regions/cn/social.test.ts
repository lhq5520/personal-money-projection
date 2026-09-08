import { describe, expect, it } from 'vitest';
import { computeContributions, monthlySpecialDeduction } from './social.js';
import { getCity } from './cities.js';
import type { SpecialDeductions } from '../../types.js';

const shanghai = getCity('shanghai');
const base: SpecialDeductions = {
  childrenCount: 0,
  infantCount: 0,
  continuingEducation: 'none',
  housingType: 'none',
  elderlyCare: 'none',
};

describe('缴费基数上下限', () => {
  it('月薪高于上限时按上限封顶——原型页面缺这一步，会高估高薪者的社保支出', () => {
    const c = computeContributions(60_000, shanghai);
    expect(c.socialBase).toBe(shanghai.social.baseMax);
    expect(c.socialBaseCapped).toBe(true);
    // 原页面按 60000 全额算：60000 × 10.5% = 6300，实际只需 3876.7
    expect(c.socialTotal).toBeCloseTo(36_921 * 0.105, 2);
    expect(c.socialTotal).toBeLessThan(60_000 * 0.105);
  });

  it('月薪低于下限时按下限保底', () => {
    const c = computeContributions(3_000, shanghai);
    expect(c.socialBase).toBe(shanghai.social.baseMin);
    expect(c.socialBaseCapped).toBe(false);
  });

  it('月薪在区间内时按实际工资计缴', () => {
    const c = computeContributions(14_600, shanghai);
    expect(c.socialBase).toBe(14_600);
    expect(c.socialTotal).toBeCloseTo(14_600 * 0.105, 6);
    expect(c.housingFundSelf).toBeCloseTo(14_600 * 0.07, 6);
    expect(c.housingFundEmployer).toBeCloseTo(14_600 * 0.07, 6);
  });

  it('个税专项扣除 = 社保个人部分 + 公积金个人部分', () => {
    const c = computeContributions(14_600, shanghai);
    expect(c.taxDeductible).toBeCloseTo(c.socialTotal + c.housingFundSelf, 9);
  });

  it('公积金基数与社保基数各自独立封顶', () => {
    const shenzhen = getCity('shenzhen');
    const c = computeContributions(35_000, shenzhen);
    expect(c.socialBase).toBe(shenzhen.social.baseMax); // 27927，已封顶
    expect(c.housingFundBase).toBe(35_000); // 公积金上限 40260，未封顶
    expect(c.socialBaseCapped).toBe(true);
    expect(c.housingFundBaseCapped).toBe(false);
  });

  it('overrides 能完全接管城市默认值，供工资条对不上的人使用', () => {
    const c = computeContributions(20_000, shanghai, {
      socialBaseMax: 20_000,
      socialRateSelf: 0.08,
      housingFundRateSelf: 0.12,
      housingFundRateEmployer: 0.05,
    });
    expect(c.socialTotal).toBeCloseTo(20_000 * 0.08, 6);
    expect(c.housingFundSelf).toBeCloseTo(20_000 * 0.12, 6);
    expect(c.housingFundEmployer).toBeCloseTo(20_000 * 0.05, 6);
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

  it('住房贷款利息 1000/月，且与租金互斥（由联合类型在编译期保证）', () => {
    expect(monthlySpecialDeduction({ ...base, housingType: 'loan' }, shanghai)).toBe(1_000);
  });

  it('赡养老人：独生子女 3000，非独生子女分摊上限 1500', () => {
    expect(monthlySpecialDeduction({ ...base, elderlyCare: 'only-child' }, shanghai)).toBe(3_000);
    expect(
      monthlySpecialDeduction({ ...base, elderlyCare: 'shared', elderlyShareAmount: 1_200 }, shanghai),
    ).toBe(1_200);
    // 超过法定上限的部分被截断
    expect(
      monthlySpecialDeduction({ ...base, elderlyCare: 'shared', elderlyShareAmount: 3_000 }, shanghai),
    ).toBe(1_500);
  });

  it('多项叠加：2 个孩子 + 租房 + 独生子女赡养 = 8500/月，一年 10.2 万——原型页面完全没算这块', () => {
    const d: SpecialDeductions = {
      ...base,
      childrenCount: 2,
      housingType: 'rent',
      elderlyCare: 'only-child',
    };
    expect(monthlySpecialDeduction(d, shanghai)).toBe(8_500);
    expect(monthlySpecialDeduction(d, shanghai) * 12).toBe(102_000);
  });
});
