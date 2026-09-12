export * from './types.js';
export * from './defaults.js';
export * from './income.js';
export * from './invest.js';
export * from './project.js';
export * from './random.js';

// ---- 数据出处与时效 ----
export { calendarYear, checkFreshness, cnSocialYear } from './data/provenance.js';
export type { Confidence, DataFreshness, Provenance } from './data/provenance.js';
export { US_GENERATED, CA_GENERATED } from './data/generated/index.js';

// ---- 地区框架 ----
export { REGIONS, REGION_CODES, getRegion, getJurisdiction } from './regions/registry.js';
export type { Jurisdiction, LocalizedName, RegionModule } from './regions/types.js';
export { bracketTax, findBracket, nonRefundableCredit, clamp } from './tax/brackets.js';

// ---- 中国 ----
export {
  CN_CITIES,
  CN_JURISDICTIONS,
  DEFAULT_CITY,
  baseRangeFor,
  derivedBase,
  getCity,
  housingFundBaseRange,
  socialBaseRange,
} from './regions/cn/cities.js';
export type { BaseRange, CityBases, CityProfile } from './regions/cn/cities.js';
export {
  BASIC_DEDUCTION_ANNUAL,
  COMPREHENSIVE_BRACKETS,
  DEDUCTION_STANDARDS,
  MONTHLY_BRACKETS,
  chooseBonusTaxStrategy,
  comprehensiveTax,
  separateBonusTax,
} from './regions/cn/tax.js';
export type { BonusTaxChoice } from './regions/cn/tax.js';
export { computeContributions, monthlySpecialDeduction } from './regions/cn/social.js';
export type { CnContributions } from './regions/cn/social.js';

// ---- 美国 ----
export {
  ELECTIVE_DEFERRAL_LIMIT,
  FEDERAL_BRACKETS as US_FEDERAL_BRACKETS,
  FEDERAL_STANDARD_DEDUCTION as US_STANDARD_DEDUCTION,
  SOCIAL_SECURITY_WAGE_BASE,
  childTaxCredit,
  computeFica,
} from './regions/us/federal.js';
export {
  US_STATES,
  DEFAULT_STATE,
  MANUAL_STATE_TAX_YEAR,
  getState,
  stateDataTaxYear,
} from './regions/us/states.js';
export type { StateTax } from './regions/us/states.js';

// ---- 加拿大 ----
export {
  FEDERAL_BPA as CA_FEDERAL_BPA,
  FEDERAL_BRACKETS as CA_FEDERAL_BRACKETS,
  RRSP_DOLLAR_LIMIT,
  YMPE,
  computePayroll,
  rrspRoom,
} from './regions/ca/federal.js';
export {
  CA_PROVINCES,
  DEFAULT_PROVINCE,
  PROVINCIAL_DATA_TAX_YEAR,
  computeSurtax,
  getProvince,
} from './regions/ca/provinces.js';
export type { ProvinceTax } from './regions/ca/provinces.js';
