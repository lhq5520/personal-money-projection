import { CN_CITIES, getCity } from '@pmp/engine';
import type { ProjectionInputDTO } from '@pmp/shared';
import { CheckboxField, SelectField, SliderField } from './Fields.js';

interface Props {
  input: ProjectionInputDTO;
  onChange: (next: ProjectionInputDTO) => void;
}

const cityOptions = CN_CITIES.map((c) => ({ value: c.code, label: c.name }));

export function ControlPanel({ input, onChange }: Props) {
  const city = getCity(input.city);

  const setIncome = (patch: Partial<ProjectionInputDTO['income']>) =>
    onChange({ ...input, income: { ...input.income, ...patch } });
  const setDeductions = (patch: Partial<ProjectionInputDTO['income']['deductions']>) =>
    setIncome({ deductions: { ...input.income.deductions, ...patch } });
  const setExpense = (patch: Partial<ProjectionInputDTO['expense']>) =>
    onChange({ ...input, expense: { ...input.expense, ...patch } });
  const setHF = (patch: Partial<ProjectionInputDTO['housingFund']>) =>
    onChange({ ...input, housingFund: { ...input.housingFund, ...patch } });
  const setInv = (patch: Partial<ProjectionInputDTO['investment']>) =>
    onChange({ ...input, investment: { ...input.investment, ...patch } });

  return (
    <section className="panel controls" aria-label="参数设置">
      <h2>你的参数</h2>

      <fieldset className="group">
        <legend>地区与政策</legend>
        <SelectField
          label="城市"
          value={input.city}
          onChange={(v) => onChange({ ...input, city: v })}
          options={cityOptions}
          hint={city.effectiveNote}
        />
        <CheckboxField
          label="年终奖可单独计税"
          checked={input.allowSeparateBonusTax}
          onChange={(v) => onChange({ ...input, allowSeparateBonusTax: v })}
          hint="现行政策延续至 2027-12-31。勾选时模型会逐年在「单独计税」和「并入综合所得」之间自动择优。"
        />
      </fieldset>

      <fieldset className="group">
        <legend>收入</legend>
        <SliderField label="税前月薪" value={input.income.monthlySalary} onChange={(v) => setIncome({ monthlySalary: v })}
          min={3000} max={200000} step={100} suffix="元" />
        <SliderField label="全年薪数" value={input.income.salaryMonths} onChange={(v) => setIncome({ salaryMonths: v })}
          min={12} max={24} step={0.5} decimals={1} suffix="薪"
          hint="超出 12 的部分按全年一次性奖金计税" />
        <SliderField label="每月餐补" value={input.income.mealAllowance} onChange={(v) => setIncome({ mealAllowance: v })}
          min={0} max={5000} step={50} suffix="元" hint="按可自由支配的现金处理" />
        <SliderField label="年涨薪率" value={input.income.annualGrowthRate} onChange={(v) => setIncome({ annualGrowthRate: v })}
          min={0} max={0.3} step={0.005} scale={100} decimals={1} suffix="%"
          hint="原型页面假设终身零涨薪，那是长期投影里最大的失真来源之一" />
      </fieldset>

      <fieldset className="group">
        <legend>专项附加扣除</legend>
        <SliderField label="子女教育（人数）" value={input.income.deductions.childrenCount} onChange={(v) => setDeductions({ childrenCount: Math.round(v) })}
          min={0} max={5} step={1} suffix="人" hint="每人每月 2000 元" />
        <SliderField label="3 岁以下婴幼儿（人数）" value={input.income.deductions.infantCount} onChange={(v) => setDeductions({ infantCount: Math.round(v) })}
          min={0} max={5} step={1} suffix="人" hint="每人每月 2000 元" />
        <SelectField label="继续教育" value={input.income.deductions.continuingEducation}
          onChange={(v) => setDeductions({ continuingEducation: v })}
          options={[
            { value: 'none', label: '无' },
            { value: 'degree', label: '学历继续教育（400/月）' },
            { value: 'vocational', label: '职业资格（3600/年）' },
          ]} />
        <SelectField label="住房" value={input.income.deductions.housingType}
          onChange={(v) => setDeductions({ housingType: v })}
          options={[
            { value: 'none', label: '无' },
            { value: 'rent', label: '住房租金' },
            { value: 'loan', label: '住房贷款利息（1000/月）' },
          ]}
          hint="租金与贷款利息不能同时享受" />
        {input.income.deductions.housingType === 'rent' && (
          <SelectField label="租金扣除档位" value={input.income.deductions.rentTier ?? city.rentTier}
            onChange={(v) => setDeductions({ rentTier: v })}
            options={[
              { value: 'tier1', label: '直辖市/省会/计划单列市（1500）' },
              { value: 'tier2', label: '市区户籍人口>100万（1100）' },
              { value: 'tier3', label: '其余城市（800）' },
            ]} />
        )}
        <SelectField label="赡养老人" value={input.income.deductions.elderlyCare}
          onChange={(v) => setDeductions({ elderlyCare: v })}
          options={[
            { value: 'none', label: '无' },
            { value: 'only-child', label: '独生子女（3000/月）' },
            { value: 'shared', label: '非独生子女分摊' },
          ]} />
        {input.income.deductions.elderlyCare === 'shared' && (
          <SliderField label="每月分摊金额" value={input.income.deductions.elderlyShareAmount ?? 1500}
            onChange={(v) => setDeductions({ elderlyShareAmount: v })}
            min={0} max={1500} step={100} suffix="元" hint="法定上限 1500 元/月" />
        )}
      </fieldset>

      <fieldset className="group">
        <legend>支出</legend>
        <SliderField label="每月生活费" value={input.expense.monthlySpend} onChange={(v) => setExpense({ monthlySpend: v })}
          min={1000} max={100000} step={100} suffix="元" />
        <SliderField label="开销年增长率" value={input.expense.annualGrowthRate} onChange={(v) => setExpense({ annualGrowthRate: v })}
          min={0} max={0.15} step={0.005} scale={100} decimals={1} suffix="%" />
      </fieldset>

      <fieldset className="group">
        <legend>公积金</legend>
        <SliderField label="每月提取" value={input.housingFund.monthlyWithdrawal} onChange={(v) => setHF({ monthlyWithdrawal: v })}
          min={0} max={20000} step={100} suffix="元"
          hint="须符合当地提取政策；账户余额不足时模型会自动下调" />
        <SliderField label="账户结息年利率" value={input.housingFund.annualInterestRate} onChange={(v) => setHF({ annualInterestRate: v })}
          min={0} max={0.05} step={0.001} scale={100} decimals={2} suffix="%" hint="现行为 1.5%" />
        <CheckboxField label="提取出的公积金也投入市场" checked={input.housingFund.investWithdrawal}
          onChange={(v) => setHF({ investWithdrawal: v })} />
      </fieldset>

      <fieldset className="group">
        <legend>投资</legend>
        <SliderField label="初始本金" value={input.investment.initialCapital} onChange={(v) => setInv({ initialCapital: v })}
          min={0} max={5000000} step={5000} suffix="元" />
        <SliderField label="投资年限" value={input.investment.years} onChange={(v) => setInv({ years: Math.round(v) })}
          min={1} max={50} step={1} suffix="年" />
        <SliderField label="预期年化收益" value={input.investment.expectedAnnualReturn} onChange={(v) => setInv({ expectedAnnualReturn: v })}
          min={0} max={0.2} step={0.005} scale={100} decimals={1} suffix="%"
          hint="情景假设，不是收益承诺" />
        <SliderField label="年化波动率" value={input.investment.annualVolatility} onChange={(v) => setInv({ annualVolatility: v })}
          min={0} max={0.5} step={0.01} scale={100} decimals={0} suffix="%"
          hint="标普 500 长期约 15–18%。这个值决定扇形区间有多宽。" />
        <SliderField label="基金费率" value={input.investment.feeDragAnnual} onChange={(v) => setInv({ feeDragAnnual: v })}
          min={0} max={0.03} step={0.001} scale={100} decimals={2} suffix="%"
          hint="QDII 通常 0.6–1.5%" />
        <SliderField label="股息率" value={input.investment.dividendYield} onChange={(v) => setInv({ dividendYield: v })}
          min={0} max={0.06} step={0.001} scale={100} decimals={2} suffix="%" />
        <SliderField label="股息预扣税率" value={input.investment.dividendWithholdingTax} onChange={(v) => setInv({ dividendWithholdingTax: v })}
          min={0} max={0.4} step={0.01} scale={100} decimals={0} suffix="%"
          hint="中国投资者持有美股 ETF 通常预扣 10%" />
        <SliderField label="可投金额的投入比例" value={input.investment.investRatio} onChange={(v) => setInv({ investRatio: v })}
          min={0} max={1} step={0.05} scale={100} decimals={0} suffix="%"
          hint="其余留作现金，不参与市场波动" />
      </fieldset>

      <fieldset className="group">
        <legend>通胀</legend>
        <SliderField label="通胀年率" value={input.inflation.annualRate} onChange={(v) => onChange({ ...input, inflation: { annualRate: v } })}
          min={0} max={0.15} step={0.005} scale={100} decimals={1} suffix="%"
          hint="用于把名义金额折算成今天的购买力" />
      </fieldset>
    </section>
  );
}
