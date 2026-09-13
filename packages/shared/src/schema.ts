/**
 * The input contract shared by frontend and backend.
 *
 * One Zod schema serves all three: frontend form validation, API input validation, and parsing
 * shared URL parameters. Define once, benefit in three places, and eliminate mismatches like
 * "the frontend accepts it but the backend rejects it".
 *
 * 前后端共用的输入契约。
 *
 * 同一份 Zod schema 同时用于：前端表单校验、API 入参校验、URL 分享参数解析。
 * 定义一处、三处受益，杜绝「前端能填、后端拒收」这类不一致。
 */

import { z } from 'zod';

const rate = (max: number) => z.number().min(-1).max(max);
const money = z.number().min(0).max(1_000_000_000).finite();

export const REGION_CODES = ['CN', 'US', 'CA'] as const;
export const regionCodeSchema = z.enum(REGION_CODES);
export type RegionCodeDTO = z.infer<typeof regionCodeSchema>;

/* ---------------------------------------- Region-specific 地区特有 */

export const cnSpecialDeductionsSchema = z.object({
  childrenCount: z.number().int().min(0).max(10),
  infantCount: z.number().int().min(0).max(10),
  continuingEducation: z.enum(['none', 'degree', 'vocational']),
  housingType: z.enum(['none', 'loan', 'rent']),
  rentTier: z.enum(['tier1', 'tier2', 'tier3']).optional(),
  elderlyCare: z.enum(['none', 'only-child', 'shared']),
  elderlyShareAmount: z.number().min(0).max(1_500).optional(),
});

export const cnParamsSchema = z.object({
  allowSeparateBonusTax: z.boolean(),
  deductions: cnSpecialDeductionsSchema,
});

export const usFilingStatusSchema = z.enum([
  'single',
  'married-joint',
  'married-separate',
  'head-of-household',
]);

export const usParamsSchema = z.object({
  filingStatus: usFilingStatusSchema,
  qualifyingChildren: z.number().int().min(0).max(10),
  itemizedDeduction: money,
  pretaxRetirementRate: z.number().min(0).max(1),
  employerMatchRate: z.number().min(0).max(0.5),
});

export const caParamsSchema = z.object({
  filingStatus: z.enum(['single', 'married']),
  rrspRate: z.number().min(0).max(1),
  employerMatchRate: z.number().min(0).max(0.5),
  otherCreditBase: money,
});

/* -------------------------------------------------- Generic 通用 */

export const salaryStepSchema = z.object({
  atYear: z.number().int().min(1).max(60),
  newMonthlySalary: money,
});

export const incomeSchema = z.object({
  monthlySalary: money,
  salaryMonths: z.number().min(12).max(24),
  taxFreeAllowance: money,
  annualGrowthRate: rate(1),
  salarySteps: z.array(salaryStepSchema).max(20),
});

export const expenseSchema = z.object({
  monthlySpend: money,
  annualGrowthRate: rate(1),
});

export const employerPlanSchema = z.object({
  monthlyWithdrawal: money,
  annualInterestRate: rate(0.2),
  investWithdrawal: z.boolean(),
});

export const investmentSchema = z.object({
  initialCapital: money,
  years: z.number().int().min(1).max(60),
  expectedAnnualReturn: rate(0.5),
  annualVolatility: z.number().min(0).max(1),
  feeDragAnnual: z.number().min(0).max(0.1),
  dividendYield: z.number().min(0).max(0.2),
  dividendWithholdingTax: z.number().min(0).max(0.5),
  investRatio: z.number().min(0).max(1),
});

export const inflationSchema = z.object({
  annualRate: rate(0.5),
});

export const overridesSchema = z
  .object({
    socialBaseMin: money.optional(),
    socialBaseMax: money.optional(),
    socialRateSelf: z.number().min(0).max(0.5).optional(),
    planBaseMin: money.optional(),
    planBaseMax: money.optional(),
    planRateSelf: z.number().min(0).max(0.3).optional(),
    planRateEmployer: z.number().min(0).max(0.3).optional(),
  })
  .optional();

export const projectionInputSchema = z
  .object({
    region: regionCodeSchema,
    /**
     * Code of the city (China) / state (US) / province (Canada).
     * 城市（中国）/ 州（美国）/ 省（加拿大）的 code
     */
    jurisdiction: z.string().min(1).max(40),
    income: incomeSchema,
    expense: expenseSchema,
    employerPlan: employerPlanSchema,
    investment: investmentSchema,
    inflation: inflationSchema,
    overrides: overridesSchema,
    // All three regions' parameters are kept at once, so switching countries loses no settings.
    // 三个地区的参数同时保留，切换国家时不丢设置
    cn: cnParamsSchema,
    us: usParamsSchema,
    ca: caParamsSchema,
  })
  .superRefine((v, ctx) => {
    if (v.overrides?.socialBaseMin !== undefined && v.overrides.socialBaseMax !== undefined) {
      if (v.overrides.socialBaseMin > v.overrides.socialBaseMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overrides', 'socialBaseMin'],
          message: '社保基数下限不能高于上限',
        });
      }
    }
    if (v.cn.deductions.elderlyCare === 'shared' && v.cn.deductions.elderlyShareAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cn', 'deductions', 'elderlyShareAmount'],
        message: '非独生子女需要填写每月分摊金额',
      });
    }
  });

export type ProjectionInputDTO = z.infer<typeof projectionInputSchema>;

/* ------------------------------------------ Scenario CRUD 方案的增删改查 */

export const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(80),
  note: z.string().max(500).optional(),
  input: projectionInputSchema,
});

export const scenarioUpdateSchema = scenarioCreateSchema.partial().extend({
  /**
   * Optimistic concurrency: the client echoes back the updatedAt it last read, and the server
   * uses it to detect conflicts.
   *
   * 乐观并发：客户端回传上次读到的更新时间，服务端据此检测冲突
   */
  expectedUpdatedAt: z.string().datetime().optional(),
});

export type ScenarioCreateDTO = z.infer<typeof scenarioCreateSchema>;
export type ScenarioUpdateDTO = z.infer<typeof scenarioUpdateSchema>;

export interface ScenarioDTO {
  id: string;
  name: string;
  note: string | null;
  input: ProjectionInputDTO;
  createdAt: string;
  updatedAt: string;
}
