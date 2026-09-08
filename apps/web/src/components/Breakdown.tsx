import type { ProjectionResult } from '@pmp/engine';
import { money, percent } from '../lib/format.js';

const Line = ({ k, v, title }: { k: string; v: string; title?: string }) => (
  <div className="row-line" title={title}>
    <span>{k}</span>
    <strong>{v}</strong>
  </div>
);

export function Breakdown({ result }: { result: ProjectionResult }) {
  const y1 = result.years[0];
  const last = result.years[result.years.length - 1];
  const m1 = result.months[0];
  if (!y1 || !last || !m1) return null;

  const strategyLabel = y1.bonusTaxStrategy === 'separate' ? '单独计税' : '并入综合所得';

  return (
    <div className="two-col">
      <div className="panel">
        <h3>首年税务明细</h3>
        <div className="rows">
          <Line k="全年税前总收入" v={money(y1.grossAnnual)} />
          <Line k="其中年终奖" v={money(y1.bonus)} />
          <Line k="五险一金个人部分" v={money(y1.socialInsuranceAnnual + y1.housingFundSelfAnnual)} />
          <Line k="专项附加扣除" v={money(y1.specialDeductionAnnual)} title="原型页面完全没有这一项" />
          <Line k="基本减除费用" v={money(60000)} />
          <Line k="全年个税" v={money(y1.taxAnnual)} />
          <Line k="实际税负率" v={percent(y1.effectiveTaxRate)} />
          <Line k="年终奖计税方式" v={strategyLabel} />
          {y1.bonusTaxSaving > 0 && (
            <Line k="择优省下" v={money(y1.bonusTaxSaving)} title="相比另一种计税方式" />
          )}
        </div>
      </div>

      <div className="panel">
        <h3>公积金与长期口径</h3>
        <div className="rows">
          <Line k="个人每月缴存" v={money(m1.housingFundSelf)} />
          <Line k="公司每月缴存" v={money(m1.housingFundEmployer)} />
          <Line k="每月实际提取" v={money(m1.housingFundWithdrawal)} title="受账户余额约束，可能低于设定值" />
          <Line k={`${result.input.investment.years} 年后账户余额`} v={money(result.summary.finalHousingFundBalance)} title="含 1.5% 结息" />
          <Line k="末年月薪" v={money(last.monthlySalary)} />
          <Line k="末年月均到手" v={money(last.avgMonthlyNet)} />
          <Line k="累计已缴个税" v={money(result.summary.totalTaxPaid)} />
          <Line k="扣除费用后的净年化" v={percent(result.summary.netAnnualReturn, 2)} title="名义年化 − 基金费率 − 股息预扣税拖累" />
        </div>
      </div>
    </div>
  );
}
