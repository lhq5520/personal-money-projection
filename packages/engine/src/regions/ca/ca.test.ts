import { describe, expect, it } from 'vitest';
import { CA_REGION } from './index.js';
import { bracketTax } from '../../tax/brackets.js';
import {
  CPP_BASIC_EXEMPTION,
  FEDERAL_BRACKETS,
  EI_MAX_INSURABLE,
  FEDERAL_BPA,
  QUEBEC_ABATEMENT,
  RRSP_DOLLAR_LIMIT,
  YAMPE,
  YMPE,
  computePayroll,
  rrspRoom,
} from './federal.js';
import { computeSurtax, getProvince } from './provinces.js';
import { defaultInput } from '../../defaults.js';
import type { ProjectionInput } from '../../types.js';

const make = (patch: (i: ProjectionInput) => void): ProjectionInput => {
  const i = JSON.parse(JSON.stringify(defaultInput('CA'))) as ProjectionInput;
  patch(i);
  return i;
};

const atSalary = (annual: number, province = 'ON', patch: (i: ProjectionInput) => void = () => {}) =>
  CA_REGION.computeYear(
    make((i) => {
      i.jurisdiction = province;
      i.income.monthlySalary = annual / 12;
      i.income.salaryMonths = 12;
      i.ca.rrspRate = 0;
      i.ca.employerMatchRate = 0;
      patch(i);
    }),
    1,
    annual / 12,
  );

describe('CPP 与 EI', () => {
  it('CPP 有基本免征额，前 3500 加元不计缴——这一点常被忽略', () => {
    expect(computePayroll(CPP_BASIC_EXEMPTION, false).cpp).toBeCloseTo(0, 6);
    expect(computePayroll(10_000, false).cpp).toBeCloseTo((10_000 - 3_500) * 0.0595, 2);
  });

  it('CPP 在 YMPE 处封顶，超出部分进入 CPP2 直到 YAMPE', () => {
    const p = computePayroll(100_000, false);
    expect(p.cpp).toBeCloseTo((YMPE - CPP_BASIC_EXEMPTION) * 0.0595, 2);
    expect(p.cpp).toBeCloseTo(4_034.1, 2);
    expect(p.cpp2).toBeCloseTo((YAMPE - YMPE) * 0.04, 2);
    expect(p.cpp2).toBeCloseTo(396, 2);
    // 超过 YAMPE 后两级都不再增加
    const rich = computePayroll(500_000, false);
    expect(rich.cpp + rich.cpp2).toBeCloseTo(p.cpp + p.cpp2, 6);
  });

  it('EI 在最高可保收入处封顶', () => {
    expect(computePayroll(100_000, false).ei).toBeCloseTo(EI_MAX_INSURABLE * 0.0164, 2);
    expect(computePayroll(100_000, false).ei).toBeCloseTo(1_077.48, 2);
  });

  it('魁北克用 QPP（费率更高）与 QPIP，EI 费率则更低', () => {
    const qc = computePayroll(100_000, true);
    const rest = computePayroll(100_000, false);
    expect(qc.cpp).toBeGreaterThan(rest.cpp);
    expect(qc.ei).toBeLessThan(rest.ei);
    expect(qc.qpip).toBeGreaterThan(0);
    expect(rest.qpip).toBe(0);
  });
});

