/**
 * Sync US and Canadian tax parameters from PolicyEngine.
 *
 *   pnpm data:sync              # report differences only, write nothing
 *   pnpm data:sync --write      # write differences into src/data/generated/
 *   pnpm data:sync --year 2027  # target a specific tax year
 *
 * The design trade-off: **fetch at build time and vendor into the repo**, rather than calling the
 * upstream API at runtime. A runtime dependency would destroy two things already promised —
 * offline use, and the single-file build. The cost is that data needs periodic syncing, which is
 * why this script runs on a schedule in CI and opens a PR automatically.
 *
 * 从 PolicyEngine 同步美国与加拿大的税率参数。
 *
 *   pnpm data:sync              # 只报告差异，不写文件
 *   pnpm data:sync --write      # 差异写入 src/data/generated/
 *   pnpm data:sync --year 2027  # 指定税年
 *
 * 设计取舍：**构建期拉取、固化进仓库**，而不是运行时调用上游 API。
 * 运行时依赖会毁掉两件已经承诺的事——离线可用，以及单文件构建产物。
 * 代价是数据需要定期同步，所以这个脚本要在 CI 里定时跑并自动开 PR。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CA_FEDERAL_SCHEDULE,
  CA_PROVINCES,
  CA_PROVINCE_SCHEDULE,
  POLICYENGINE_CA_RAW,
  POLICYENGINE_US_RAW,
  US_FILING_STATUS_MAP,
  US_PARAMS,
  US_STATE_BAND_FILE,
  US_STATE_RATE_SOURCES,
  usStatePath,
} from './sources.js';
import {
  bold,
  datedValues,
  diffLine,
  dim,
  fetchYaml,
  green,
  latestEffectiveDate,
  red,
  valueForYear,
  yellow,
} from './lib.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'generated');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const yearArg = args.indexOf('--year');
const TAX_YEAR = yearArg >= 0 ? Number(args[yearArg + 1]) : new Date().getUTCFullYear();

interface Bracket {
  upTo: number;
  rate: number;
}

interface UsData {
  taxYear: number;
  syncedAt: string;
  source: string;
  brackets: Record<string, Bracket[]>;
  standardDeduction: Record<string, number>;
  socialSecurityWageBase: number;
  /**
   * State brackets: { CA: { single: [...], married: [...] } }. States that couldn't be synced
   * don't appear here.
   * 州级分档：{ CA: { single: [...], married: [...] } }。未能同步的州不出现在这里
   */
  states: Record<string, { single: Bracket[]; married: Bracket[] }>;
}

interface CaData {
  taxYear: number;
  syncedAt: string;
  source: string;
  federalBrackets: Bracket[];
  federalStaleFields: string[];
  provincialBrackets: Record<string, Bracket[]>;
}

const INF = Number.POSITIVE_INFINITY;

/* ------------------------------------------------- United States 美国 */

