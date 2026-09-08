import { describe, expect, it } from 'vitest';
import { US_REGION } from './index.js';
import {
  ELECTIVE_DEFERRAL_LIMIT,
  SOCIAL_SECURITY_WAGE_BASE,
  childTaxCredit,
  computeFica,
} from './federal.js';
import { getState } from './states.js';
import { defaultInput } from '../../defaults.js';
import type { ProjectionInput } from '../../types.js';

const make = (patch: (i: ProjectionInput) => void): ProjectionInput => {
  const i = JSON.parse(JSON.stringify(defaultInput('US'))) as ProjectionInput;
  patch(i);
  return i;
};

/** 年薪由 月薪 × 薪数 得到，测试里直接给年薪更直观 */
const atSalary = (annual: number, patch: (i: ProjectionInput) => void = () => {}) =>
  US_REGION.computeYear(
    make((i) => {
      i.income.monthlySalary = annual / 12;
      i.income.salaryMonths = 12;
      i.us.pretaxRetirementRate = 0;
      i.us.employerMatchRate = 0;
      patch(i);
    }),
    1,
    annual / 12,
  );

describe('FICA', () => {
  it('社会保障税在工资基数上限处封顶', () => {
    const low = computeFica(100_000, 'single');
    expect(low.socialSecurity).toBeCloseTo(6_200, 2);
    expect(low.socialSecurityCapped).toBe(false);

    const high = computeFica(500_000, 'single');
    expect(high.socialSecurity).toBeCloseTo(SOCIAL_SECURITY_WAGE_BASE * 0.062, 2);
    expect(high.socialSecurityCapped).toBe(true);
    // 超过上限后再涨薪，社会保障税一分不增
    expect(computeFica(1_000_000, 'single').socialSecurity).toBeCloseTo(high.socialSecurity, 6);
  });

  it('医疗保险税无上限，全额工资计征', () => {
    expect(computeFica(1_000_000, 'single').medicare).toBeCloseTo(14_500, 2);
  });

  it('附加医疗保险税只对超过起征点的部分加征 0.9%', () => {
    expect(computeFica(200_000, 'single').additionalMedicare).toBeCloseTo(0, 6);
    expect(computeFica(300_000, 'single').additionalMedicare).toBeCloseTo(900, 2);
    // 已婚合并申报的起征点更高
    expect(computeFica(300_000, 'married-joint').additionalMedicare).toBeCloseTo(450, 2);
  });
});

describe('联邦所得税（黄金用例）', () => {
  it('单身、年薪 10 万、加州、无 401(k)：逐档累进结果可手算复核', () => {
    const y = atSalary(100_000);
    // 应税所得 = 100,000 − 15,000 标准扣除 = 85,000
    expect(y.taxableAnnual).toBeCloseTo(85_000, 2);
    // 11,925×10% + 36,550×12% + 36,525×22%
    const federal = y.taxBreakdown.find((t) => t.code === 'national')!.amount;
    expect(federal).toBeCloseTo(1_192.5 + 4_386 + 8_035.5, 2);
  });

  it('加州州税按其九档表逐档累进', () => {
    const y = atSalary(100_000);
    const state = y.taxBreakdown.find((t) => t.code === 'regional')!.amount;
    // 应税 = 100,000 − 5,540 = 94,460
    const expected =
      10_756 * 0.01 +
      (25_499 - 10_756) * 0.02 +
      (40_245 - 25_499) * 0.04 +
      (55_866 - 40_245) * 0.06 +
      (70_606 - 55_866) * 0.08 +
      (94_460 - 70_606) * 0.093;
    expect(state).toBeCloseTo(expected, 2);
  });

  it('无州所得税的州只剩联邦税', () => {
    const tx = US_REGION.computeYear(
      make((i) => {
        i.jurisdiction = 'TX';
        i.us.pretaxRetirementRate = 0;
        i.us.employerMatchRate = 0;
      }),
      1,
      100_000 / 12,
    );
    expect(tx.taxBreakdown.some((t) => t.code === 'regional')).toBe(false);
    expect(getState('TX').brackets).toBeNull();
    // 同样年薪，德州到手一定高于加州
    expect(tx.netAnnual).toBeGreaterThan(atSalary(100_000).netAnnual);
  });

  it('纽约市在州税之上另有市税', () => {
    const ny = US_REGION.computeYear(make((i) => { i.jurisdiction = 'NY'; i.us.pretaxRetirementRate = 0; i.us.employerMatchRate = 0; }), 1, 150_000 / 12);
    const nyc = US_REGION.computeYear(make((i) => { i.jurisdiction = 'NYC'; i.us.pretaxRetirementRate = 0; i.us.employerMatchRate = 0; }), 1, 150_000 / 12);
    expect(nyc.taxAnnual).toBeGreaterThan(ny.taxAnnual);
    expect(nyc.taxBreakdown.some((t) => t.code === 'local')).toBe(true);
  });
});

