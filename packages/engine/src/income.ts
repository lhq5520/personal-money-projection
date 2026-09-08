/**
 * 薪资时间轴。
 *
 * 原型页面把工资视为 40 年恒定，这是长期投影里最大的结构性失真之一：
 * 一个 25 岁月薪 1.5 万的人，40 年后月薪仍是 1.5 万，等于假设终身零涨薪。
 *
 * 逐年的税务结算已下沉到各地区模块（regions/*），这里只负责与国别无关的部分。
 */

import type { ProjectionInput, YearIncome } from './types.js';
import { getRegion } from './regions/registry.js';

/**
 * 逐年解析月薪。
 * salarySteps 中显式指定的年份直接覆盖当年月薪，其余年份在上一年基础上按 annualGrowthRate 增长。
 */
export function resolveSalarySchedule(input: ProjectionInput): number[] {
  const { income, investment } = input;
  const stepByYear = new Map(income.salarySteps.map((s) => [s.atYear, s.newMonthlySalary]));
  const schedule: number[] = [];

  let current = income.monthlySalary;
  for (let year = 1; year <= investment.years; year++) {
    if (year > 1) current *= 1 + income.annualGrowthRate;
    const override = stepByYear.get(year);
    if (override !== undefined) current = override;
    schedule.push(current);
  }
  return schedule;
}

/** 派发到当前地区的税务实现 */
export function computeYearIncome(
  input: ProjectionInput,
  year: number,
  monthlySalary: number,
): YearIncome {
  return getRegion(input.region).computeYear(input, year, monthlySalary);
}
