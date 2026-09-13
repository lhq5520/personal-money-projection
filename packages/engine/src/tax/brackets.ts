/**
 * Generic progressive tax computation.
 *
 * China publishes its official bracket tables as "rate + quick-deduction constant", while
 * the US and Canadian tables give only per-bracket rates. The two forms are mathematically
 * equivalent, and both are supported here: if a quick-deduction constant is present we take
 * the shortcut (which matches the published figures to the cent), otherwise we accumulate
 * bracket by bracket.
 *
 * 通用累进税率计算。
 *
 * 中国的官方税率表以「税率 + 速算扣除数」形式发布，美加的表则只给分档税率。
 * 两种形式在数学上等价，这里都支持：给了速算扣除数就走捷径（与官方公布值逐分对齐），
 * 否则逐档累加。
 */

import type { TaxBracket } from '../types.js';

export function findBracket(brackets: readonly TaxBracket[], amount: number): TaxBracket {
  for (const b of brackets) {
    if (amount <= b.upTo) return b;
  }
  return brackets[brackets.length - 1]!;
}

export function bracketTax(brackets: readonly TaxBracket[], taxableIncome: number): number {
  const taxable = Math.max(0, taxableIncome);
  if (taxable === 0 || brackets.length === 0) return 0;

  const hit = findBracket(brackets, taxable);
  if (hit.quickDeduction !== undefined) {
    return Math.max(0, taxable * hit.rate - hit.quickDeduction);
  }

  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return Math.max(0, tax);
}

/**
 * A Canadian-style non-refundable tax credit: credit = credit base × lowest bracket rate.
 * Unlike subtracting from taxable income, a credit like this isn't worth more to someone
 * in a higher bracket.
 *
 * 加拿大式的不可退还税收抵免：抵免额 = 抵免基数 × 最低档税率。
 * 与「从应税所得里减掉」不同，这种抵免对高收入者的价值不会更高。
 */
export function nonRefundableCredit(brackets: readonly TaxBracket[], creditBase: number): number {
  const lowest = brackets[0];
  return lowest ? Math.max(0, creditBase) * lowest.rate : 0;
}

/** Clamp a value into the [min, max] range. 把金额限制在 [min, max] 区间内 */
export const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
