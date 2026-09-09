/**
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

export const POLICYENGINE_US_RAW =
  'https://raw.githubusercontent.com/PolicyEngine/policyengine-us/master/policyengine_us/parameters';
export const POLICYENGINE_CA_RAW =
  'https://raw.githubusercontent.com/PolicyEngine/policyengine-canada/master/policyengine_canada/parameters';

export const POLICYENGINE_API = 'https://api.policyengine.org';

/** 美国联邦参数的取数路径 */
export const US_PARAMS = {
  bracket: 'gov/irs/income/bracket.yaml',
  standardDeduction: 'gov/irs/deductions/standard/amount.yaml',
  socialSecurityCap: 'gov/irs/payroll/social_security/cap.yaml',
} as const;

/** PolicyEngine 的申报身份枚举 → 本项目的枚举 */
export const US_FILING_STATUS_MAP = {
  SINGLE: 'single',
  JOINT: 'married-joint',
  SEPARATE: 'married-separate',
  HEAD_OF_HOUSEHOLD: 'head-of-household',
} as const;

/** 加拿大：联邦与各省的税率表路径 */
export const CA_FEDERAL_SCHEDULE = 'gov/cra/tax/income/income_tax_schedule.yaml';
/** 省级税率表的路径模板。注意与联邦的文件名不同。 */
export const CA_PROVINCE_SCHEDULE = (p: string) => `gov/provinces/${p}/tax/income/rate.yaml`;

/** 本项目建模的 10 个省（PolicyEngine 另有 3 个地区，暂未纳入） */
export const CA_PROVINCES = ['ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'on', 'pe', 'qc', 'sk'] as const;

/**
 * 中国各地社保缴费基数的官方公告入口。
 *
 * 这些页面结构各异且频繁改版，脚本只做「内容是否变化」的检测，**不做自动解析**——
 * 自动解析政府网页在这里是不负责任的：一次静默的解析错误，
 * 会让用户拿着错误的数字做十年期的财务决策，而且没人会发现。
 */
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
