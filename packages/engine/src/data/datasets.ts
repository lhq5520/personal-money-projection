/**
 * The inventory of every maintained dataset.
 *
 * ## Why this exists
 *
 * "Keep the data always current" is not achievable — none of the three countries has an
 * official data interface, and rate tables are legislation and administrative notices, not
 * data services. What *is* achievable, and matters more:
 * **guarantee that stale data is always detected**.
 *
 * This inventory centralizes each dataset's effective period, source, and degree of
 * automation. `pnpm data:audit` walks it and turns CI red the moment any entry expires.
 * Failing to fetch a new value is one thing; silently continuing to use the old one is
 * another.
 *
 * 全部受维护数据集的清单。
 *
 * ## 为什么需要这个
 *
 * 「保证数据一直是最新的」做不到——三个国家都没有官方数据接口，
 * 税率表是立法和行政公告，不是数据服务。能做到的是另一件事，而且更重要：
 * **保证数据一旦过期就一定会被发现**。
 *
 * 这份清单把每个数据集的适用期、来源、自动化程度集中起来，
 * `pnpm data:audit` 遍历它并在任何一项过期时让 CI 变红。
 * 抓不到新值是一回事；静默地继续用旧值是另一回事。
 */

import type { Provenance } from './provenance.js';
import { calendarYear } from './provenance.js';
import { CN_PROVINCES } from '../regions/cn/provinces.js';
import { US_GENERATED } from './generated/index.js';
import { US_STATES } from '../regions/us/states.js';
import { stateDataTaxYear } from '../regions/us/states.js';
import { MANUAL_STATE_TAX_YEAR } from '../regions/us/states.js';
import { CA_PAYROLL_PROVENANCE } from '../regions/ca/federal.js';
import { PROVINCIAL_DATA_TAX_YEAR } from '../regions/ca/provinces.js';
import { CA_GENERATED } from './generated/index.js';

/**
 * How automated a dataset is. Determines what to do when it expires.
 * 数据集的自动化程度。决定过期时该怎么办。
 */
export type Automation =
  /**
   * Fully synced by `pnpm data:sync`; expiry usually means the sync job broke.
   * 由 `pnpm data:sync` 全自动同步，过期通常意味着同步任务坏了
   */
  | 'synced'
  /**
   * An upstream exists but is deliberately not trusted (it's older, or encodes values in a
   * form that can't be used directly); expiry requires manual verification.
   * 有上游但刻意不采信（上游更旧、或编码方式不可直接使用），过期需人工核对
   */
  | 'upstream-rejected'
  /** No upstream at all; manual verification only. 无任何上游，只能人工核对 */
  | 'manual';

export interface Dataset {
  id: string;
  label: string;
  region: 'CN' | 'US' | 'CA';
  automation: Automation;
  provenance: Provenance;
  /**
   * What to do when this expires; shown to the maintainer verbatim.
   * 过期时该做什么，直接展示给维护者
   */
  action: string;
}

const gh = 'https://github.com/PolicyEngine';

export function allDatasets(): Dataset[] {
  const out: Dataset[] = [];

  /* ------------------------------------------------------ China 中国 */
  for (const p of CN_PROVINCES) {
    out.push({
      id: `cn-${p.code}`,
      label: `中国 · ${p.name.zh} 社保缴费基数`,
      region: 'CN',
      automation: 'manual',
      provenance: p.provenance,
      action: `查 ${p.name.zh} 人社厅年度公告，更新 regions/cn/provinces.ts 的 avgWage 与适用期`,
    });
  }

  /* ---------------------------------------- United States 美国 */
  out.push({
    id: 'us-federal',
    label: '美国 · 联邦分档 / 标准扣除 / 社保工资基数上限',
    region: 'US',
    automation: 'synced',
    provenance: {
      ...calendarYear(US_GENERATED.taxYear),
      sourceUrl: `${gh}/policyengine-us`,
      verifiedAt: US_GENERATED.syncedAt,
      confidence: 'derived',
    },
    action: '跑 pnpm data:sync --write；若上游也没有新税年的值，说明 IRS 尚未公布',
  });

  const manualStates = US_STATES.filter(
    (s) => s.brackets && s.code !== 'CUSTOM' && stateDataTaxYear(s.code === 'NYC' ? 'NY' : s.code) !== US_GENERATED.taxYear,
  );
  if (manualStates.length > 0) {
    out.push({
      id: 'us-states-manual',
      label: `美国 · 手工维护的州分档（${manualStates.map((s) => s.code).join(' ')}）`,
      region: 'US',
      automation: 'upstream-rejected',
      provenance: {
        ...calendarYear(MANUAL_STATE_TAX_YEAR),
        verifiedAt: US_GENERATED.syncedAt,
        confidence: 'estimated',
        note: '俄亥俄上游把税收悬崖编码成隐含平均税率不可直接采信；麻州按 A/B/C 类收入分别计税，上游无对应分档文件',
      },
      action: '查各州税务局当年的分档表，更新 regions/us/states.ts',
    });
  }

  out.push({
    id: 'us-state-standard-deduction',
    label: '美国 · 各州标准扣除',
    region: 'US',
    automation: 'manual',
    provenance: {
      ...calendarYear(MANUAL_STATE_TAX_YEAR),
      verifiedAt: US_GENERATED.syncedAt,
      confidence: 'estimated',
      note: '上游各州的标准扣除路径不统一，未纳入同步',
    },
    action: '查各州税务局当年的标准扣除额，更新 regions/us/states.ts 的 standardDeduction',
  });

  /* -------------------------------------------------- Canada 加拿大 */
  out.push({
    id: 'ca-federal-brackets',
    label: '加拿大 · 联邦分档',
    region: 'CA',
    automation: 'synced',
    provenance: {
      ...calendarYear(CA_GENERATED.taxYear),
      sourceUrl: `${gh}/policyengine-canada`,
      verifiedAt: CA_GENERATED.syncedAt,
      confidence: 'derived',
    },
    action: '跑 pnpm data:sync --write',
  });

  out.push({
    id: 'ca-payroll',
    label: '加拿大 · CPP/EI 限额与联邦基本个人金额',
    region: 'CA',
    automation: 'manual',
    provenance: CA_PAYROLL_PROVENANCE,
    action:
      '查 CRA 的 CPP contribution rates 与 EI premium rates 页面，更新 regions/ca/federal.ts；' +
      '更新后 payroll 恒等式测试会自动校验数值自洽',
  });

  out.push({
    id: 'ca-provincial-brackets',
    label: '加拿大 · 省级分档与基本个人金额',
    region: 'CA',
    automation: 'upstream-rejected',
    provenance: {
      ...calendarYear(PROVINCIAL_DATA_TAX_YEAR),
      verifiedAt: CA_GENERATED.syncedAt,
      confidence: 'estimated',
      note: '上游 PolicyEngine 的省级数据停留在 2022–2023 年，比本仓库还旧，同步反而是倒退',
    },
    action: '查 CRA 的 Canadian income tax rates for individuals 页面，更新 regions/ca/provinces.ts',
  });

  return out;
}
