/**
 * 对 PolicyEngine 实时 API 做差分验证。
 *
 *   pnpm data:verify                 # 默认矩阵
 *   pnpm data:verify --year 2026
 *   pnpm data:verify --states CA,NY,TX
 *
 * ## 为什么要有这个
 *
 * 同步脚本只能保证「数字抄对了」，保证不了「算法用对了」。
 * 把同一组家庭分别喂给本引擎和一个独立维护的成熟实现，比对结果，
 * 才能同时抓住两类问题：
 *   1. 我们的计算逻辑写错了（例如把抵免当成扣除、把年中生效的变更漏了）；
 *   2. 州级数据漂移了——51 个州的 YAML 结构各异，逐个解析不现实，
 *      但只要结果对得上，数据就没问题。
 *
 * 差异不等于我们错。PolicyEngine 建模的范围比本项目大得多
 * （各类抵免、退税、福利），所以**预期会有系统性差异**；
 * 这个脚本的作用是让差异可见且可解释，而不是逼它归零。
 */

import { computeFica } from '../src/regions/us/federal.js';
import { US_REGION } from '../src/regions/us/index.js';
import { defaultInput } from '../src/defaults.js';
import type { ProjectionInput } from '../src/types.js';
import { POLICYENGINE_API } from './sources.js';
import { bold, dim, green, red, yellow } from './lib.js';

const args = process.argv.slice(2);
const yearArg = args.indexOf('--year');
const TAX_YEAR = yearArg >= 0 ? Number(args[yearArg + 1]) : new Date().getUTCFullYear();
const statesArg = args.indexOf('--states');
const STATES =
  statesArg >= 0 ? args[statesArg + 1]!.split(',') : ['CA', 'NY', 'TX', 'IL', 'MA', 'CO', 'PA'];
const INCOMES = [45_000, 90_000, 180_000, 400_000];

/** 相对差异超过这个比例就算需要人工过目 */
const TOLERANCE = 0.02;

interface PeResult {
  federal: number;
  state: number;
  socialSecurity: number;
  medicare: number;
}

async function policyEngine(state: string, income: number): Promise<PeResult> {
  const y = String(TAX_YEAR);
  const body = {
    household: {
      people: {
        you: {
          age: { [y]: 40 },
          employment_income: { [y]: income },
          employee_social_security_tax: { [y]: null },
          employee_medicare_tax: { [y]: null },
        },
      },
      tax_units: {
        tu: { members: ['you'], income_tax: { [y]: null }, state_income_tax: { [y]: null } },
      },
      families: { f: { members: ['you'] } },
      spm_units: { s: { members: ['you'] } },
      marital_units: { m: { members: ['you'] } },
      households: { h: { members: ['you'], state_name: { [y]: state } } },
    },
  };

  const res = await fetch(`${POLICYENGINE_API}/us/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    status: string;
    message?: string;
    result?: {
      tax_units: Record<string, Record<string, Record<string, number>>>;
      people: Record<string, Record<string, Record<string, number>>>;
    };
  };
  if (json.status !== 'ok' || !json.result) throw new Error(json.message ?? '上游返回异常');

  const tu = json.result.tax_units.tu!;
  const p = json.result.people.you!;
  return {
    federal: tu.income_tax![y]!,
    state: tu.state_income_tax![y]!,
    socialSecurity: p.employee_social_security_tax![y]!,
    medicare: p.employee_medicare_tax![y]!,
  };
}

function ours(state: string, income: number) {
  const input = JSON.parse(JSON.stringify(defaultInput('US'))) as ProjectionInput;
  input.jurisdiction = state;
  input.income.monthlySalary = income / 12;
  input.income.salaryMonths = 12;
  // 401(k) 归零：PolicyEngine 的默认家庭没有退休缴款，不对齐就不是同一个场景
  input.us.pretaxRetirementRate = 0;
  input.us.employerMatchRate = 0;
  input.us.filingStatus = 'single';
  input.us.qualifyingChildren = 0;

  const y = US_REGION.computeYear(input, 1, income / 12);
  const fica = computeFica(income, 'single');
  return {
    federal: y.taxBreakdown.find((t) => t.code === 'national')?.amount ?? 0,
    state:
      (y.taxBreakdown.find((t) => t.code === 'regional')?.amount ?? 0) +
      (y.taxBreakdown.find((t) => t.code === 'local')?.amount ?? 0),
    socialSecurity: fica.socialSecurity,
    medicare: fica.medicare,
  };
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function mark(a: number, b: number): { flag: string; rel: number } {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  const rel = Math.abs(a - b) / base;
  if (rel <= 1e-6) return { flag: green('='), rel };
  if (rel <= TOLERANCE) return { flag: yellow('~'), rel };
  return { flag: red('!'), rel };
}

async function main(): Promise<void> {
  console.log(bold(`\n差分验证：本引擎 vs PolicyEngine（${TAX_YEAR} 税年，单身，无 401(k)）`));
  console.log(dim(`州：${STATES.join(' ')}　收入：${INCOMES.map(money).join(' ')}\n`));

  let worst = 0;
  const flagged: string[] = [];

  for (const state of STATES) {
    for (const income of INCOMES) {
      let pe: PeResult;
      try {
        pe = await policyEngine(state, income);
      } catch (e) {
        console.log(`  ${yellow('?')} ${state} ${money(income)}: 上游调用失败 — ${String(e)}`);
        continue;
      }
      const mine = ours(state, income);

      const f = mark(mine.federal, pe.federal);
      const s = mark(mine.state, pe.state);
      const ss = mark(mine.socialSecurity, pe.socialSecurity);
      worst = Math.max(worst, f.rel, s.rel, ss.rel);

      console.log(
        `  ${state.padEnd(3)} ${money(income).padStart(9)}  ` +
          `联邦 ${f.flag} ${money(mine.federal).padStart(8)} / ${money(pe.federal).padStart(8)}  ` +
          `州 ${s.flag} ${money(mine.state).padStart(7)} / ${money(pe.state).padStart(7)}  ` +
          `社保 ${ss.flag}`,
      );
      if (f.rel > TOLERANCE) flagged.push(`${state} ${money(income)} 联邦相差 ${(f.rel * 100).toFixed(1)}%`);
      if (s.rel > TOLERANCE) flagged.push(`${state} ${money(income)} 州税相差 ${(s.rel * 100).toFixed(1)}%`);

      // 上游是公益服务，控制请求频率
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  console.log(bold(`\n最大相对差异：${(worst * 100).toFixed(1)}%`));
  if (flagged.length) {
    console.log(yellow(`\n以下组合超出 ${TOLERANCE * 100}% 容差，需人工判断是建模范围差异还是真的算错：`));
    for (const f of flagged) console.log(`  · ${f}`);
    // 不以非零码退出：差异是预期内的，强制归零会逼着人把阈值调松，反而失去意义
  } else {
    console.log(green('\n全部在容差内。'));
  }
  console.log();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
