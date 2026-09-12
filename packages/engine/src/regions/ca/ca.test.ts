import { describe, expect, it } from 'vitest';
import { CA_REGION } from './index.js';
import { bracketTax } from '../../tax/brackets.js';
import {
  CA_PAYROLL_PROVENANCE,
  CPP2_RATE,
  CPP_BASIC_EXEMPTION,
  CPP_RATE,
  EI_MAX_INSURABLE,
  FEDERAL_BRACKETS_PREV_YEAR,
  FEDERAL_BRACKETS_UPSTREAM,
  FEDERAL_INDEXATION_2026,
  EI_RATE,
  EI_RATE_QC,
  FEDERAL_BPA,
  FEDERAL_BRACKETS,
  QPP_RATE,
  QUEBEC_ABATEMENT,
  RRSP_DOLLAR_LIMIT,
  RRSP_RATE_LIMIT,
  YAMPE,
  YMPE,
  computePayroll,
  rrspRoom,
} from './federal.js';
import { CA_PROVINCES, computeSurtax, getProvince } from './provinces.js';
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
    expect(computePayroll(10_000, false).cpp).toBeCloseTo((10_000 - CPP_BASIC_EXEMPTION) * CPP_RATE, 2);
  });

  it('CPP 在 YMPE 处封顶，超出部分进入 CPP2 直到 YAMPE', () => {
    const p = computePayroll(100_000, false);
    // 只断言恒等关系，不写死金额——限额每年都调，写死会在更新后误报
    expect(p.cpp).toBeCloseTo((YMPE - CPP_BASIC_EXEMPTION) * CPP_RATE, 2);
    expect(p.cpp2).toBeCloseTo((YAMPE - YMPE) * CPP2_RATE, 2);
    // 超过 YAMPE 后两级都不再增加
    const rich = computePayroll(500_000, false);
    expect(rich.cpp + rich.cpp2).toBeCloseTo(p.cpp + p.cpp2, 6);
  });

  it('EI 在最高可保收入处封顶', () => {
    expect(computePayroll(100_000, false).ei).toBeCloseTo(EI_MAX_INSURABLE * EI_RATE, 2);
    // 超过最高可保收入后再涨薪，保费一分不增
    expect(computePayroll(500_000, false).ei).toBeCloseTo(computePayroll(100_000, false).ei, 6);
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
    // 阈值取自数据本身：安省每年按其自己的 CPI 指数化，写死会在更新后误报
    const [b1, b2] = [on.brackets[0]!, on.brackets[1]!];
    const before = b1.upTo * b1.rate + (100_000 - b1.upTo) * b2.rate;
    const provincial = before - on.bpa * b1.rate;
    expect(y.taxBreakdown.find((t) => t.code === 'regional')!.amount).toBeCloseTo(provincial, 2);
    // 附加税对「省税额」而非收入计征
    const s1 = on.surtax![0]!;
    expect(y.taxBreakdown.find((t) => t.code === 'surtax')!.amount).toBeCloseTo(
      (provincial - s1.threshold) * s1.rate,
      2,
    );
  });

  it('省税低于附加税门槛时不征附加税', () => {
    const on = getProvince('ON');
    const [s1, s2] = [on.surtax![0]!, on.surtax![1]!];
    expect(computeSurtax(s1.threshold - 1, on)).toBe(0);
    // 落在两档之间：只征第一档
    const mid = (s1.threshold + s2.threshold) / 2;
    expect(computeSurtax(mid, on)).toBeCloseTo((mid - s1.threshold) * s1.rate, 6);
    // 高收入触发第二档，两档叠加
    const high = s2.threshold * 1.5;
    expect(computeSurtax(high, on)).toBeCloseTo(
      (high - s1.threshold) * s1.rate + (high - s2.threshold) * s2.rate,
      6,
    );
  });

  it('省级分档单调递增、最高档无上界、税率递增', () => {
    for (const prov of CA_PROVINCES) {
      const rows = prov.brackets;
      expect(rows.length, `${prov.code} 应有分档`).toBeGreaterThan(0);
      expect(rows.at(-1)!.upTo, `${prov.code} 最高档应无上界`).toBe(Number.POSITIVE_INFINITY);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.upTo, `${prov.code} 第 ${i + 1} 档上界`).toBeGreaterThan(rows[i - 1]!.upTo);
        expect(rows[i]!.rate, `${prov.code} 第 ${i + 1} 档税率`).toBeGreaterThan(rows[i - 1]!.rate);
      }
      // 基本个人金额在合理区间：艾伯塔最高 22,769，新斯科舍最低 11,932
      expect(prov.bpa, `${prov.code} 基本个人金额`).toBeGreaterThan(10_000);
      expect(prov.bpa, `${prov.code} 基本个人金额`).toBeLessThan(30_000);
    }
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

