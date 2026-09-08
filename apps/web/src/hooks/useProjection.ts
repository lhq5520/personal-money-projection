import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MC_PATHS,
  DEFAULT_MC_SEED,
  monteCarlo,
  netAnnualReturn,
  projectTimeline,
  type MonteCarloResult,
  type ProjectionInput,
  type ProjectionResult,
} from '@pmp/engine';
import type { ProjectionInputDTO } from '@pmp/shared';

/**
 * 确定性结果同步算（毫秒级，拖滑杆要跟手），
 * 蒙特卡洛防抖后再算（2000 条路径 × 240 个月，约几十毫秒，不该卡住拖动）。
 */
export function useProjection(input: ProjectionInputDTO): {
  result: ProjectionResult;
  mc: MonteCarloResult | null;
  mcPending: boolean;
} {
  const result = useMemo(() => projectTimeline(input as ProjectionInput), [input]);

  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [mcPending, setMcPending] = useState(true);

  useEffect(() => {
    setMcPending(true);
    const timer = setTimeout(() => {
      const monthlyContributions = result.months.map((m) => m.invested);
      setMc(
        monteCarlo({
          initialCapital: input.investment.initialCapital,
          monthlyContributions,
          annualReturn: netAnnualReturn(input.investment),
          annualVolatility: input.investment.annualVolatility,
          inflationRate: input.inflation.annualRate,
          yearlyContributions: result.timeline.map((t) => t.contribution),
          paths: DEFAULT_MC_PATHS,
          seed: DEFAULT_MC_SEED,
        }),
      );
      setMcPending(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [result, input.investment, input.inflation.annualRate]);

  return { result, mc, mcPending };
}