describe('联邦与省税（黄金用例）', () => {
  it('安大略、年薪 10 万、无 RRSP：联邦税可逐档手算复核', () => {
    const y = atSalary(100_000, 'ON');
    const federal = y.taxBreakdown.find((t) => t.code === 'national')!.amount;
    // 税率取自同步数据而非写死：2025 是过渡年（14.5% 混合税率），2026 起为 14%，
    // 写死任何一个都会在数据更新后误报。
    const r1 = FEDERAL_BRACKETS[0]!.rate;
    const b1 = FEDERAL_BRACKETS[0]!.upTo;
    const r2 = FEDERAL_BRACKETS[1]!.rate;
    const before = b1 * r1 + (100_000 - b1) * r2;
    const credit = FEDERAL_BPA * r1; // 不可退还抵免按最低档折算
    expect(federal).toBeCloseTo(before - credit, 2);
  });

  it('最低档税率反映 2025 年 7 月起的下调（15% → 14%，2025 全年为 14.5% 混合）', () => {
    expect(FEDERAL_BRACKETS[0]!.rate).toBeLessThan(0.15);
    expect(FEDERAL_BRACKETS[0]!.rate).toBeGreaterThanOrEqual(0.14);
  });

  it('安大略省税与附加税可手算复核', () => {
    const y = atSalary(100_000, 'ON');
    const on = getProvince('ON');
    const before = 52_886 * 0.0505 + (100_000 - 52_886) * 0.0915;
    const provincial = before - on.bpa * 0.0505;
    expect(y.taxBreakdown.find((t) => t.code === 'regional')!.amount).toBeCloseTo(provincial, 2);
    // 附加税对「省税额」而非收入计征
    expect(y.taxBreakdown.find((t) => t.code === 'surtax')!.amount).toBeCloseTo(
      (provincial - 5_710) * 0.2,
      2,
    );
  });

  it('省税低于附加税门槛时不征附加税', () => {
    const on = getProvince('ON');
    expect(computeSurtax(3_000, on)).toBe(0);
    expect(computeSurtax(6_000, on)).toBeCloseTo((6_000 - 5_710) * 0.2, 6);
    // 高收入触发第二档，两档叠加
    expect(computeSurtax(10_000, on)).toBeCloseTo((10_000 - 5_710) * 0.2 + (10_000 - 7_307) * 0.36, 6);
  });

  it('基本个人金额是不可退还抵免（按最低档折算），不是所得扣除', () => {
    // 若按扣除处理，高收入者的减免会按其边际税率放大；抵免则不会。
    const low = atSalary(40_000, 'ON');
    const high = atSalary(400_000, 'ON');
    const lowFed = low.taxBreakdown.find((t) => t.code === 'national')!.amount;
    const highFed = high.taxBreakdown.find((t) => t.code === 'national')!.amount;
    const r1 = FEDERAL_BRACKETS[0]!.rate;
    const lowBefore = 40_000 * r1;
    expect(lowBefore - lowFed).toBeCloseTo(FEDERAL_BPA * r1, 2);
    // 抵免金额与收入无关，两者省下的绝对额相同——这正是「抵免」区别于「扣除」之处
    const highBefore = bracketTax(FEDERAL_BRACKETS, 400_000);
    expect(highBefore - highFed).toBeCloseTo(FEDERAL_BPA * r1, 2);
  });

  it('艾伯塔的基本个人金额更高，免税线也更高', () => {
    expect(getProvince('AB').bpa).toBeGreaterThan(getProvince('ON').bpa);
    // 年薪 1.5 万落在艾伯塔的免税额之内，省税为 0；安省已开始征税
    const provincial = (y: ReturnType<typeof atSalary>) =>
      y.taxBreakdown.find((t) => t.code === 'regional')!.amount;
    expect(provincial(atSalary(15_000, 'AB'))).toBe(0);
    expect(provincial(atSalary(15_000, 'ON'))).toBeGreaterThan(0);
  });

  it('中等收入下安省反而更低——起征税率 5.05% 低于艾伯塔的 8%，抵消了后者更高的免税额', () => {
    const provincial = (y: ReturnType<typeof atSalary>) =>
      y.taxBreakdown.find((t) => t.code === 'regional')!.amount;
    expect(provincial(atSalary(50_000, 'ON'))).toBeLessThan(provincial(atSalary(50_000, 'AB')));
  });

  it('高收入下艾伯塔明显更低——安省的附加税在此量级已很可观', () => {
    expect(atSalary(300_000, 'AB').taxAnnual).toBeLessThan(atSalary(300_000, 'ON').taxAnnual);
    // 安省附加税单独就有五位数
    expect(atSalary(300_000, 'ON').taxBreakdown.find((t) => t.code === 'surtax')!.amount)
      .toBeGreaterThan(10_000);
  });

  it('魁北克享有 16.5% 的联邦税返还', () => {
    const qc = atSalary(100_000, 'QC');
    const abatement = qc.taxBreakdown.find((t) => t.code === 'credit')!.amount;
    expect(abatement).toBeLessThan(0); // 以负数记入明细
    const federal = qc.taxBreakdown.find((t) => t.code === 'national')!.amount;
    expect(-abatement / (federal - abatement)).toBeCloseTo(QUEBEC_ABATEMENT, 6);
  });
});

describe('RRSP', () => {
  it('供款额度为收入的 18%，且不超过绝对上限', () => {
    expect(rrspRoom(100_000)).toBeCloseTo(18_000, 2);
    expect(rrspRoom(1_000_000)).toBeCloseTo(RRSP_DOLLAR_LIMIT, 2);
  });

  it('缴款可从应税所得中扣除，降低税负', () => {
    const without = atSalary(120_000, 'ON');
    const with_ = atSalary(120_000, 'ON', (i) => { i.ca.rrspRate = 0.15; });
    expect(with_.taxAnnual).toBeLessThan(without.taxAnnual);
    expect(with_.planSelfAnnual).toBeGreaterThan(0);
    // 但 CPP/EI 不因 RRSP 缴款而减少
    expect(with_.socialInsuranceAnnual).toBeCloseTo(without.socialInsuranceAnnual, 6);
  });

  it('缴款受供款额度约束', () => {
    const y = atSalary(300_000, 'ON', (i) => { i.ca.rrspRate = 0.5; });
    expect(y.planSelfAnnual).toBeCloseTo(RRSP_DOLLAR_LIMIT, 2);
  });
});

describe('恒等式', () => {
  it.each([30_000, 100_000, 250_000])('年薪 %d：到手 = 税前 − CPP/EI − RRSP − 所得税', (annual) => {
    const y = atSalary(annual, 'ON');
    expect(y.netAnnual).toBeCloseTo(
      y.grossAnnual - y.socialInsuranceAnnual - y.planSelfAnnual - y.taxAnnual,
      6,
    );
    expect(y.socialBreakdown.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(y.socialInsuranceAnnual, 6);
    expect(y.effectiveTaxRate).toBeGreaterThan(0);
    expect(y.effectiveTaxRate).toBeLessThan(0.55);
  });

  it('十个省全部产出有效结果，且税负率量级合理', () => {
    for (const p of ['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE']) {
      const y = atSalary(90_000, p);
      expect(Number.isFinite(y.taxAnnual)).toBe(true);
      expect(y.taxAnnual).toBeGreaterThan(0);
      expect(y.effectiveTaxRate).toBeGreaterThan(0.1);
      expect(y.effectiveTaxRate).toBeLessThan(0.4);
    }
  });
});
