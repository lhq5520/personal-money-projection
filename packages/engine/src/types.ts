/**
 * Personal Money Projection —— 计算引擎的公共类型契约。
 *
 * 设计约束：
 *  1. 本包是纯函数、零运行时依赖；
 *  2. 引擎不产出任何面向用户的自然语言。警告是结构化的 code + 参数，由 UI 层翻译，
 *     否则多语言就无从谈起；
 *  3. 地区差异收敛在 RegionModule 接口后面，通用流程（时间轴、投资、通胀）与地区无关。
 *
 * 金额单位为所在地区的本币主单位（元 / 美元 / 加元），比率为小数（0.07 表示 7%）。
 */

export type RegionCode = 'CN' | 'US' | 'CA';

/* ------------------------------------------------------------ 通用税率表 */

export interface TaxBracket {
  /** 该档的上界（含） */
  upTo: number;
  rate: number;
  /**
   * 速算扣除数。中国的税率表官方就以这种形式给出；
   * 美加的表没有这个概念，留空则由引擎按逐档累进计算。
   */
  quickDeduction?: number;
}

/* ------------------------------------------------------------ 地区特有参数 */

export type ContinuingEducation = 'none' | 'degree' | 'vocational';
export type HousingDeductionType = 'none' | 'loan' | 'rent';
export type RentTier = 'tier1' | 'tier2' | 'tier3';
export type ElderlyCare = 'none' | 'only-child' | 'shared';

/** 中国个税专项附加扣除（6 项常规项；大病医疗须汇算时据实申报，不可预知，不建模） */
export interface CnSpecialDeductions {
  childrenCount: number;
  infantCount: number;
  continuingEducation: ContinuingEducation;
  housingType: HousingDeductionType;
  rentTier?: RentTier;
  elderlyCare: ElderlyCare;
  /** 非独生子女每月分摊金额，法定上限 1500 */
  elderlyShareAmount?: number;
}

export interface CnParams {
  /**
   * 年终奖是否允许单独计税。现行政策延续至 2027-12-31；
   * 若不再延期，年终奖必须并入综合所得。
   */
  allowSeparateBonusTax: boolean;
  deductions: CnSpecialDeductions;
}

export type UsFilingStatus = 'single' | 'married-joint' | 'married-separate' | 'head-of-household';

export interface UsParams {
  filingStatus: UsFilingStatus;
  /** 符合条件的受抚养子女数，用于儿童税收抵免 */
  qualifyingChildren: number;
  /** 逐项扣除总额；为 0 时引擎自动采用标准扣除 */
  itemizedDeduction: number;
  /** 401(k) 传统（税前）缴纳比例。降低联邦与州应税所得，但**不降低** FICA */
  pretaxRetirementRate: number;
  /** 雇主匹配比例（占薪资的百分比） */
  employerMatchRate: number;
}

export type CaFilingStatus = 'single' | 'married';

export interface CaParams {
  filingStatus: CaFilingStatus;
  /** RRSP 缴纳比例，可从应税所得中扣除 */
  rrspRate: number;
  employerMatchRate: number;
  /** 除基本个人金额外的其他不可退还抵免的计税基数合计 */
  otherCreditBase: number;
}

/* ------------------------------------------------------------ 通用输入 */

/** 升职/跳槽造成的薪资跳变：从第 atYear 年初（1-based）起月薪变为 newMonthlySalary */
export interface SalaryStep {
  atYear: number;
  newMonthlySalary: number;
}

export interface IncomeInput {
  monthlySalary: number;
  /**
   * 全年薪数。超出 12 的部分视作一次性奖金：
   * 中国可选择单独计税，美加则直接并入普通所得。
   */
  salaryMonths: number;
  /** 每月免税补贴（餐补等），直接计入可支配现金流 */
  taxFreeAllowance: number;
  annualGrowthRate: number;
  salarySteps: SalaryStep[];
}

export interface ExpenseInput {
  monthlySpend: number;
  annualGrowthRate: number;
}

/** 账户资金的增长方式：固定结息（中国公积金）或跟随市场（401(k) / RRSP） */
export type PlanGrowth = 'fixed-interest' | 'market';

/**
 * 雇主关联的储蓄/退休账户。
 * 中国是住房公积金，美国是 401(k)，加拿大是 RRSP —— 共同点是
 * 钱从工资里扣走但进入你自己的账户，且通常有雇主配套。
 */
export interface EmployerPlanInput {
  /** 每月提取金额。仅中国公积金有此概念，美加固定为 0 */
  monthlyWithdrawal: number;
  /** growth === 'fixed-interest' 时使用；中国公积金现行 1.5% */
  annualInterestRate: number;
  /** 提取出的资金是否计入可投市场的资金池 */
  investWithdrawal: boolean;
}

export interface InvestmentInput {
  initialCapital: number;
  years: number;
  /** 预期名义年化总回报（含股息） */
  expectedAnnualReturn: number;
  annualVolatility: number;
  /** 基金管理费/托管费等年化摩擦成本 */
  feeDragAnnual: number;
  dividendYield: number;
  /** 股息预扣税率。中国投资者持有美股 ETF 通常 10%；美国本土持有者为 0（在报税时处理） */
  dividendWithholdingTax: number;
  /** 每月可投金额中实际投入市场的比例 */
  investRatio: number;
}

export interface InflationInput {
  annualRate: number;
}

/** 用户对辖区默认缴费参数的手动覆盖（工资条对不上时用） */
export interface ContributionOverrides {
  socialBaseMin?: number;
  socialBaseMax?: number;
  socialRateSelf?: number;
  planBaseMin?: number;
  planBaseMax?: number;
  planRateSelf?: number;
  planRateEmployer?: number;
}

