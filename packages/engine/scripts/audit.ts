/**
 * 数据时效审计 —— CI 保证「不会静默用旧数据」的落点。
 *
 *   pnpm data:audit              # 过期即非零退出（CI 用）
 *   pnpm data:audit --warn-only  # 只报告不失败
 *   pnpm data:audit --in 60      # 预警：未来 60 天内将过期的也一并列出
 *
 * ## 这个脚本回答的问题
 *
 * 「有没有办法让信息一直是最新的？」——没有。三个国家都没有官方数据接口，
 * 税率表是立法和行政公告，不是数据服务；能同步的部分已经同步了，
 * 剩下的（中国全部、加拿大 CPP/EI 与省级、美国两个州）只能人工核对。
 *
 * 但「有没有办法保证过期一定会被发现」——有，就是这个脚本。
 * 每个数据集都带适用期；适用期一过，CI 就红，红到有人去更新为止。
 * 这比假装能自动化诚实，也比放任它悄悄过期有用。
 */

import { allDatasets, type Dataset } from '../src/data/datasets.js';
import { checkFreshness } from '../src/data/provenance.js';
import { bold, dim, green, red, yellow } from './lib.js';

const args = process.argv.slice(2);
const WARN_ONLY = args.includes('--warn-only');
const inArg = args.indexOf('--in');
const SOON_DAYS = inArg >= 0 ? Number(args[inArg + 1]) : 45;

const NOW = new Date();

const AUTOMATION_LABEL = {
  synced: green('自动同步'),
  'upstream-rejected': yellow('有上游但不采信'),
  manual: yellow('纯人工'),
} as const;

function line(d: Dataset, days: number | null): string {
  const auto = AUTOMATION_LABEL[d.automation];
  const until = d.provenance.effectiveTo ?? '无限期';
  const tail = days === null ? '' : days < 0 ? `已过期 ${-days} 天` : `剩 ${days} 天`;
  return `${d.label}　${dim(`[${auto}${dim('] ')}适用至 ${until}${tail ? ` · ${tail}` : ''}`)}`;
}

function main(): void {
  const datasets = allDatasets();
  const expired: Dataset[] = [];
  const soon: { d: Dataset; days: number }[] = [];
  const fresh: Dataset[] = [];

  for (const d of datasets) {
    const f = checkFreshness(d.provenance, NOW);
    if (f.expired) expired.push(d);
    else if (f.daysRemaining !== null && f.daysRemaining <= SOON_DAYS) {
      soon.push({ d, days: f.daysRemaining });
    } else fresh.push(d);
  }

  console.log(bold(`\n数据时效审计 · ${NOW.toISOString().slice(0, 10)}`));
  console.log(dim(`共 ${datasets.length} 个数据集　预警窗口 ${SOON_DAYS} 天\n`));

  // 按自动化程度汇总，让维护者一眼看出「哪些是我必须亲自管的」
  const byAuto = new Map<string, number>();
  for (const d of datasets) byAuto.set(d.automation, (byAuto.get(d.automation) ?? 0) + 1);
  for (const [k, v] of byAuto) {
    console.log(`  ${AUTOMATION_LABEL[k as Dataset['automation']]}: ${v} 个`);
  }

  console.log(`\n  ${green('✓')} 在适用期内: ${fresh.length}`);

  if (soon.length) {
    console.log(`\n${yellow(bold(`即将过期（${SOON_DAYS} 天内）${soon.length} 项`))}`);
    for (const { d, days } of soon.sort((a, b) => a.days - b.days)) {
      console.log(`  ${yellow('~')} ${line(d, days)}`);
      console.log(`      ${dim(d.action)}`);
    }
  }

  if (expired.length) {
    console.log(`\n${red(bold(`已过期 ${expired.length} 项`))}`);
    for (const d of expired) {
      const f = checkFreshness(d.provenance, NOW);
      console.log(`  ${red('!')} ${line(d, f.daysRemaining)}`);
      console.log(`      ${dim(d.action)}`);
      if (d.provenance.sourceUrl) console.log(`      ${dim(d.provenance.sourceUrl)}`);
    }
  }

  console.log();
  if (expired.length === 0) {
    console.log(green('全部数据集都在适用期内。\n'));
    return;
  }
  if (WARN_ONLY) {
    console.log(yellow(`${expired.length} 项已过期（--warn-only，不中断）\n`));
    return;
  }
  console.log(
    red(`${expired.length} 项已过期。`) +
      '这不是自动化失败，而是到了必须有人去核对的时候——见上面每一项的处理方式。\n',
  );
  process.exitCode = 1;
}

main();