async function syncUs(): Promise<UsData> {
  const bracket = await fetchYaml<Record<string, unknown>>(`${POLICYENGINE_US_RAW}/${US_PARAMS.bracket}`);
  const stdRaw = await fetchYaml<Record<string, unknown>>(
    `${POLICYENGINE_US_RAW}/${US_PARAMS.standardDeduction}`,
  );
  const capRaw = await fetchYaml<Record<string, unknown>>(
    `${POLICYENGINE_US_RAW}/${US_PARAMS.socialSecurityCap}`,
  );

  // rates: { '1': { '2018-01-01': 0.1 }, ... }；thresholds: { '1': { SINGLE: { values: {...} } } }
  const rates = bracket.rates as Record<string, unknown>;
  const thresholds = bracket.thresholds as Record<string, unknown>;

  const brackets: Record<string, Bracket[]> = {};
  for (const [peStatus, ourStatus] of Object.entries(US_FILING_STATUS_MAP)) {
    const rows: Bracket[] = [];
    for (let i = 1; i <= 7; i++) {
      const rate = valueForYear(datedValues(rates[String(i)]), TAX_YEAR);
      if (rate === undefined) continue;
      // PolicyEngine's thresholds[i] is the **upper bound** of bracket i (2018 single bracket 1
      // = 9,525, i.e. 10% applies to 0–9,525), not its starting point. Bracket 7 has no upper bound.
      // PolicyEngine 的 thresholds[i] 是第 i 档的**上界**（2018 年单身第 1 档 = 9,525，
      // 即 10% 适用于 0–9,525），不是起征点。第 7 档无上界。
      const upTo =
        i < 7
          ? valueForYear(
              datedValues((thresholds[String(i)] as Record<string, unknown>)?.[peStatus]),
              TAX_YEAR,
            )
          : INF;
      rows.push({ upTo: upTo ?? INF, rate });
    }
    brackets[ourStatus] = rows;
  }

  const standardDeduction: Record<string, number> = {};
  for (const [peStatus, ourStatus] of Object.entries(US_FILING_STATUS_MAP)) {
    const v = valueForYear(datedValues(stdRaw[peStatus]), TAX_YEAR);
    if (v !== undefined) standardDeduction[ourStatus] = v;
  }

  const socialSecurityWageBase = valueForYear(datedValues(capRaw), TAX_YEAR) ?? 0;

  // Check bracket by bracket whether the federal thresholds lag the target tax year — this is
  // exactly what tripped up Canada.
  // 逐档检查联邦阈值有没有落后于目标税年——加拿大就栽在这上面
  for (let i = 1; i <= 6; i++) {
    const node = (thresholds[String(i)] as Record<string, unknown>)?.SINGLE;
    const latest = latestEffectiveDate(datedValues(node));
    if (latest && Number(latest.slice(0, 4)) < TAX_YEAR) {
      console.log(
        `  ${red('!')} 联邦第 ${i} 档阈值最后更新于 ${latest.slice(0, 4)} 年，落后于 ${TAX_YEAR} 税年`,
      );
    }
  }

  const { states, ok, failed } = await syncUsStates();
  console.log(`  ${green('✓')} 州级分档已同步 ${ok.length} 个州：${ok.join(' ')}`);
  if (failed.length) console.log(`  ${yellow('?')} 未能同步：${failed.join(' ')}`);

  return {
    taxYear: TAX_YEAR,
    syncedAt: new Date().toISOString().slice(0, 10),
    source: 'PolicyEngine/policyengine-us',
    brackets,
    standardDeduction,
    socialSecurityWageBase,
    states,
  };
}

/**
 * Sync the state bracket tables. Failed states are skipped and counted silently, with the caller
 * reporting the summary.
 *
 * 同步各州分档表。失败的州静默跳过并计数，由调用方汇总报告。
 */
async function syncUsStates(): Promise<{
  states: UsData['states'];
  ok: string[];
  failed: string[];
}> {
  const states: UsData['states'] = {};
  const ok: string[] = [];
  const failed: string[] = [];

  for (const [code, src] of Object.entries(US_STATE_RATE_SOURCES)) {
    try {
      if (src.kind === 'flat') {
        // Flat rate: the whole file is a single date-keyed value table.
        // 单一税率：整份文件就是一个日期键值表
        const doc = await fetchYaml(`${POLICYENGINE_US_RAW}/${usStatePath(code, `${src.dir}.yaml`)}`);
        const rate = valueForYear(datedValues(doc), TAX_YEAR);
        if (rate === undefined) throw new Error('该税年无取值');
        const rows = [{ upTo: INF, rate }];
        states[code] = { single: rows, married: rows };
      } else if (src.kind === 'shared-schedule') {
        // One bracket table shared by every filing status.
        // 所有申报身份共用一份分档表
        const rows = parseCaSchedule(
          await fetchYaml(`${POLICYENGINE_US_RAW}/${usStatePath(code, `${src.dir}.yaml`)}`),
        );
        if (rows.length === 0) throw new Error('分档表为空');
        states[code] = { single: rows, married: rows };
      } else {
        const single = parseCaSchedule(
          await fetchYaml(
            `${POLICYENGINE_US_RAW}/${usStatePath(code, `${src.dir}/${US_STATE_BAND_FILE.single}.yaml`)}`,
          ),
        );
        const married = parseCaSchedule(
          await fetchYaml(
            `${POLICYENGINE_US_RAW}/${usStatePath(code, `${src.dir}/${US_STATE_BAND_FILE.married}.yaml`)}`,
          ),
        );
        if (single.length === 0 || married.length === 0) throw new Error('分档表为空');
        states[code] = { single, married };
      }
      ok.push(code);
    } catch (e) {
      failed.push(`${code}(${String(e).slice(0, 40)})`);
    }
  }
  return { states, ok, failed };
}

/* --------------------------------------------------------- Canada 加拿大 */

/**
 * The year of upstream's last change to this table, used to judge whether upstream itself is stale.
 * 上游这份表最后一次变更的年份，用于判断上游本身是否过期
 */
