import { describe, expect, it } from 'vitest';
import { deterministicPath, monteCarlo, netAnnualReturn, toMonthlyRate } from './invest.js';
import { mulberry32, percentile } from './random.js';
import { DEFAULT_INPUT } from './defaults.js';

const zeros = (n: number) => new Array<number>(n).fill(0);

describe('摩擦成本', () => {
  it('净年化 = 名义年化 − 管理费 − 股息 × 预扣税率', () => {
    const inv = { ...DEFAULT_INPUT.investment, expectedAnnualReturn: 0.07, feeDragAnnual: 0.008, dividendYield: 0.013, dividendWithholdingTax: 0.1 };
    expect(netAnnualReturn(inv)).toBeCloseTo(0.07 - 0.008 - 0.0013, 9);
  });

  it('摩擦成本在 30 年尺度上不是小数：0.93% 的年化差距吃掉约 24% 的终值', () => {
    const gross = Math.pow(1.07, 30);
    const net = Math.pow(1 + 0.07 - 0.0093, 30);
    expect(1 - net / gross).toBeGreaterThan(0.2);
  });
});

describe('确定性复利', () => {
  it('月度复利 12 次等于一次年度复利', () => {
    expect(Math.pow(1 + toMonthlyRate(0.07), 12)).toBeCloseTo(1.07, 12);
  });

  it('纯本金无定投时匹配闭式解', () => {
    const { values } = deterministicPath(10_000, zeros(120), 0.07);
    expect(values).toHaveLength(11);
    expect(values[10]!).toBeCloseTo(10_000 * Math.pow(1.07, 10), 6);
  });

  it('等额定投匹配年金终值公式', () => {
    const C = 1_000;
    const months = 240;
    const r = 0.07;
    const m = toMonthlyRate(r);
    const { values } = deterministicPath(0, new Array(months).fill(C), r);
    const closedForm = (C * (Math.pow(1 + m, months) - 1)) / m;
    expect(values[20]!).toBeCloseTo(closedForm, 4);
  });

  it('累计投入本金含初始本金，且单调不减', () => {
    const { contributions } = deterministicPath(50_000, new Array(60).fill(2_000), 0.07);
    expect(contributions[0]).toBe(50_000);
    expect(contributions[5]).toBeCloseTo(50_000 + 2_000 * 60, 6);
    for (let i = 1; i < contributions.length; i++) {
      expect(contributions[i]!).toBeGreaterThanOrEqual(contributions[i - 1]!);
    }
  });

  it('收益率为 0 时终值等于累计投入', () => {
    const { values, contributions } = deterministicPath(1_000, new Array(120).fill(500), 0);
    expect(values[10]!).toBeCloseTo(contributions[10]!, 6);
  });
});

