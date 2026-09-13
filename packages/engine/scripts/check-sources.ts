/**
 * Change detection for sources that can't be synced automatically (all of China + Canada's CRA).
 *
 *   pnpm data:check            # detect changes on official pages + report local data freshness
 *   pnpm data:check --snapshot # store the current page fingerprints as the baseline
 *
 * ## Why detect only, and not parse
 *
 * China has no usable official interface: the National Bureau of Statistics' easyquery returns
 * 403 UrlACL to automated access, and local human resources bureaus publish only HTML notices,
 * varying in structure and frequently redesigned.
 *
 * Auto-parsing government web pages would be irresponsible in this setting — one silent parse
 * error and a user makes a ten-year financial decision on the wrong contribution base, with
 * nobody ever noticing. So this script answers exactly one question: **"did the official page
 * change, should I go look?"** Value changes are verified by a human and written into cities.ts.
 *
 * Less elegant than automatic syncing, but honest.
 *
 * 无法自动同步的数据源的变更检测（中国全部 + 加拿大 CRA）。
 *
 *   pnpm data:check            # 检测官方页面是否变化 + 报告本地数据时效
 *   pnpm data:check --snapshot # 把当前页面指纹存为基线
 *
 * ## 为什么只检测、不解析
 *
 * 中国没有任何可用的官方接口：国家统计局的 easyquery 对自动化访问返回
 * 403 UrlACL，各地人社局只有 HTML 公告，结构各异且频繁改版。
 *
 * 自动解析政府网页在这个场景下是不负责任的——一次静默的解析错误，
 * 会让用户拿着错误的缴费基数做十年期的财务决策，而且没有任何人会发现。
 * 所以这个脚本只回答一个问题：**「官方页面变了吗，我该去看一眼吗」**，
 * 数值改动由人工核对后写进 cities.ts。
 *
 * 这不如自动同步优雅，但它诚实。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CN_PROVINCES } from '../src/regions/cn/provinces.js';
import { checkFreshness } from '../src/data/provenance.js';
import { CA_SOURCES, CN_SOURCES } from './sources.js';
import { bold, dim, green, red, yellow } from './lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(HERE, '..', 'src', 'data', 'generated', 'cn-source-snapshot.json');

const SNAPSHOT_MODE = process.argv.includes('--snapshot');
const NOW = new Date();

type Snapshot = Record<string, { hash: string; checkedAt: string }>;

function loadSnapshot(): Snapshot {
  if (!existsSync(SNAPSHOT)) return {};
  try {
    return JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
  } catch {
    return {};
  }
}

/**
 * Page fingerprint.
 *
 * Hash only the digit strings in the body text: government homepages tend to carry carousels,
 * timestamps, and visit counters, so hashing the whole page reports "changed" every single time —
 * noisy enough that nobody looks anymore. What we actually care about is whether the numbers moved.
 *
 * 页面指纹。
 *
 * 只取正文里的数字串来做哈希：政府网站首页往往带轮播、时间戳、访问计数，
 * 对整页取哈希会每次都「有变化」，噪音大到没人会再看。
 * 我们真正关心的是页面上的数字有没有动。
 */
function fingerprint(html: string): string {
  const numbers = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .match(/\d[\d,]{3,}/g);
  return createHash('sha256').update((numbers ?? []).join('|')).digest('hex').slice(0, 16);
}