function upstreamStaleness(node: unknown): number | undefined {
  const list = (node as { brackets?: unknown[] })?.brackets ?? [];
  let latest: string | undefined;
  for (const b of list) {
    const entry = b as { threshold?: unknown; rate?: unknown };
    for (const part of [entry.threshold, entry.rate]) {
      const d = latestEffectiveDate(datedValues(part));
      if (d && (!latest || d > latest)) latest = d;
    }
  }
  return latest ? Number(latest.slice(0, 4)) : undefined;
}

/**
 * Check a bracket table field by field for anything that already lags the target tax year.
 *
 * This is not a theoretical concern: in Canada's federal table the **rates** are updated to 2026
 * (0.14) while the **thresholds** are stuck on 2025. valueForYear takes "the latest value no later
 * than the target year", so the 2025 thresholds get used as if they were 2026 — silently wrong.
 *
 * Looking only at the file's overall last-modified time isn't enough; it has to be per field.
 *
 * 逐字段检查一份分档表里有没有「已经落后于目标税年」的字段。
 *
 * 这不是理论问题：加拿大联邦表的**费率**更新到了 2026（0.14），
 * **阈值**却停留在 2025。valueForYear 取「不晚于目标年的最新值」，
 * 于是 2025 的阈值被当成 2026 的用了——错得悄无声息。
 *
 * 只看整份文件的最后更新时间不够，必须逐字段看。
 */
function staleFields(node: unknown, taxYear: number): string[] {
  const list = (node as { brackets?: unknown[] })?.brackets ?? [];
  const stale: string[] = [];
  list.forEach((b, i) => {
    const entry = b as { threshold?: unknown; rate?: unknown };
    for (const [name, part] of [
      ['阈值', entry.threshold],
      ['费率', entry.rate],
    ] as const) {
      // The first bracket's threshold is always 0 and never needs updating, so it can't be stale.
      // 第一档阈值恒为 0，从不需要更新，不算过期
      if (name === '阈值' && i === 0) continue;
      const latest = latestEffectiveDate(datedValues(part));
      if (latest && Number(latest.slice(0, 4)) < taxYear) {
        stale.push(`第${i + 1}档${name}(最后更新 ${latest.slice(0, 4)})`);
      }
    }
  });
  return stale;
}

/**
 * PolicyEngine's generic bracket table shape: [{ threshold: { values }, rate: { values } }, ...]
 * Canada's provincial tables and the US state tables use the same shape, so they share this parser.
 *
 * PolicyEngine 的分档表通用结构：[{ threshold: { values }, rate: { values } }, ...]
 * 加拿大的省级表和美国的州级表用的是同一种形状，所以共用这个解析器。
 */
function parseCaSchedule(node: unknown): Bracket[] {
  const list = (node as { brackets?: unknown[] })?.brackets ?? [];
  const rows: { threshold: number; rate: number }[] = [];
  for (const b of list) {
    const entry = b as { threshold?: unknown; rate?: unknown };
    const threshold = valueForYear(datedValues(entry.threshold), TAX_YEAR);
    const rate = valueForYear(datedValues(entry.rate), TAX_YEAR);
    if (threshold === undefined || rate === undefined) continue;
    rows.push({ threshold, rate });
  }
  rows.sort((a, b) => a.threshold - b.threshold);
  // Upstream gives each bracket's **starting point**, while this project's tables use the **upper
  // bound**, so everything shifts by one.
  // 上游给的是每档的**起征点**，本项目的表用**上界**，需要错位一格
  return rows.map((r, i) => ({ upTo: rows[i + 1]?.threshold ?? INF, rate: r.rate }));
}

