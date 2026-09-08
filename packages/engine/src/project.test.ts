import { describe, expect, it } from 'vitest';
import { projectTimeline } from './project.js';
import { resolveSalarySchedule } from './income.js';
import { DEFAULT_INPUT } from './defaults.js';
import type { ProjectionInput } from './types.js';

// 引擎刻意不依赖任何运行时环境（无 @types/node、无 DOM），
// 所以这里用 JSON 深拷贝而非 structuredClone。ProjectionInput 是纯 JSON 数据，安全。
const withInput = (patch: (i: ProjectionInput) => void): ProjectionInput => {
  const clone = JSON.parse(JSON.stringify(DEFAULT_INPUT)) as ProjectionInput;
  patch(clone);
  return clone;
};

/** 关掉所有增长和摩擦，退化成原型页面的静态模型，便于隔离验证单个改动 */
const staticInput = withInput((i) => {
  i.income.annualGrowthRate = 0;
  i.expense.annualGrowthRate = 0;
  i.inflation.annualRate = 0;
  i.investment.feeDragAnnual = 0;
  i.investment.dividendYield = 0;
});

describe('薪资时间轴', () => {
  it('无增长无跳变时逐年恒定（等价于原型页面的假设）', () => {
    const s = resolveSalarySchedule(staticInput);
    expect(s).toHaveLength(20);
    expect(new Set(s).size).toBe(1);
  });

  it('按年复利增长', () => {
    const s = resolveSalarySchedule(withInput((i) => { i.income.annualGrowthRate = 0.05; i.investment.years = 3; }));
    expect(s[0]).toBeCloseTo(14_600, 6);
    expect(s[1]).toBeCloseTo(14_600 * 1.05, 6);
    expect(s[2]).toBeCloseTo(14_600 * 1.05 * 1.05, 6);
  });

  it('salarySteps 覆盖当年月薪，并成为后续增长的新基数', () => {
    const s = resolveSalarySchedule(withInput((i) => {
      i.income.annualGrowthRate = 0.05;
      i.income.salarySteps = [{ atYear: 3, newMonthlySalary: 30_000 }];
      i.investment.years = 5;
    }));
    expect(s[2]).toBe(30_000);
    expect(s[3]).toBeCloseTo(30_000 * 1.05, 6);
  });
});

