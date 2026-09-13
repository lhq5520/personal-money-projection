/**
 * Reproducible pseudo-random number generation. A Monte Carlo has to be reproducible —
 * otherwise the same inputs would yield a different conclusion on every refresh.
 *
 * 可复现的伪随机数发生器。蒙特卡洛必须可复现，否则同样的输入每次刷新给出不同结论。
 */

/**
 * mulberry32: a small, fast 32-bit-seeded PRNG with good enough statistical properties.
 * mulberry32：小、快、统计性质足够好的 32 位种子 PRNG
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The Box–Muller transform, turning a uniform distribution into a standard normal one.
 * The second value is cached so half the work isn't thrown away.
 *
 * Box–Muller 变换，把均匀分布转成标准正态。缓存第二个值避免浪费一半的计算。
 */
export function gaussianFactory(rand: () => number): () => number {
  let spare: number | null = null;
  return function nextGaussian(): number {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * factor;
    return u * factor;
  };
}

/**
 * Linearly interpolated percentile. `sorted` must already be in ascending order.
 * 线性插值分位数。sorted 必须已升序排列。
 */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}
