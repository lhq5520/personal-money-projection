/**
 * The investment engine: a deterministic compounding path plus a Monte Carlo distribution.
 *
 * The prototype page had only one deterministic curve — type 7% and it really did grow 7%
 * every year. In reality the S&P 500 delivers sequences like +29% / −18% / +26%: same mean,
 * different order, and the terminal value can differ by hundreds of thousands. That's
 * sequence-of-returns risk, which is why the single curve became a distribution here.
 *
 * 投资引擎：确定性复利路径 + 蒙特卡洛分布。
 *
 * 原型页面只有一条确定性曲线，输入 7% 就当真每年涨 7%。
 * 现实中标普 500 的年度回报是 +29% / −18% / +26% 这样的序列，
 * 均值相同但顺序不同，期末结果可以差出几十万——这就是「回报顺序风险」。
 * 所以这里把单条曲线换成了分布。
 */

import type { InvestmentInput, MonteCarloResult, MonteCarloYearPoint, Percentiles } from './types.js';
import { gaussianFactory, mulberry32, percentile } from './random.js';

/**
 * The actual annualized return after friction costs.
 * Friction comes from two places: fund management/custody fees, and the share of dividends
 * lost to withholding tax (a Chinese investor holding US ETFs is typically withheld 10%).
 *
 * 扣除摩擦成本后的实际年化。
 * 摩擦来自两处：基金管理/托管费，以及股息被预扣的那部分税
 * （中国投资者持有美股 ETF 的股息通常被预扣 10%）。
 */
export function netAnnualReturn(inv: InvestmentInput): number {
  return inv.expectedAnnualReturn - inv.feeDragAnnual - inv.dividendYield * inv.dividendWithholdingTax;
}

/** Convert an annualized return into a monthly compounding factor. 年化收益转月度复利因子 */
export function toMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

export interface DeterministicPath {
  /** Length years+1; index 0 is the opening balance. 长度为 years+1，索引 0 为期初 */
  values: number[];
  contributions: number[];
}

/**
 * The deterministic compounding path.
 * 确定性复利路径。
 *
 * @param monthlyContributions Per-month contribution amounts, length = years × 12.
 *                             逐月投入金额，长度 = 年限 × 12
 */
export function deterministicPath(
  initialCapital: number,
  monthlyContributions: readonly number[],
  annualReturn: number,
): DeterministicPath {
  const mRate = toMonthlyRate(annualReturn);
  const values: number[] = [initialCapital];
  const contributions: number[] = [initialCapital];

  let value = initialCapital;
  let contributed = initialCapital;

  for (let m = 0; m < monthlyContributions.length; m++) {
    // Interest accrues at the start of the month, contributions land at the end: the month you
    // contribute earns nothing on it. Conservative, and closer to how it actually works.
    // 月初计息、月末投入：定投当月不产生收益，是偏保守也更贴近实际的口径
    value = value * (1 + mRate) + monthlyContributions[m]!;
    contributed += monthlyContributions[m]!;
    if ((m + 1) % 12 === 0) {
      values.push(value);
      contributions.push(contributed);
    }
  }
  return { values, contributions };
}

function toPercentiles(sorted: Float64Array): Percentiles {
  return {
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
  };
}

function discount(p: Percentiles, factor: number): Percentiles {
  return {
    p10: p.p10 * factor,
    p25: p.p25 * factor,
    p50: p.p50 * factor,
    p75: p.p75 * factor,
    p90: p.p90 * factor,
  };
}

export interface MonteCarloOptions {
  initialCapital: number;
  monthlyContributions: readonly number[];
  annualReturn: number;
  annualVolatility: number;
  /**
   * Used to discount nominal values into today's purchasing power.
   * 用于把名义值折算到今天购买力
   */
  inflationRate: number;
  /**
   * Cumulative principal by year, used to compute the probability of loss.
   * 累计投入本金的逐年值，用于计算亏损概率
   */
  yearlyContributions: readonly number[];
  paths: number;
  seed: number;
}

/**
 * Geometric Brownian motion Monte Carlo.
 *
 * The log drift is ln(1+μ) − σ²/2, which is what makes the paths' **expected terminal value**
 * equal compounding at μ. Using μ directly as the drift overestimates systematically — a
 * common mistake in personal-finance calculators.
 *
 * 几何布朗运动蒙特卡洛。
 *
 * 对数漂移取 ln(1+μ) − σ²/2，这样路径的**期望终值**才等于按 μ 复利的结果；
 * 若直接用 μ 当漂移，会系统性高估（这是很多理财计算器的常见错误）。
 */
export function monteCarlo(opts: MonteCarloOptions): MonteCarloResult {
  const { initialCapital, monthlyContributions, annualReturn, annualVolatility, paths, seed } = opts;
  const totalMonths = monthlyContributions.length;
  const years = Math.floor(totalMonths / 12);

  const sigma = Math.max(0, annualVolatility);
  const sigmaMonthly = sigma / Math.sqrt(12);
  // An annualized return can be ≤ −100%, so clamp before taking the log to keep a NaN from
  // poisoning the whole path.
  // 年化收益可能 ≤ −100%，取对数前先夹住，避免 NaN 污染整条路径
  const muLog = Math.log(Math.max(1e-9, 1 + annualReturn)) - 0.5 * sigma * sigma;
  const driftMonthly = muLog / 12;

  const rand = mulberry32(seed);
  const gauss = gaussianFactory(rand);

  // yearBuckets[y][p] = account value at the end of year y+1 on path p.
  // yearBuckets[y][p] = 第 y+1 年末、第 p 条路径的账户价值
  const yearBuckets: Float64Array[] = Array.from({ length: years }, () => new Float64Array(paths));

  for (let p = 0; p < paths; p++) {
    let value = initialCapital;
    for (let m = 0; m < totalMonths; m++) {
      const growth = Math.exp(driftMonthly + sigmaMonthly * gauss());
      value = value * growth + monthlyContributions[m]!;
      if ((m + 1) % 12 === 0) {
        yearBuckets[(m + 1) / 12 - 1]![p] = value;
      }
    }
  }

  const byYear: MonteCarloYearPoint[] = [];
  for (let y = 0; y < years; y++) {
    const bucket = yearBuckets[y]!;
    bucket.sort();
    const nominal = toPercentiles(bucket);
    const factor = 1 / Math.pow(1 + opts.inflationRate, y + 1);
    byYear.push({ year: y + 1, ...nominal, real: discount(nominal, factor) });
  }

  const terminalBucket = years > 0 ? yearBuckets[years - 1]! : new Float64Array(0);
  const finalContribution = opts.yearlyContributions[opts.yearlyContributions.length - 1] ?? 0;
  let losses = 0;
  for (let p = 0; p < terminalBucket.length; p++) {
    if (terminalBucket[p]! < finalContribution) losses++;
  }

  return {
    paths,
    seed,
    byYear,
    terminal: years > 0 ? toPercentiles(terminalBucket) : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
    lossProbability: terminalBucket.length > 0 ? losses / terminalBucket.length : 0,
  };
}