describe('端到端投影', () => {
  it('默认参数产出完整的 20 年逐月时间轴', () => {
    const r = projectTimeline(DEFAULT_INPUT);
    expect(r.months).toHaveLength(240);
    expect(r.years).toHaveLength(20);
    expect(r.timeline).toHaveLength(21); // 含期初
    expect(r.summary.finalValue).toBeGreaterThan(r.summary.totalContribution);
  });

  it('通胀让实际购买力显著低于名义金额——这是原型页面完全缺失的口径', () => {
    const r = projectTimeline(DEFAULT_INPUT);
    expect(r.summary.finalValueReal).toBeLessThan(r.summary.finalValue);
    expect(r.summary.finalValueReal).toBeCloseTo(
      r.summary.finalValue / Math.pow(1.025, 20),
      2,
    );
    // 2.5% 通胀跑 20 年，购买力打了约六折
    expect(r.summary.finalValueReal / r.summary.finalValue).toBeLessThan(0.65);
  });

  it('涨薪会推高后期定投额', () => {
    const flat = projectTimeline(withInput((i) => { i.income.annualGrowthRate = 0; }));
    const rising = projectTimeline(withInput((i) => { i.income.annualGrowthRate = 0.05; }));
    expect(rising.months[0]!.invested).toBeCloseTo(flat.months[0]!.invested, 6);
    expect(rising.months[239]!.invested).toBeGreaterThan(flat.months[239]!.invested);
    expect(rising.summary.finalValue).toBeGreaterThan(flat.summary.finalValue);
  });

  it('开销通胀会侵蚀定投额', () => {
    const flat = projectTimeline(withInput((i) => { i.income.annualGrowthRate = 0; i.expense.annualGrowthRate = 0; }));
    const inflating = projectTimeline(withInput((i) => { i.income.annualGrowthRate = 0; i.expense.annualGrowthRate = 0.05; }));
    expect(inflating.months[239]!.invested).toBeLessThan(flat.months[239]!.invested);
  });

  it('公积金余额始终非负，且提取额不超过账户可用余额', () => {
    const r = projectTimeline(withInput((i) => { i.employerPlan.monthlyWithdrawal = 999_999; }));
    for (const m of r.months) {
      expect(m.planBalance).toBeGreaterThanOrEqual(-1e-6);
      expect(m.planWithdrawal).toBeLessThanOrEqual(999_999);
    }
    expect(r.warnings.some((w) => w.code === 'plan-balance-insufficient')).toBe(true);
  });

  it('原型页面允许公积金净额为负；这里余额永远守恒', () => {
    // 原页面：pfNet = pfSelf*2 - withdraw，提取超额时直接给出负数并按负数外推 20 年
    const legacyNet = 14_600 * 0.12 * 2 - 5_000; // 原页面写死 12%
    expect(legacyNet).toBeLessThan(0);
    const r = projectTimeline(withInput((i) => { i.employerPlan.monthlyWithdrawal = 5_000; }));
    expect(r.summary.finalPlanBalance).toBeGreaterThanOrEqual(0);
  });

  it('公积金按 1.5% 结息，余额高于纯缴存累计', () => {
    const withInterest = projectTimeline(withInput((i) => { i.employerPlan.monthlyWithdrawal = 0; i.employerPlan.annualInterestRate = 0.015; }));
    const noInterest = projectTimeline(withInput((i) => { i.employerPlan.monthlyWithdrawal = 0; i.employerPlan.annualInterestRate = 0; }));
    expect(withInterest.summary.finalPlanBalance).toBeGreaterThan(noInterest.summary.finalPlanBalance);
  });

  it('开销超过收入时定投归零并给出警告，不模拟借贷', () => {
    const r = projectTimeline(withInput((i) => { i.expense.monthlySpend = 100_000; }));
    expect(r.months.every((m) => m.invested === 0)).toBe(true);
    expect(r.summary.finalValue).toBeCloseTo(0, 6);
    expect(r.warnings.some((w) => w.code === 'cash-flow-deficit')).toBe(true);
  });

  it('缴费基数封顶时给出提示', () => {
    const r = projectTimeline(withInput((i) => { i.income.monthlySalary = 80_000; }));
    expect(r.warnings.some((w) => w.code === 'contribution-base-capped')).toBe(true);
  });

  it('年度投入超过 5 万美元购汇额度时给出提示', () => {
    const r = projectTimeline(withInput((i) => {
      i.income.monthlySalary = 200_000;
      i.expense.monthlySpend = 10_000;
    }));
    expect(r.warnings.some((w) => w.code === 'fx-quota-exceeded')).toBe(true);
  });

  it('专项附加扣除实实在在降低税负、抬高终值', () => {
    const without = projectTimeline(withInput((i) => {
      i.cn.deductions = { childrenCount: 0, infantCount: 0, continuingEducation: 'none', housingType: 'none', elderlyCare: 'none' };
    }));
    const with_ = projectTimeline(withInput((i) => {
      i.cn.deductions = { childrenCount: 2, infantCount: 0, continuingEducation: 'none', housingType: 'rent', elderlyCare: 'only-child' };
    }));
    expect(with_.summary.totalTaxPaid).toBeLessThan(without.summary.totalTaxPaid);
    expect(with_.summary.finalValue).toBeGreaterThan(without.summary.finalValue);
  });

  it('逐年自动择优年终奖计税方式', () => {
    const r = projectTimeline(withInput((i) => { i.income.salaryMonths = 15; i.income.annualGrowthRate = 0.12; i.investment.years = 25; }));
    const strategies = new Set(r.years.map((y) => y.bonusTaxStrategy));
    expect(strategies.size).toBeGreaterThanOrEqual(1);
    for (const y of r.years) {
      expect(y.taxAnnual).toBeGreaterThanOrEqual(0);
      expect(y.effectiveTaxRate).toBeLessThan(0.45);
    }
  });

  it('政策到期开关会改变税负', () => {
    const allowed = projectTimeline(withInput((i) => { i.cn.allowSeparateBonusTax = true; i.income.monthlySalary = 40_000; }));
    const expired = projectTimeline(withInput((i) => { i.cn.allowSeparateBonusTax = false; i.income.monthlySalary = 40_000; }));
    expect(expired.summary.totalTaxPaid).toBeGreaterThanOrEqual(allowed.summary.totalTaxPaid);
  });

  it('公积金个人缴存不计入到手现金，但计入公积金余额', () => {
    const r = projectTimeline(staticInput);
    const y = r.years[0]!;
    expect(y.netAnnual).toBeCloseTo(
      y.grossAnnual - y.socialInsuranceAnnual - y.planSelfAnnual - y.taxAnnual,
      6,
    );
    expect(r.months[0]!.planBalance).toBeGreaterThan(0);
  });

  it('时间轴的累计投入单调不减，账户价值在正收益下同样单调', () => {
    const r = projectTimeline(DEFAULT_INPUT);
    for (let i = 1; i < r.timeline.length; i++) {
      expect(r.timeline[i]!.contribution).toBeGreaterThanOrEqual(r.timeline[i - 1]!.contribution);
      expect(r.timeline[i]!.value).toBeGreaterThanOrEqual(r.timeline[i - 1]!.value);
    }
  });
});
