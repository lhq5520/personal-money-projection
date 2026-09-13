/**
 * The upstream data source inventory.
 *
 * ## Why PolicyEngine instead of an official API
 *
 * **None** of the US, Canada, or China publishes an official tax-rate API — rate tables come out
 * as legislation and administrative notices (IRS Rev. Proc., CRA web pages, notices from local
 * human resources bureaus), not as data services.
 *
 * PolicyEngine is an actively maintained open-source tax-benefit microsimulation project whose
 * parameters are YAML **versioned by effective date and carrying statutory citations** — the
 * closest thing to a machine-readable authoritative source available today. We pull it at build
 * time and vendor it into the repo rather than calling it at runtime; otherwise the offline
 * single-file build would be useless.
 *
 * China has no equivalent project and no usable public interface (the National Bureau of
 * Statistics' easyquery returns 403 UrlACL to automated access), so it relies on check-cn.ts for
 * change detection plus manual verification.
 *
 * 上游数据源清单。
 *
 * ## 为什么是 PolicyEngine 而不是官方 API
 *
 * 美国、加拿大、中国三国**都没有**官方的税率 API——税率表由立法和行政公告发布
 * （IRS Rev. Proc.、CRA 网页、各地人社局公告），不是数据服务。
 *
 * PolicyEngine 是活跃维护的开源税收-福利微观模拟项目，其参数是
 * **按生效日期分版本、带法条引用**的 YAML，这是目前能找到的最接近
 * 机器可读权威源的东西。我们在构建期拉取并固化到仓库里（vendoring），
 * 而不是运行时调用——否则单文件离线产物就废了。
 *
 * 中国没有对应的项目，也没有可用的公开接口
 * （国家统计局 easyquery 对自动化访问返回 403 UrlACL），
 * 只能靠 check-cn.ts 做变更检测 + 人工核对。
 */

// The two repos have different default branches: policyengine-us is main, policyengine-canada
// is master. Getting it wrong 404s outright — which is why sync.ts must exit non-zero on a fetch
// failure rather than letting it flash past in the log.
// 两个仓库的默认分支不一样：policyengine-us 是 main，policyengine-canada 是 master。
// 写错会直接 404——所以 sync.ts 在抓取失败时必须非零退出，不能只在日志里一闪而过。
export const POLICYENGINE_US_RAW =
  'https://raw.githubusercontent.com/PolicyEngine/policyengine-us/main/policyengine_us/parameters';
export const POLICYENGINE_CA_RAW =
  'https://raw.githubusercontent.com/PolicyEngine/policyengine-canada/master/policyengine_canada/parameters';

export const POLICYENGINE_API = 'https://api.policyengine.org';

/** Fetch paths for US federal parameters. 美国联邦参数的取数路径 */
export const US_PARAMS = {
  bracket: 'gov/irs/income/bracket.yaml',
  standardDeduction: 'gov/irs/deductions/standard/amount.yaml',
  socialSecurityCap: 'gov/irs/payroll/social_security/cap.yaml',
} as const;

/**
 * PolicyEngine's filing status enum → this project's enum.
 * PolicyEngine 的申报身份枚举 → 本项目的枚举
 */
export const US_FILING_STATUS_MAP = {
  SINGLE: 'single',
  JOINT: 'married-joint',
  SEPARATE: 'married-separate',
  HEAD_OF_HOUSEHOLD: 'head-of-household',
} as const;

/**
 * Fetch paths for US state bracket tables.
 *
 * State YAML layouts genuinely aren't uniform, but they reduce to just two patterns, which cover
 * 20 of the 21 states this project models:
 *   - schedule: brackets split into per-filing-status files, `rates/{status}.yaml` or
 *     `main/{status}.yaml`
 *   - flat: a single rate, `rate.yaml` / `rates.yaml` / `agi_rate.yaml`
 *
 * Massachusetts (MA) is the exception — it taxes Part A/B/C income separately, a structure odd
 * enough that it stays hand-maintained. States with no income tax obviously need nothing here.
 *
 * 美国各州税率表的取数路径。
 *
 * 各州的 YAML 布局确实不统一，但归纳下来只有两种模式，覆盖本项目建模的 20/21 个州：
 *   - schedule：按申报身份分文件的分档表，`rates/{status}.yaml` 或 `main/{status}.yaml`
 *   - flat：单一税率，`rate.yaml` / `rates.yaml` / `agi_rate.yaml`
 *
 * 麻州（MA）不在其中——它按 A/B/C 类收入分别计税，结构特殊，保持手工维护。
 * 无州所得税的州自然也不需要。
 */
