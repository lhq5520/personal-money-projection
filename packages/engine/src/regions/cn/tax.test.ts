import { describe, expect, it } from 'vitest';
import {
  COMPREHENSIVE_BRACKETS,
  MONTHLY_BRACKETS,
  chooseBonusTaxStrategy,
  comprehensiveTax,
  separateBonusTax,
} from './tax.js';
import { findBracket } from '../../tax/brackets.js';

describe('综合所得税率表', () => {
  it('七档齐全，包含原型页面漏掉的 35% 与 45%', () => {
    expect(COMPREHENSIVE_BRACKETS.map((b) => b.rate)).toEqual([0.03, 0.1, 0.2, 0.25, 0.3, 0.35, 0.45]);
  });

  it('速算扣除数让分档边界处税额连续（这正是速算扣除数的定义）', () => {
    for (const b of COMPREHENSIVE_BRACKETS) {
      if (!Number.isFinite(b.upTo)) continue;
      const atBoundary = comprehensiveTax(b.upTo);
      const justAbove = comprehensiveTax(b.upTo + 1);
      // No jump at the boundary: one more yuan of income must not add more tax than the next
      // bracket's rate.
      // 边界处不应出现跳变：多 1 元收入，多缴的税不应超过下一档税率
      expect(justAbove - atBoundary).toBeLessThanOrEqual(0.45 + 1e-9);
      expect(justAbove).toBeGreaterThanOrEqual(atBoundary);
    }
  });

  it.each([
    [0, 0],
    [-50_000, 0], // negative taxable income yields no refund 应纳税所得额为负时不退税
    [36_000, 1_080],
    [36_001, 1_080.1],
    [144_000, 11_880],
    [300_000, 43_080],
    [420_000, 73_080],
    [660_000, 145_080],
    [960_000, 250_080],
    [1_000_000, 268_080],
  ])('应纳税所得额 %d 元 → 税额 %d 元', (taxable, expected) => {
    expect(comprehensiveTax(taxable)).toBeCloseTo(expected, 2);
  });

  it('原型页面在 30% 档封顶，会系统性少算高收入者的税', () => {
    const legacy = (t: number) => Math.max(0, t * 0.3 - 52_920); // the prototype's last branch 原页面的最后一个分支
    const taxable = 1_500_000;
    expect(comprehensiveTax(taxable)).toBeGreaterThan(legacy(taxable));
    expect(comprehensiveTax(taxable) - legacy(taxable)).toBeCloseTo(96_000, 0);
  });

  it('findBracket 在边界值上取较低的一档（上界含）', () => {
    expect(findBracket(COMPREHENSIVE_BRACKETS, 36_000).rate).toBe(0.03);
    expect(findBracket(COMPREHENSIVE_BRACKETS, 36_000.01).rate).toBe(0.1);
  });
});

describe('全年一次性奖金单独计税', () => {
  it('按 奖金/12 查月度税率表，而不是原型页面写死的 10% 档', () => {
    // The prototype used bonus*.10-210 — the second bracket, for any amount whatsoever.
    // 原页面：bonus*.10-210，对任何金额都用第二档
    expect(separateBonusTax(30_000)).toBeCloseTo(900, 2); // 30000/12=2500 → 3% 档
    expect(30_000 * 0.1 - 210).toBeCloseTo(2_790, 2); // 原页面算出的错误值
  });

  it.each([
    [0, 0],
    [36_000, 1_080],
    [144_000, 14_190],
    [300_000, 58_590],
    [420_000, 102_340],
    [660_000, 193_590],
    [960_000, 328_840],
  ])('奖金 %d 元 → 单独计税 %d 元', (bonus, expected) => {
    expect(separateBonusTax(bonus)).toBeCloseTo(expected, 2);
  });

  it('存在「税收盲区」：奖金 36000 → 36001，多发 1 元，到手反而少 2309 元', () => {
    const takeHomeAt36000 = 36_000 - separateBonusTax(36_000);
    const takeHomeAt36001 = 36_001 - separateBonusTax(36_001);
    expect(takeHomeAt36000 - takeHomeAt36001).toBeCloseTo(2_309.1, 1);
  });

  it.each([36_000, 144_000, 300_000, 420_000, 660_000, 960_000])(
    '临界点 %d 元之后立即出现到手倒挂',
    (cliff) => {
      expect(cliff - separateBonusTax(cliff)).toBeGreaterThan(cliff + 1 - separateBonusTax(cliff + 1));
    },
  );

  it('月度税率表也是七档', () => {
    expect(MONTHLY_BRACKETS).toHaveLength(7);
  });
});

describe('年终奖计税方式择优', () => {
  it('高薪 + 小额奖金时，单独计税更省', () => {
    // Regular salary already puts them in the 20% bracket, while a 30,000 bonus taxed separately
    // is only 3%.
    // 常规工资已经把人推到 20% 档，奖金 30000 单独计税只按 3%
    const r = chooseBonusTaxStrategy(250_000, 30_000, true);
    expect(r.strategy).toBe('separate');
    expect(r.totalTax).toBe(Math.min(r.separateTotal, r.mergedTotal));
    expect(r.saving).toBeGreaterThan(0);
  });

  it('常规工资未用满扣除额度时，并入综合所得更省——奖金可以吸收掉负的应纳税所得额', () => {
    const r = chooseBonusTaxStrategy(-20_000, 50_000, true);
    expect(r.strategy).toBe('merged');
    // Merged, taxable income is only 30,000, taxed at 3% for 900.
    // 并入后应纳税所得额只剩 30000，按 3% 计 900 元
    expect(r.totalTax).toBeCloseTo(900, 2);
    // Taxed separately, the full 50,000 is taxed — clearly more expensive.
    // 单独计税则要为全部 50000 缴税，明显更贵
    expect(r.separateTotal).toBeGreaterThan(r.totalTax);
  });

  it('择优结果永远不劣于任何单一策略', () => {
    for (let taxable = -60_000; taxable <= 400_000; taxable += 20_000) {
      for (const bonus of [0, 30_000, 36_001, 100_000, 200_000]) {
        const r = chooseBonusTaxStrategy(taxable, bonus, true);
        expect(r.totalTax).toBeLessThanOrEqual(r.separateTotal + 1e-9);
        expect(r.totalTax).toBeLessThanOrEqual(r.mergedTotal + 1e-9);
      }
    }
  });

  it('政策到期后（allowSeparate=false）强制并入综合所得', () => {
    const r = chooseBonusTaxStrategy(250_000, 30_000, false);
    expect(r.strategy).toBe('merged');
    expect(r.totalTax).toBe(r.mergedTotal);
    expect(r.saving).toBe(0);
  });

  it('无奖金时两种策略等价', () => {
    const r = chooseBonusTaxStrategy(120_000, 0, true);
    expect(r.separateTotal).toBeCloseTo(r.mergedTotal, 6);
    expect(r.saving).toBe(0);
  });
});