async function syncCa(): Promise<CaData> {
  const federalDoc = await fetchYaml(`${POLICYENGINE_CA_RAW}/${CA_FEDERAL_SCHEDULE}`);
  const federal = parseCaSchedule(federalDoc);

  const federalStale = staleFields(federalDoc, TAX_YEAR);
  if (federalStale.length > 0) {
    console.log(
      `  ${red('!')} 联邦表有字段落后于 ${TAX_YEAR} 税年：${federalStale.join('、')}——` +
        '本地改用手工维护值，见 regions/ca/federal.ts',
    );
  }

  const provincialBrackets: Record<string, Bracket[]> = {};
  for (const p of CA_PROVINCES) {
    const url = `${POLICYENGINE_CA_RAW}/${CA_PROVINCE_SCHEDULE(p)}`;
    try {
      const doc = await fetchYaml(url);
      provincialBrackets[p.toUpperCase()] = parseCaSchedule(doc);
      // Upstream can be stale too — Ontario's provincial rate table sat on 2022 for a long time.
      // When that happens the locally hand-verified values are the newer ones, and must never be
      // blindly overwritten.
      // 上游自己也可能过期——安省的省级税率表就长期停留在 2022 年。
      // 这种时候本地手工核对的值反而更新，绝不能盲目覆盖。
      const stale = upstreamStaleness(doc);
      if (stale && stale < TAX_YEAR) {
        console.log(
          `  ${red('!')} ${p.toUpperCase()}: 上游数据最后生效于 ${stale} 年，早于目标税年 ${TAX_YEAR}——` +
            '上游比本地旧，不要采信',
        );
      }
    } catch {
      console.log(`  ${yellow('?')} ${p.toUpperCase()}: 上游无此路径，跳过`);
    }
  }

  return {
    taxYear: TAX_YEAR,
    syncedAt: new Date().toISOString().slice(0, 10),
    source: 'PolicyEngine/policyengine-canada',
    federalBrackets: federal,
    /**
     * Fields in upstream's federal table that lag the target tax year. Non-empty means it can't be
     * trusted as-is.
     * 上游联邦表里落后于目标税年的字段。非空即表示不可直接采信。
     */
    federalStaleFields: federalStale,
    provincialBrackets,
  };
}

/* ------------------------------------------------------------ Output 输出 */

function readExisting<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, file), 'utf8')) as T;
  } catch {
    return null;
  }
}

function emit(file: string, data: unknown, diffs: string[]): void {
  if (diffs.length === 0) {
    console.log(`  ${green('✓')} ${file} 与上游一致`);
  } else {
    for (const d of diffs) console.log(`  ${d}`);
  }
  if (WRITE) {
    mkdirSync(OUT_DIR, { recursive: true });
    // JSON has no Infinity. The top bracket's upTo is written as null and restored to Infinity on
    // the read side (data/generated/index.ts).
    // JSON 没有 Infinity。最高档的 upTo 写成 null，读取侧（data/generated/index.ts）还原为 Infinity。
    writeFileSync(join(OUT_DIR, file), `${JSON.stringify(data, null, 2)}\n`);
    console.log(`  ${green('→')} 已写入 src/data/generated/${file}`);
  }
}

async function main(): Promise<void> {
  console.log(bold(`\n从 PolicyEngine 同步 ${TAX_YEAR} 税年参数`));
  console.log(dim(WRITE ? '模式：写入' : '模式：只报告差异（加 --write 才写文件）'));

  console.log(bold('\n[US] 联邦'));
  const us = await syncUs();
  const prevUs = readExisting<UsData>('us.json');
  const usDiffs: string[] = [];
  for (const [status, amount] of Object.entries(us.standardDeduction)) {
    const line = diffLine(`标准扣除 ${status}`, prevUs?.standardDeduction[status], amount);
    if (line) usDiffs.push(line);
  }
  const ssLine = diffLine('社保工资基数上限', prevUs?.socialSecurityWageBase, us.socialSecurityWageBase);
  if (ssLine) usDiffs.push(ssLine);
  for (const [status, rows] of Object.entries(us.brackets)) {
    rows.forEach((b, i) => {
      const prev = prevUs?.brackets[status]?.[i];
      if (!Number.isFinite(b.upTo)) return;
      const line = diffLine(`${status} 第 ${i + 1} 档上界`, prev?.upTo, b.upTo);
      if (line) usDiffs.push(line);
    });
  }
  emit('us.json', us, usDiffs);

  console.log(bold('\n[CA] 联邦与各省'));
  const ca = await syncCa();
  const prevCa = readExisting<CaData>('ca.json');
  const caDiffs: string[] = [];
  ca.federalBrackets.forEach((b, i) => {
    const prev = prevCa?.federalBrackets[i];
    const l1 = diffLine(`联邦第 ${i + 1} 档税率`, prev?.rate, b.rate, 1e-6);
    if (l1) caDiffs.push(l1);
    if (Number.isFinite(b.upTo)) {
      const l2 = diffLine(`联邦第 ${i + 1} 档上界`, prev?.upTo, b.upTo);
      if (l2) caDiffs.push(l2);
    }
  });
  console.log(`  ${dim(`省级覆盖：${Object.keys(ca.provincialBrackets).join(' ')}`)}`);
  emit('ca.json', ca, caDiffs);

  console.log(
    bold('\n提示：') +
      '中国无可用上游，请另行运行 ' +
      green('pnpm data:check:cn') +
      ' 做变更检测后人工核对。\n',
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
