/**
 * 前后端共用的输入契约。
 *
 * 同一份 Zod schema 同时用于：前端表单校验、API 入参校验、URL 分享参数解析。
 * 定义一处、三处受益，杜绝「前端能填、后端拒收」这类不一致。
 */

import { z } from 'zod';

const rate = (max: number) => z.number().min(-1).max(max);
const money = z.number().min(0).max(1_000_000_000).finite();

export const salaryStepSchema = z.object({
  atYear: z.number().int().min(1).max(60),
  newMonthlySalary: money,
});

export const specialDeductionsSchema = z.object({
  childrenCount: z.number().int().min(0).max(10),
  infantCount: z.number().int().min(0).max(10),
  continuingEducation: z.enum(['none', 'degree', 'vocational']),
  housingType: z.enum(['none', 'loan', 'rent']),
  rentTier: z.enum(['tier1', 'tier2', 'tier3']).optional(),
  elderlyCare: z.enum(['none', 'only-child', 'shared']),
  elderlyShareAmount: z.number().min(0).max(1_500).optional(),
});

export const incomeSchema = z.object({
  monthlySalary: money,
  salaryMonths: z.number().min(12).max(24),
  mealAllowance: money,
  annualGrowthRate: rate(1),
  salarySteps: z.array(salaryStepSchema).max(20),
  deductions: specialDeductionsSchema,
});

export const expenseSchema = z.object({
  monthlySpend: money,
  annualGrowthRate: rate(1),
});

export const housingFundSchema = z.object({
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
    housingFundBaseMin: money.optional(),
    housingFundBaseMax: money.optional(),
    housingFundRateSelf: z.number().min(0).max(0.3).optional(),
    housingFundRateEmployer: z.number().min(0).max(0.3).optional(),
  })
  .optional();

export const projectionInputSchema = z
  .object({
    region: z.literal('CN'),
    city: z.string().min(1).max(40),
    allowSeparateBonusTax: z.boolean(),
    income: incomeSchema,
    expense: expenseSchema,
    housingFund: housingFundSchema,
    investment: investmentSchema,
    inflation: inflationSchema,
    overrides: overridesSchema,
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
    if (v.income.deductions.elderlyCare === 'shared' && v.income.deductions.elderlyShareAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['income', 'deductions', 'elderlyShareAmount'],
        message: '非独生子女需要填写每月分摊金额',
      });
    }
  });

export type ProjectionInputDTO = z.infer<typeof projectionInputSchema>;

/* ------------------------------------------------------- 方案的增删改查 */

export const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(80),
  note: z.string().max(500).optional(),
  input: projectionInputSchema,
});

export const scenarioUpdateSchema = scenarioCreateSchema.partial().extend({
  /** 乐观并发：客户端回传上次读到的更新时间，服务端据此检测冲突 */
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