export type StateRateKind =
  /**
   * Brackets split into per-filing-status files: `{dir}/{single|joint}.yaml`.
   * 按申报身份分文件的分档表：`{dir}/{single|joint}.yaml`
   */
  | 'schedule'
  /**
   * One bracket table shared by all filing statuses: `{dir}.yaml` containing brackets.
   * 所有申报身份共用一份分档表：`{dir}.yaml` 内含 brackets
   */
  | 'shared-schedule'
  /**
   * A single rate: the whole of `{dir}.yaml` is one date-keyed value table.
   * 单一税率：`{dir}.yaml` 整份就是一个日期键值表
   */
  | 'flat';

export const US_STATE_RATE_SOURCES: Record<string, { kind: StateRateKind; dir: string }> = {
  CA: { kind: 'schedule', dir: 'rates' },
  MN: { kind: 'schedule', dir: 'rates' },
  MD: { kind: 'schedule', dir: 'rates' },
  OR: { kind: 'schedule', dir: 'rates' },
  NY: { kind: 'schedule', dir: 'main' },
  NJ: { kind: 'schedule', dir: 'main' },
  AZ: { kind: 'schedule', dir: 'main' },
  GA: { kind: 'schedule', dir: 'main' },
  ID: { kind: 'schedule', dir: 'main' },
  VA: { kind: 'shared-schedule', dir: 'rates' },
  MS: { kind: 'shared-schedule', dir: 'rate' },
  CO: { kind: 'flat', dir: 'rate' },
  IL: { kind: 'flat', dir: 'rate' },
  MI: { kind: 'flat', dir: 'rate' },
  NC: { kind: 'flat', dir: 'rate' },
  PA: { kind: 'flat', dir: 'rate' },
  UT: { kind: 'flat', dir: 'rate' },
  KY: { kind: 'flat', dir: 'rate' },
  IN: { kind: 'flat', dir: 'agi_rate' },
  // Ohio (OH) is **deliberately not synced**.
  //
  // Upstream encodes the first bracket rate as 0.0127448, but that is not a real rate — their own
  // comment says it's an implied average rate reverse-engineered to simulate "a fixed amount
  // added on crossing the second bracket threshold". Treated as an ordinary marginal rate
  // starting from zero, an Ohioan earning $20k would be charged $254 of tax, where Ohio law says
  // $0 below $26,050.
  //
  // The lesson: syncing blindly copies another model's internal encoding tricks in as if they
  // were facts. Ohio stays hand-maintained, with data:verify's differential check as the backstop.
  //
  // 俄亥俄（OH）**刻意不同步**。
  //
  // 上游把第一档税率编码成 0.0127448，但那不是真实税率——注释里写明了它是
  // 为了模拟「跨过第二档门槛时加收一笔固定额」而反推的隐含平均税率。
  // 当成普通边际税率从 0 起征的话，年收入 2 万的俄亥俄人会被算出 254 美元税，
  // 而俄亥俄法律规定 26,050 美元以下为 0。
  //
  // 教训：盲目同步会把别人模型的内部编码技巧当成事实抄进来。
  // 俄亥俄保持手工维护，靠 data:verify 的差分验证兜底。
};

/**
 * Filing status names in the state files → this project's two state bands (single / married
 * filing jointly).
 *
 * 州级文件里的申报身份名 → 本项目州级税表的两档（单身档 / 已婚合并档）
 */
export const US_STATE_BAND_FILE = { single: 'single', married: 'joint' } as const;

export const usStatePath = (state: string, file: string): string =>
  `gov/states/${state.toLowerCase()}/tax/income/${file}`;

