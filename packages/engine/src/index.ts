export * from './types.js';
export * from './defaults.js';
export * from './income.js';
export * from './invest.js';
export * from './project.js';
export * from './random.js';
export { CN_CITIES, DEFAULT_CITY, getCity } from './regions/cn/cities.js';
export type { CityProfile } from './regions/cn/cities.js';
export {
  BASIC_DEDUCTION_ANNUAL,
  COMPREHENSIVE_BRACKETS,
  DEDUCTION_STANDARDS,
  MONTHLY_BRACKETS,
  chooseBonusTaxStrategy,
  comprehensiveTax,
  findBracket,
  separateBonusTax,
} from './regions/cn/tax.js';
export type { BonusTaxChoice, TaxBracket } from './regions/cn/tax.js';
export { computeContributions, monthlySpecialDeduction } from './regions/cn/social.js';
export type { Contributions } from './regions/cn/social.js';
