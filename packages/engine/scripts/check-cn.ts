/**
 * 中国社保数据的变更检测。
 *
 *   pnpm data:check:cn            # 检测官方页面是否变化 + 报告本地数据时效
 *   pnpm data:check:cn --snapshot # 把当前页面指纹存为基线
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
import { CN_CITIES } from '../src/regions/cn/cities.js';
import { checkFreshness } from '../src/data/provenance.js';
import { CN_SOURCES } from './sources.js';
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
  console.log(bold('\n中国社保数据检查'));

  /* ---------------- 1. 本地数据时效 ---------------- */
  console.log(bold('\n[1] 本地数据时效'));
  const expired: string[] = [];
  const unverified: string[] = [];
  let verified = 0;

  for (const city of CN_CITIES) {
    if (city.code === 'custom') continue;
    const f = checkFreshness(city.provenance, NOW);
    if (city.provenance.confidence === 'verified' && !f.expired) {
      verified++;
      continue;
    }
    const label = `${city.name.zh}(${city.code})`;
    if (f.expired) expired.push(`${label} 适用期至 ${city.provenance.effectiveTo}`);
    else if (city.provenance.confidence === 'estimated') unverified.push(label);
  }

  console.log(`  ${green('✓')} ${verified} 个城市已核对且在适用期内`);
  if (unverified.length) {
    console.log(`  ${yellow('~')} ${unverified.length} 个城市为估算值：${unverified.join('、')}`);
  }
  if (expired.length) {
    console.log(`  ${red('!')} ${expired.length} 个城市数据已过期：`);
    for (const e of expired.slice(0, 8)) console.log(`      ${e}`);
    if (expired.length > 8) console.log(`      ${dim(`…以及其余 ${expired.length - 8} 个`)}`);
  }

  /* ---------------- 2. 官方页面变更检测 ---------------- */
  console.log(bold('\n[2] 官方公告页面变更检测'));
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

  /* ---------------- 3. 结论 ---------------- */
  console.log(bold('\n结论'));
  if (changed === 0 && expired.length === 0) {
    console.log(green('  数据在适用期内，官方页面无变动。'));
  } else {
    console.log('  需要人工处理：');
    if (changed) console.log(`    · ${changed} 个官方页面的数字有变动，去看一眼是不是发布了新年度基数`);
    if (expired.length) {
      console.log(`    · ${expired.length} 个城市的数据已过适用期`);
      console.log(
        dim(
          '      更新方式：在 cities.ts 里改该城市的 avgWage（或 bases），' +
            '并把 provenance 的适用期、来源与 verifiedAt 一并更新',
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
