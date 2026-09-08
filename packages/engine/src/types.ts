/**
 * Personal Money Projection —— 计算引擎的公共类型契约。
 *
 * 设计约束：本包是纯函数、零运行时依赖。UI 和 API 都只依赖这里的类型，
 * 不允许反向依赖。所有金额单位为「元」，所有比率为小数（0.07 表示 7%）。
 */

export type RegionCode = 'CN';

/* ------------------------------------------------------------------ 输入 */

/** 升职/跳槽造成的薪资跳变：从第 atYear 年初（1-based）起月薪变为 newMonthlySalary */
export interface SalaryStep {
  atYear: number;
  newMonthlySalary: number;
}

export type ContinuingEducation = 'none' | 'degree' | 'vocational';
export type HousingDeductionType = 'none' | 'loan' | 'rent';
/** 住房租金扣除的城市档位：直辖市/省会/计划单列市 = tier1，市区户籍人口>100万 = tier2，其余 = tier3 */
export type RentTier = 'tier1' | 'tier2' | 'tier3';
export type ElderlyCare = 'none' | 'only-child' | 'shared';

/** 个人所得税专项附加扣除（6 项常规项；大病医疗需汇算时据实申报，不在长期预测中建模） */
export interface SpecialDeductions {
  /** 接受全日制学历教育的子女数量，每人每月 2000 元 */
  childrenCount: number;
  /** 3 岁以下婴幼儿数量，每人每月 2000 元 */
  infantCount: number;
  continuingEducation: ContinuingEducation;
  housingType: HousingDeductionType;
  /** housingType === 'rent' 时生效；未指定则回落到所选城市的默认档位 */
  rentTier?: RentTier;
  elderlyCare: ElderlyCare;
  /** elderlyCare === 'shared' 时每月分摊金额，法定上限 1500 */
  elderlyShareAmount?: number;
}

export interface IncomeInput {
  /** 税前月薪 */
  monthlySalary: number;
  /** 全年薪数（12–15）。超出 12 的部分按「全年一次性奖金」处理 */
  salaryMonths: number;
  /** 每月餐补等免税补贴，直接计入可支配现金流 */
  mealAllowance: number;
  /** 年涨薪率，作用于每年年初 */
  annualGrowthRate: number;
  /** 显式的薪资跳变，优先级高于 annualGrowthRate */
  salarySteps: SalaryStep[];
  deductions: SpecialDeductions;
}

export interface ExpenseInput {
  /** 每月生活开销（当前购买力） */
  monthlySpend: number;
  /** 开销的年增长率，通常取通胀率或略高 */
  annualGrowthRate: number;
}

export interface HousingFundInput {
  /** 每月提取金额（须符合当地提取政策，不是自动可取现金） */
  monthlyWithdrawal: number;
  /** 公积金账户结息年利率，现行为 1.5% */
  annualInterestRate: number;
  /** 提取出的公积金是否投入市场（false 表示只作为现金留存） */
  investWithdrawal: boolean;
}

export interface InvestmentInput {
  /** 起始本金 */
  initialCapital: number;
  /** 投资年限 */
  years: number;
  /** 预期名义年化总回报（含股息），例 0.07 */
  expectedAnnualReturn: number;
  /** 年化波动率，标普 500 长期约 0.15–0.18 */
  annualVolatility: number;
  /** 基金管理费/托管费等年化摩擦成本，QDII 通常 0.006–0.015 */
  feeDragAnnual: number;
  /** 股息率，用于计算预扣税拖累 */
  dividendYield: number;
  /** 股息预扣税率，中国投资者持有美股 ETF 通常 0.10 */
  dividendWithholdingTax: number;
  /** 每月可投金额中实际投入市场的比例，其余留作现金 */
  investRatio: number;
}

export interface InflationInput {
  /** 用于把名义金额折算成「今天的购买力」 */
  annualRate: number;
}

/** 用户对城市默认缴费参数的手动覆盖（工资条对不上时用） */
export interface ContributionOverrides {
  socialBaseMin?: number;
  socialBaseMax?: number;
  socialRateSelf?: number;
  housingFundBaseMin?: number;
  housingFundBaseMax?: number;
  housingFundRateSelf?: number;
  housingFundRateEmployer?: number;
}

export interface ProjectionInput {
  region: RegionCode;
  /** CityProfile.code，例 'shanghai' */
  city: string;
  income: IncomeInput;
  expense: ExpenseInput;
  housingFund: HousingFundInput;
  investment: InvestmentInput;
  inflation: InflationInput;
  overrides?: ContributionOverrides;
  /**
   * 是否允许年终奖单独计税。现行政策延续至 2027-12-31，
   * 之后如未再延期，年终奖必须并入综合所得。
   */
  allowSeparateBonusTax: boolean;
}

/* ------------------------------------------------------------------ 输出 */

/** 单一年度的收入侧结算结果 */
export interface YearIncome {
  /** 1-based 年序 */
  year: number;
  monthlySalary: number;
  /** 年度税前总收入（含年终奖） */
  grossAnnual: number;
  /** 视作全年一次性奖金的部分 */
  bonus: number;
  socialInsuranceAnnual: number;
  housingFundSelfAnnual: number;
  housingFundEmployerAnnual: number;
  specialDeductionAnnual: number;
  taxAnnual: number;
  /** 年终奖最终采用的计税方式 */
  bonusTaxStrategy: 'separate' | 'merged';
  /** 择优相比另一种方式省下的税额 */
  bonusTaxSaving: number;
  netAnnual: number;
  /** 年度平均月到手 */
  avgMonthlyNet: number;
  effectiveTaxRate: number;
}

export interface MonthState {
  /** 1-based 月序 */
  month: number;
  year: number;
  grossSalary: number;
  socialInsurance: number;
  housingFundSelf: number;
  housingFundEmployer: number;
  incomeTax: number;
  netIncome: number;
  mealAllowance: number;
  housingFundWithdrawal: number;
  spend: number;
  /** 当月投入市场的金额 */
  invested: number;
  /** 可支配但未投入市场、留作现金的部分 */
  cashSurplus: number;
  cumulativeContribution: number;
  housingFundBalance: number;
}

export interface YearPoint {
  year: number;
  /** 累计投入本金（含初始本金） */
  contribution: number;
  /** 确定性路径下的账户价值 */
  value: number;
  /** 折算到今天购买力的账户价值 */
  realValue: number;
  housingFundBalance: number;
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
  /** 终值分位数 */
  terminal: Percentiles;
  /** 终值低于累计投入本金（名义亏损）的路径占比 */
  lossProbability: number;
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
    finalHousingFundBalance: number;
    /** 扣除费用与股息税后的实际年化 */
    netAnnualReturn: number;
  };
  warnings: string[];
}
