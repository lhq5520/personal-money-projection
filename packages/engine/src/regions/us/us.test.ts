import { describe, expect, it } from 'vitest';
import { US_REGION } from './index.js';
import {
  ELECTIVE_DEFERRAL_LIMIT,
  FEDERAL_BRACKETS,
  FEDERAL_STANDARD_DEDUCTION,
  SOCIAL_SECURITY_WAGE_BASE,
  US_TAX_YEAR,
  childTaxCredit,
  computeFica,
} from './federal.js';
import { bracketTax } from '../../tax/brackets.js';
import { MANUAL_STATE_TAX_YEAR, getState, stateDataTaxYear } from './states.js';
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
  it('单身、年薪 10 万、加州、无 401(k)：应税所得 = 收入 − 标准扣除', () => {
    const y = atSalary(100_000);
    // 不写死数字：标准扣除来自同步数据，随税年变化。写死会让测试在数据更新后误报。
    const sd = FEDERAL_STANDARD_DEDUCTION.single;
    expect(y.taxableAnnual).toBeCloseTo(100_000 - sd, 2);
  });

  it('联邦税额与逐档累进的独立计算一致', () => {
    const y = atSalary(100_000);
    const federal = y.taxBreakdown.find((t) => t.code === 'national')!.amount;
    // 用通用累进引擎独立复算一遍，交叉验证 us/index.ts 的组装逻辑
    expect(federal).toBeCloseTo(bracketTax(FEDERAL_BRACKETS.single, y.taxableAnnual), 2);
  });

  it('标准扣除随税年同步，且已反映 OBBBA 的调整', () => {
    // 2025 年 7 月 OBBBA 追溯把单身标准扣除由 15,000 提高到 15,750，此后逐年通胀调整。
    // 任何等于旧值 15,000 的情况都说明同步数据没跟上。
    expect(FEDERAL_STANDARD_DEDUCTION.single).toBeGreaterThan(15_000);
    expect(FEDERAL_STANDARD_DEDUCTION['married-joint']).toBeCloseTo(
      FEDERAL_STANDARD_DEDUCTION.single * 2,
      0,
    );
    expect(US_TAX_YEAR).toBeGreaterThanOrEqual(2025);
  });

  it('七档税率齐全且单调递增，最高档无上界', () => {
    for (const rows of Object.values(FEDERAL_BRACKETS)) {
      expect(rows).toHaveLength(7);
      expect(rows.map((b) => b.rate)).toEqual([0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.upTo).toBeGreaterThan(rows[i - 1]!.upTo);
      }
      expect(rows.at(-1)!.upTo).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('加州州税按其分档表逐档累进', () => {
    const y = atSalary(100_000);
    const state = y.taxBreakdown.find((t) => t.code === 'regional')!.amount;
    const ca = getState('CA');
    // 阈值取自同步数据：加州每年按 CPI 调整分档，写死会在数据更新后误报
    const taxable = 100_000 - ca.standardDeduction.single;
    expect(state).toBeCloseTo(bracketTax(ca.brackets!.single, taxable), 2);
  });

  it('加州分档已同步到当前税年，不再是手工的旧值', () => {
    const ca = getState('CA');
    expect(stateDataTaxYear('CA')).toBe(US_TAX_YEAR);
    // 最低档上界会随 CPI 逐年上移；2024 年的 10,756 不应再出现
    expect(ca.brackets!.single[0]!.upTo).toBeGreaterThan(10_756);
    expect(ca.brackets!.single.map((b) => b.rate)).toEqual([
      0.01, 0.02, 0.04, 0.06, 0.08, 0.093, 0.103, 0.113, 0.123,
    ]);
  });

  it('俄亥俄刻意不同步——上游把「税收悬崖」编码成了隐含平均税率，直接采信会对低收入者多征税', () => {
    expect(stateDataTaxYear('OH')).toBe(MANUAL_STATE_TAX_YEAR);
    const oh = getState('OH');
    // 俄亥俄法定 26,050 美元以下为 0%，本地手工值保留了这个 0 档
    expect(oh.brackets!.single[0]!.rate).toBe(0);
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