/**
 * Canada: paths to the federal and provincial rate tables.
 * 加拿大：联邦与各省的税率表路径
 */
export const CA_FEDERAL_SCHEDULE = 'gov/cra/tax/income/income_tax_schedule.yaml';
/**
 * Path template for the provincial rate tables. Note the filename differs from the federal one.
 * 省级税率表的路径模板。注意与联邦的文件名不同。
 */
export const CA_PROVINCE_SCHEDULE = (p: string) => `gov/provinces/${p}/tax/income/rate.yaml`;

/**
 * The 10 provinces this project models. PolicyEngine also covers 3 territories, not yet included.
 * 本项目建模的 10 个省（PolicyEngine 另有 3 个地区，暂未纳入）
 */
export const CA_PROVINCES = ['ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'on', 'pe', 'qc', 'sk'] as const;

/**
 * Entry points to the official notices for Chinese local social insurance contribution bases.
 *
 * These pages vary in structure and get redesigned often, so the script only detects **whether
 * the content changed** and does **no automatic parsing**. Auto-parsing government web pages
 * would be irresponsible here: one silent parse error and a user makes a ten-year financial
 * decision on a wrong number, with nobody the wiser.
 *
 * 中国各地社保缴费基数的官方公告入口。
 *
 * 这些页面结构各异且频繁改版，脚本只做「内容是否变化」的检测，**不做自动解析**——
 * 自动解析政府网页在这里是不负责任的：一次静默的解析错误，
 * 会让用户拿着错误的数字做十年期的财务决策，而且没人会发现。
 */
export interface WatchedPage {
  key: string;
  url: string;
  label: string;
}

/**
 * Canada's official sources.
 *
 * The CRA offers HTML pages only, but has two advantages over China's local bureaus: a single
 * stable URL and a single structured table. Even so this **only detects changes and does not
 * auto-parse** — the cost of transcribing one number wrong far exceeds the cost of a human
 * reading the page once a year. Correctness is policed by the identities in ca.test.ts
 * (max contribution = (YMPE − exemption) × rate).
 *
 * 加拿大的官方来源。
 *
 * CRA 只提供 HTML 页面，但相比中国各地人社局有两个优势：
 * 单一稳定 URL、单一结构化表格。即便如此也**只做变更检测不做自动解析**——
 * 抄错一个数字的代价，远高于每年人工看一次页面的成本。
 * 解析的正确性由 ca.test.ts 里的恒等式把关（最大缴款 = (YMPE − 免征额) × 费率）。
 */
export const CA_SOURCES: WatchedPage[] = [
  {
    key: 'cpp',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html',
    label: 'CRA · CPP 缴费率与限额',
  },
  {
    key: 'ei',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html',
    label: 'CRA · EI 保费率与最高可保收入',
  },
  {
    key: 'brackets',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html',
    label: 'CRA · 联邦与各省所得税率',
  },
  {
    key: 'indexation',
    url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html',
    label: 'CRA · 个税与福利金额的通胀指数化调整',
  },
];

export const CN_SOURCES: { city: string; url: string; label: string }[] = [
  { city: 'shanghai', url: 'https://rsj.sh.gov.cn/', label: '上海市人力资源和社会保障局' },
  { city: 'beijing', url: 'https://rsj.beijing.gov.cn/', label: '北京市人力资源和社会保障局' },
  { city: 'shenzhen', url: 'https://hrss.sz.gov.cn/', label: '深圳市人力资源和社会保障局' },
  { city: 'guangzhou', url: 'https://rsj.gz.gov.cn/', label: '广州市人力资源和社会保障局' },
  { city: 'hangzhou', url: 'https://rlsbj.hangzhou.gov.cn/', label: '杭州市人力资源和社会保障局' },
  { city: 'nanjing', url: 'https://rsj.nanjing.gov.cn/', label: '南京市人力资源和社会保障局' },
  { city: 'chengdu', url: 'https://cdhrss.chengdu.gov.cn/', label: '成都市人力资源和社会保障局' },
  { city: 'wuhan', url: 'https://rsj.wuhan.gov.cn/', label: '武汉市人力资源和社会保障局' },
];