describe('手工维护数据的自洽校验', () => {
  /**
   * CPP/EI 的限额没有任何可自动同步的源，只能人工从 CRA 页面抄。
   * 抄错一位数不会有任何报错——除非有这些恒等式把关。
   * 每年更新完 federal.ts 之后，这一组是第一道防线。
   */
  it('CPP 最大缴款 = (YMPE − 基本免征额) × 费率', () => {
    const p = computePayroll(1_000_000, false);
    expect(p.cpp).toBeCloseTo((YMPE - CPP_BASIC_EXEMPTION) * CPP_RATE, 2);
  });

  it('CPP2 最大缴款 = (YAMPE − YMPE) × 第二级费率', () => {
    const p = computePayroll(1_000_000, false);
    expect(p.cpp2).toBeCloseTo((YAMPE - YMPE) * CPP2_RATE, 2);
  });

  it('EI 最大保费 = 最高可保收入 × 费率', () => {
    expect(computePayroll(1_000_000, false).ei).toBeCloseTo(EI_MAX_INSURABLE * EI_RATE, 2);
  });

  it('各限额之间的大小关系必须成立', () => {
    expect(YAMPE).toBeGreaterThan(YMPE);
    expect(YMPE).toBeGreaterThan(CPP_BASIC_EXEMPTION);
    // 魁北克的 QPP 费率高于其余省份的 CPP，EI 费率则更低
    expect(QPP_RATE).toBeGreaterThan(CPP_RATE);
    expect(EI_RATE_QC).toBeLessThan(EI_RATE);
  });

  it('RRSP 绝对上限应与收入比例限额在合理量级上一致', () => {
    // 绝对上限大致对应「18% × 某个高收入」，两者相差不该超过一个数量级
    const impliedIncome = RRSP_DOLLAR_LIMIT / RRSP_RATE_LIMIT;
    expect(impliedIncome).toBeGreaterThan(YMPE);
    expect(impliedIncome).toBeLessThan(YMPE * 5);
  });

  it('联邦基本个人金额高于 CPP 基本免征额，且在合理区间内', () => {
    expect(FEDERAL_BPA).toBeGreaterThan(CPP_BASIC_EXEMPTION);
    expect(FEDERAL_BPA).toBeLessThan(30_000);
  });

  it('联邦阈值符合 CRA 公布的通胀指数化系数——这是手工录入的第二道防线', () => {
    // 每年的联邦阈值由上一年乘以 CRA 公布的指数化系数得出。
    // 抄错一位数几乎不可能同时满足这个关系，所以它能抓住绝大多数录入错误。
    // 指数化后各自四舍五入到整元，允许 1 元误差
    FEDERAL_BRACKETS_PREV_YEAR.forEach((prev, i) => {
      expect(Math.abs(FEDERAL_BRACKETS[i]!.upTo - prev * FEDERAL_INDEXATION_2026)).toBeLessThanOrEqual(1);
    });
    // 基本个人金额同样按该系数调整
    expect(Math.abs(FEDERAL_BPA - 16_129 * FEDERAL_INDEXATION_2026)).toBeLessThanOrEqual(1);
  });

  it('上游联邦表已知落后，所以不参与计算——但保留下来做对照', () => {
    // 上游的费率是对的（2026 已降到 14%），阈值却停在 2025。
    // 如果哪天上游追上了，这条断言会失败，提醒我们可以切回同步值。
    expect(FEDERAL_BRACKETS_UPSTREAM[0]!.rate).toBe(FEDERAL_BRACKETS[0]!.rate);
    expect(FEDERAL_BRACKETS_UPSTREAM[0]!.upTo).toBeLessThan(FEDERAL_BRACKETS[0]!.upTo);
  });

  it('CPP/EI 数据带出处，过期会被 data:audit 发现', () => {
    expect(CA_PAYROLL_PROVENANCE.effectiveTo).toMatch(/^\d{4}-12-31$/);
    expect(CA_PAYROLL_PROVENANCE.sourceUrl).toContain('canada.ca');
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