export interface ProjectionInput {
  region: RegionCode;
  /** 辖区 code：中国的城市 / 美国的州 / 加拿大的省 */
  jurisdiction: string;
  income: IncomeInput;
  expense: ExpenseInput;
  employerPlan: EmployerPlanInput;
  investment: InvestmentInput;
  inflation: InflationInput;
  overrides?: ContributionOverrides;
  /**
   * 三个地区的参数同时保留，只有与 region 匹配的那份会被读取。
   * 这样切换国家时不会丢掉另一个国家已经填好的设置。
   */
  cn: CnParams;
  us: UsParams;
  ca: CaParams;
}

/* ------------------------------------------------------------ 结构化输出 */

/** 强制缴款的种类。UI 按 code 查翻译，引擎不产出自然语言。 */
export type ContributionCode =
  // 中国
  | 'cn-pension' | 'cn-medical' | 'cn-unemployment'
  // 美国
  | 'us-social-security' | 'us-medicare' | 'us-medicare-additional' | 'us-state-disability'
  // 加拿大
  | 'ca-cpp' | 'ca-cpp2' | 'ca-ei';

export interface ContributionComponent {
  code: ContributionCode;
  amount: number;
  /** 是否已触及该项的缴费基数/收入上限 */
  capped: boolean;
}

/** 所得税的层级。中国只有国家级，美加是联邦 + 州/省（+ 地方 / 附加税）。 */
export type TaxLayerCode = 'national' | 'regional' | 'local' | 'surtax' | 'bonus' | 'credit';

export interface TaxComponent {
  code: TaxLayerCode;
  amount: number;
}

/** 雇主关联储蓄计划的种类 */
export type PlanCode = 'cn-housing-fund' | 'us-401k' | 'ca-rrsp';

export interface YearIncome {
  /** 1-based 年序 */
  year: number;
  monthlySalary: number;
  grossAnnual: number;
  /** 视作一次性奖金的部分 */
  bonus: number;

  /** 强制社保类缴款合计（不进你的账户） */
  socialInsuranceAnnual: number;
  socialBreakdown: ContributionComponent[];

  /** 雇主关联储蓄计划：进入你自己的账户 */
  planCode: PlanCode;
  planSelfAnnual: number;
  planEmployerAnnual: number;

  /** 各项扣除合计（标准/专项附加/基本减除等，视地区而定） */
  deductionAnnual: number;
  taxableAnnual: number;

  taxAnnual: number;
  taxBreakdown: TaxComponent[];
  /** 中国特有：年终奖最终采用的计税方式 */
  bonusTaxStrategy?: 'separate' | 'merged';
  bonusTaxSaving?: number;

  /** 到手现金（不含进入储蓄计划的部分） */
  netAnnual: number;
  avgMonthlyNet: number;
  effectiveTaxRate: number;
  /** 含强制社保在内的总扣除占税前收入的比例 */
  totalBurdenRate: number;
}

export interface MonthState {
  month: number;
  year: number;
  grossSalary: number;
  socialInsurance: number;
  planSelf: number;
  planEmployer: number;
  incomeTax: number;
  netIncome: number;
  taxFreeAllowance: number;
  planWithdrawal: number;
  spend: number;
  invested: number;
  cashSurplus: number;
  cumulativeContribution: number;
  planBalance: number;
}

export interface YearPoint {
  year: number;
  contribution: number;
  value: number;
  realValue: number;
  planBalance: number;
  cashSurplus: number;
}

export interface Percentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloYearPoint extends Percentiles {
  year: number;
  real: Percentiles;
}

export interface MonteCarloResult {
  paths: number;
  seed: number;
  byYear: MonteCarloYearPoint[];
  terminal: Percentiles;
  /** 终值低于累计投入本金（名义亏损）的路径占比 */
  lossProbability: number;
}

/* ------------------------------------------------------------ 结构化警告 */

export type WarningCode =
  /** 月薪超出社保缴费基数上限，按上限封顶 */
  | 'contribution-base-capped'
  /** 储蓄计划账户余额不足以支撑设定的提取额 */
  | 'plan-balance-insufficient'
  /** 开销超过可支配收入，该阶段无可投资金 */
  | 'cash-flow-deficit'
  /** 年度投入超出中国个人购汇便利化额度 */
  | 'fx-quota-exceeded'
  /** 不同年份的年终奖最优计税方式不同 */
  | 'bonus-strategy-mixed'
  /** 401(k) / RRSP 缴纳额触及法定年度上限 */
  | 'plan-contribution-capped'
  /** 当前辖区的税率/缴费基数数据已过适用期 */
  | 'data-expired'
  /** 当前辖区的数据未经核对，只保证量级正确 */
  | 'data-unverified';

export interface ProjectionWarning {
  code: WarningCode;
  /** 供 UI 插值到译文里的参数 */
  params: Record<string, string | number>;
}

export interface ProjectionResult {
  input: ProjectionInput;
  years: YearIncome[];
  months: MonthState[];
  timeline: YearPoint[];
  summary: {
    avgMonthlyNet: number;
    monthlyInvestable: number;
    totalContribution: number;
    finalValue: number;
    finalValueReal: number;
    totalGain: number;
    totalTaxPaid: number;
    totalSocialPaid: number;
    finalPlanBalance: number;
    /** 投资组合 + 储蓄计划账户 */
    finalTotalWealth: number;
    netAnnualReturn: number;
  };
  warnings: ProjectionWarning[];
}