describe('蒙特卡洛', () => {
  const mcBase = {
    initialCapital: 100_000,
    monthlyContributions: new Array(120).fill(3_000),
    annualReturn: 0.07,
    inflationRate: 0.025,
    yearlyContributions: [100_000],
    paths: 2_000,
    seed: 42,
  };

  it('波动率为 0 时应精确退化为确定性路径', () => {
    const mc = monteCarlo({ ...mcBase, annualVolatility: 0 });
    const det = deterministicPath(mcBase.initialCapital, mcBase.monthlyContributions, mcBase.annualReturn);
    for (let y = 0; y < 10; y++) {
      expect(mc.byYear[y]!.p50).toBeCloseTo(det.values[y + 1]!, 4);
      expect(mc.byYear[y]!.p10).toBeCloseTo(det.values[y + 1]!, 4);
      expect(mc.byYear[y]!.p90).toBeCloseTo(det.values[y + 1]!, 4);
    }
  });

  it('同一 seed 必须给出完全相同的结果——否则用户每次刷新看到的结论都不一样', () => {
    const a = monteCarlo({ ...mcBase, annualVolatility: 0.16 });
    const b = monteCarlo({ ...mcBase, annualVolatility: 0.16 });
    expect(a.terminal).toEqual(b.terminal);
    expect(a.byYear).toEqual(b.byYear);
  });

  it('不同 seed 给出不同但同量级的结果', () => {
    const a = monteCarlo({ ...mcBase, annualVolatility: 0.16, seed: 1 });
    const b = monteCarlo({ ...mcBase, annualVolatility: 0.16, seed: 2 });
    expect(a.terminal.p50).not.toBe(b.terminal.p50);
    expect(a.terminal.p50 / b.terminal.p50).toBeGreaterThan(0.9);
    expect(a.terminal.p50 / b.terminal.p50).toBeLessThan(1.1);
  });

  it('分位数严格有序，且逐年递增', () => {
    const mc = monteCarlo({ ...mcBase, annualVolatility: 0.16 });
    for (const y of mc.byYear) {
      expect(y.p10).toBeLessThanOrEqual(y.p25);
      expect(y.p25).toBeLessThanOrEqual(y.p50);
      expect(y.p50).toBeLessThanOrEqual(y.p75);
      expect(y.p75).toBeLessThanOrEqual(y.p90);
      expect(y.real.p50).toBeLessThan(y.p50); // 通胀为正，实际购买力必然低于名义
    }
    expect(mc.byYear[9]!.p50).toBeGreaterThan(mc.byYear[0]!.p50);
  });

  it('对数漂移取 ln(1+μ)−σ²/2，使期望终值回到按 μ 复利的水平（少了这一项会系统性高估）', () => {
    const paths = 40_000;
    const mc = monteCarlo({
      ...mcBase,
      initialCapital: 10_000,
      monthlyContributions: zeros(120),
      annualVolatility: 0.15,
      paths,
      seed: 7,
    });
    // 分位数不足以验证均值，这里用中位数与理论中位数比对
    // 理论中位数 = S0 · exp(muLog · T)，muLog = ln(1.07) − 0.5·0.15²
    const muLog = Math.log(1.07) - 0.5 * 0.15 * 0.15;
    const theoreticalMedian = 10_000 * Math.exp(muLog * 10);
    expect(mc.terminal.p50 / theoreticalMedian).toBeGreaterThan(0.97);
    expect(mc.terminal.p50 / theoreticalMedian).toBeLessThan(1.03);
  });

  it('对数正态右偏：中位数低于按 μ 复利的确定性值', () => {
    const mc = monteCarlo({
      ...mcBase,
      initialCapital: 10_000,
      monthlyContributions: zeros(120),
      annualVolatility: 0.18,
      paths: 20_000,
      seed: 9,
    });
    expect(mc.terminal.p50).toBeLessThan(10_000 * Math.pow(1.07, 10));
  });

  it('亏损概率随波动率上升', () => {
    const contributions = new Array(120).fill(3_000);
    const totalIn = 100_000 + 3_000 * 120;
    const low = monteCarlo({ ...mcBase, monthlyContributions: contributions, yearlyContributions: [totalIn], annualVolatility: 0.05 });
    const high = monteCarlo({ ...mcBase, monthlyContributions: contributions, yearlyContributions: [totalIn], annualVolatility: 0.35 });
    expect(high.lossProbability).toBeGreaterThan(low.lossProbability);
    expect(low.lossProbability).toBeGreaterThanOrEqual(0);
    expect(high.lossProbability).toBeLessThanOrEqual(1);
  });
});

describe('随机数工具', () => {
  it('mulberry32 输出落在 [0,1) 且可复现', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });

  it('percentile 做线性插值，边界取端点', () => {
    const s = [10, 20, 30, 40, 50];
    expect(percentile(s, 0)).toBe(10);
    expect(percentile(s, 1)).toBe(50);
    expect(percentile(s, 0.5)).toBe(30);
    expect(percentile(s, 0.25)).toBe(20);
    expect(percentile(s, 0.125)).toBe(15);
    expect(percentile([], 0.5)).toBe(0);
  });
});