async function main(): Promise<void> {
  console.log(bold('\n无上游数据源检查（中国社保 + 加拿大 CRA）'));

  /* ---------------- 1. Local data freshness 本地数据时效 ---------------- */
  // Contribution bases are pooled provincially, so report by province — updating one province
  // benefits every city in it at once.
  // 缴费基数是省级统筹的，所以按省报告——一个省更新，全省各市一起受益
  console.log(bold('\n[1] 中国省级数据时效'));
  const expired: string[] = [];
  let verified = 0;

  for (const prov of CN_PROVINCES) {
    const f = checkFreshness(prov.provenance, NOW);
    if (prov.provenance.confidence === 'verified' && !f.expired) {
      verified++;
      continue;
    }
    expired.push(`${prov.name.zh} 适用期至 ${prov.provenance.effectiveTo ?? '—'}`);
  }

  console.log(`  ${green('✓')} ${verified} / ${CN_PROVINCES.length} 个省级统筹单位已核对且在适用期内`);
  if (expired.length) {
    console.log(`  ${red('!')} ${expired.length} 个待处理：`);
    for (const e of expired) console.log(`      ${e}`);
  }

  /* ---------------- 2. Official page change detection 官方页面变更检测 ---------------- */
  //
  // ⚠ This section has a poor signal-to-noise ratio. Treat it as a hint and **do not** gate CI on it.
  // ⚠ 这一节的信噪比很低，仅作参考，**不要**据此设 CI 门禁。
  //
  // These point at bureau homepages, which rotate news daily, so the fingerprint changes almost
  // by necessity. The genuinely reliable trigger is the calendar: China's social insurance year
  // rolls over on July 1 and notices land in July–August, so "effective period expired" is itself
  // the most accurate signal — that's data:audit's job, and it is the actual CI gate.
  // 指向的是人社局首页，而首页每天滚动新闻，指纹几乎必然变化。
  // 真正可靠的触发器是日历：中国社保年度每年 7 月 1 日切换、公告在 7–8 月发布，
  // 所以「适用期到期」本身就是最准的信号——那由 data:audit 负责，它才是 CI 的门禁。
  console.log(bold('\n[2] 中国人社局页面变更检测（参考，噪音较大）'));
  const prev = loadSnapshot();
  const next: Snapshot = {};
  const checkedAt = NOW.toISOString().slice(0, 10);
  let changed = 0;

  for (const src of CN_SOURCES) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; personal-money-projection/data-check)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.log(`  ${yellow('?')} ${src.label}: HTTP ${res.status}`);
        next[src.city] = prev[src.city] ?? { hash: '', checkedAt };
        continue;
      }
      const hash = fingerprint(await res.text());
      next[src.city] = { hash, checkedAt };

      const before = prev[src.city]?.hash;
      if (!before) {
        console.log(`  ${dim('·')} ${src.label}: 首次记录指纹`);
      } else if (before !== hash) {
        changed++;
        console.log(`  ${red('!')} ${src.label}: 页面数字有变动 — ${src.url}`);
      } else {
        console.log(`  ${green('=')} ${src.label}: 无变化`);
      }
    } catch (e) {
      console.log(`  ${yellow('?')} ${src.label}: 无法访问（${String(e).slice(0, 60)}）`);
      next[src.city] = prev[src.city] ?? { hash: '', checkedAt };
    }
  }

  if (SNAPSHOT_MODE) {
    mkdirSync(dirname(SNAPSHOT), { recursive: true });
    writeFileSync(SNAPSHOT, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\n  ${green('→')} 基线已写入 src/data/generated/cn-source-snapshot.json`);
  }

  /* ---------------- 3. Canada official page change detection 加拿大官方页面变更检测 ---------------- */
  console.log(bold('\n[3] 加拿大 CRA 页面变更检测'));
  for (const src of CA_SOURCES) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; personal-money-projection/data-check)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.log(`  ${yellow('?')} ${src.label}: HTTP ${res.status}`);
        next[`ca-${src.key}`] = prev[`ca-${src.key}`] ?? { hash: '', checkedAt };
        continue;
      }
      const hash = fingerprint(await res.text());
      next[`ca-${src.key}`] = { hash, checkedAt };
      const before = prev[`ca-${src.key}`]?.hash;
      if (!before) console.log(`  ${dim('·')} ${src.label}: 首次记录指纹`);
      else if (before !== hash) {
        changed++;
        console.log(`  ${red('!')} ${src.label}: 页面数字有变动 — ${src.url}`);
      } else console.log(`  ${green('=')} ${src.label}: 无变化`);
    } catch (e) {
      console.log(`  ${yellow('?')} ${src.label}: 无法访问（${String(e).slice(0, 50)}）`);
      next[`ca-${src.key}`] = prev[`ca-${src.key}`] ?? { hash: '', checkedAt };
    }
  }

  /* ---------------- 4. Conclusion 结论 ---------------- */
  console.log(bold('\n结论'));
  if (changed === 0 && expired.length === 0) {
    console.log(green('  数据在适用期内，官方页面无变动。'));
  } else {
    console.log('  需要人工处理：');
    if (changed) {
      console.log(
        `    · ${changed} 个官方页面的数字有变动（${dim('首页噪音大，仅供参考')}）`,
      );
    }
    if (expired.length) {
      console.log(`    · ${expired.length} 个省级统筹单位的数据已过适用期`);
      console.log(
        dim(
          '      更新方式：在 regions/cn/provinces.ts 里改该省的 avgWage 与 provenance 适用期。' +
            '基数上下限会按 60%/300% 自动推导，全省各市一起更新',
        ),
      );
    }
  }
  console.log();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
