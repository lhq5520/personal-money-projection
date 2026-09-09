import { describe, expect, it } from 'vitest';
import { calendarYear, checkFreshness, cnSocialYear } from './provenance.js';
import { projectTimeline } from '../project.js';
import { defaultInput } from '../defaults.js';
import { getRegion } from '../regions/registry.js';
import type { ProjectionInput } from '../types.js';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('适用期', () => {
  it('中国社保年度为 7 月 1 日至次年 6 月 30 日', () => {
    expect(cnSocialYear(2026)).toEqual({ effectiveFrom: '2026-07-01', effectiveTo: '2027-06-30' });
  });

  it('自然年适用期用于美加', () => {
    expect(calendarYear(2026)).toEqual({ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' });
  });

  it('适用期内不算过期，终点当天仍然有效', () => {
    const p = { ...cnSocialYear(2026), verifiedAt: '2026-09-09', confidence: 'verified' as const };
    expect(checkFreshness(p, at('2026-09-09')).expired).toBe(false);
    expect(checkFreshness(p, at('2027-06-30')).expired).toBe(false);
    expect(checkFreshness(p, at('2027-07-01')).expired).toBe(true);
  });

  it('没有终点的数据永不过期（用于「至下次公告为止」）', () => {
    const p = { effectiveFrom: '2020-01-01', verifiedAt: '2020-01-01', confidence: 'verified' as const };
    const f = checkFreshness(p, at('2099-01-01'));
    expect(f.expired).toBe(false);
    expect(f.daysRemaining).toBeNull();
  });
});

describe('引擎的数据时效警告', () => {
  const withCity = (city: string): ProjectionInput => {
    const i = JSON.parse(JSON.stringify(defaultInput('CN'))) as ProjectionInput;
    i.jurisdiction = city;
    return i;
  };

  it('已核对且在适用期内的城市不报警', () => {
    const r = projectTimeline(withCity('shanghai'), 7.2, at('2026-09-09'));
    expect(r.warnings.some((w) => w.code === 'data-expired')).toBe(false);
    expect(r.warnings.some((w) => w.code === 'data-unverified')).toBe(false);
  });

  it('同一个城市，时间推到适用期之后就会报过期', () => {
    const r = projectTimeline(withCity('shanghai'), 7.2, at('2027-08-01'));
    expect(r.warnings.some((w) => w.code === 'data-expired')).toBe(true);
  });

  it('未核对的城市明确标记为待核对，不静默使用估算值', () => {
    const r = projectTimeline(withCity('hangzhou'), 7.2, at('2026-09-09'));
    expect(r.warnings.some((w) => w.code === 'data-unverified')).toBe(true);
    // 数据停留在 2024 社保年度，同时也已过期
    expect(r.warnings.some((w) => w.code === 'data-expired')).toBe(true);
  });

  it('引擎是纯函数：同样的输入 + 同样的时点，警告完全一致', () => {
    const a = projectTimeline(withCity('hangzhou'), 7.2, at('2026-09-09'));
    const b = projectTimeline(withCity('hangzhou'), 7.2, at('2026-09-09'));
    expect(a.warnings).toEqual(b.warnings);
  });

  it('三个地区都实现了 provenanceFor', () => {
    for (const code of ['CN', 'US', 'CA'] as const) {
      const m = getRegion(code);
      const p = m.provenanceFor(m.defaultJurisdiction);
      expect(p.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['verified', 'derived', 'estimated']).toContain(p.confidence);
    }
  });
});