describe('401(k)', () => {
  it('降低所得税税基，但**不降低** FICA——这是很多计算器算错的地方', () => {
    const without = atSalary(150_000);
    const with401k = US_REGION.computeYear(
      make((i) => { i.us.pretaxRetirementRate = 0.1; i.us.employerMatchRate = 0; }),
      1,
      150_000 / 12,
    );
    expect(with401k.taxAnnual).toBeLessThan(without.taxAnnual);
    // FICA 完全不变
    expect(with401k.socialInsuranceAnnual).toBeCloseTo(without.socialInsuranceAnnual, 6);
  });

  it('受法定年度上限约束', () => {
    const y = US_REGION.computeYear(
      make((i) => { i.us.pretaxRetirementRate = 0.5; i.us.employerMatchRate = 0; }),
      1,
      400_000 / 12,
    );
    // 按 50% 应缴 20 万，实际封顶在法定上限
    expect(y.planSelfAnnual).toBeCloseTo(ELECTIVE_DEFERRAL_LIMIT, 2);
  });

  it('雇主匹配进入账户，不计入到手现金', () => {
    const y = US_REGION.computeYear(
      make((i) => { i.us.pretaxRetirementRate = 0.06; i.us.employerMatchRate = 0.04; }),
      1,
      100_000 / 12,
    );
    expect(y.planEmployerAnnual).toBeCloseTo(4_000, 2);
    expect(y.netAnnual).toBeCloseTo(
      y.grossAnnual - y.socialInsuranceAnnual - y.planSelfAnnual - y.taxAnnual,
      6,
    );
  });
});

describe('儿童税收抵免', () => {
  it('每名子女 2000 美元，收入未超门槛时全额', () => {
    expect(childTaxCredit(2, 150_000, 'single')).toBe(4_000);
  });

  it('超过门槛后每 1000 美元递减 50 美元', () => {
    expect(childTaxCredit(1, 210_000, 'single')).toBe(2_000 - 10 * 50);
    expect(childTaxCredit(1, 250_000, 'single')).toBe(0);
  });

  it('抵免不会把税额压到负数', () => {
    const y = US_REGION.computeYear(
      make((i) => { i.us.qualifyingChildren = 5; i.us.pretaxRetirementRate = 0; i.us.employerMatchRate = 0; }),
      1,
      30_000 / 12,
    );
    expect(y.taxAnnual).toBeGreaterThanOrEqual(0);
  });
});

describe('申报身份', () => {
  it('已婚合并申报的分档更宽，同样收入税更低', () => {
    const single = atSalary(200_000);
    const joint = US_REGION.computeYear(
      make((i) => { i.us.filingStatus = 'married-joint'; i.us.pretaxRetirementRate = 0; i.us.employerMatchRate = 0; }),
      1,
      200_000 / 12,
    );
    expect(joint.taxAnnual).toBeLessThan(single.taxAnnual);
  });
});

describe('恒等式', () => {
  it.each([30_000, 100_000, 250_000, 600_000])('年薪 %d：到手 = 税前 − FICA − 401(k) − 所得税', (annual) => {
    const y = atSalary(annual);
    expect(y.netAnnual).toBeCloseTo(
      y.grossAnnual - y.socialInsuranceAnnual - y.planSelfAnnual - y.taxAnnual,
      6,
    );
    expect(y.taxBreakdown.filter((t) => t.code !== 'credit').reduce((s, t) => s + t.amount, 0))
      .toBeCloseTo(y.taxAnnual, 6);
    expect(y.socialBreakdown.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(y.socialInsuranceAnnual, 6);
    expect(y.effectiveTaxRate).toBeGreaterThan(0);
    expect(y.effectiveTaxRate).toBeLessThan(0.5);
  });

  it('实际税负率随收入单调上升（累进制的基本性质）', () => {
    const rates = [40_000, 80_000, 160_000, 320_000, 640_000].map((a) => atSalary(a).effectiveTaxRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
  });
});
