/** 金额与比率的展示格式。图表轴、指标卡、表格共用，避免同一个数字在三处显示成三种样子。 */

const nf = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

export const money = (n: number): string => `¥${nf.format(Math.round(n))}`;

/** 带千分位的裸数字，用于金额本身就在千元量级、缩写反而丢精度的场合 */
export const plain = (n: number): string => nf.format(Math.round(n));

/**
 * 轴标签用的紧凑写法。
 *
 * 万位保留一位小数：否则 18250 和 15003 会同时显示成「2万」，
 * 在现金流瀑布这种相邻柱高度接近的图里会直接误导读者。
 */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${nf1.format(n / 1e8)}亿`;
  if (abs >= 1e7) return `${nf.format(n / 1e4)}万`;
  if (abs >= 1e4) return `${nf1.format(n / 1e4)}万`;
  return nf.format(n);
}

export const percent = (r: number, digits = 1): string => `${(r * 100).toFixed(digits)}%`;

/**
 * 生成「好看」的坐标轴刻度（步长为 1/2/2.5/5 × 10ⁿ）。
 * 图表应把量程顶端对齐到最后一个刻度，这样轴上不会出现 6,083 这种随机数字。
 */
export function niceTicks(max: number, count = 5): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  // 必须向上取整到覆盖 max 的那一格：调用方会把量程顶端对齐到最后一个刻度，
  // 若最后一个刻度低于 max，超出的图元（比如 P90 色带顶部）会被裁掉。
  const steps = Math.max(1, Math.ceil(max / step - 1e-9));
  return Array.from({ length: steps + 1 }, (_, i) => Number((i * step).toFixed(6)));
}
