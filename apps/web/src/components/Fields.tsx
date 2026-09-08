import { useEffect, useId, useState } from 'react';
import { useI18n } from '../i18n/index.js';

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
  /** 数字输入框展示用的单位后缀，例如 % 或 年 */
  suffix?: string;
  /** 内部值与展示值的换算倍数（比率字段传 100，让用户看到 7 而不是 0.07） */
  scale?: number;
  decimals?: number;
}

/**
 * 滑杆 + 数字输入框的组合。
 *
 * 原型页面只有滑杆，`step=100` 意味着你根本填不进 14650 这种真实工资数。
 * 这里两者并存：滑杆用来找感觉，输入框用来填准确值。
 */
export function SliderField({
  label, value, onChange, min, max, step, hint, suffix = '', scale = 1, decimals = 0,
}: SliderProps) {
  const id = useId();
  const { t } = useI18n();
  const display = value * scale;
  // 输入过程中保留用户的原始文本，否则「1」在输入「14600」的途中就会被夹到 min
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => { setDraft(null); }, [value]);

  const commit = (text: string) => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      onChange(Math.min(Math.max(parsed / scale, min), max));
    }
    setDraft(null);
  };

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span>
          <input
            className="field-input"
            type="number"
            inputMode="decimal"
            aria-label={t('field.exactAria', { label })}
            value={draft ?? display.toFixed(decimals)}
            step={step * scale}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
          />
          {suffix && <span className="muted" style={{ marginLeft: 4 }}>{suffix}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: string;
}

export function SelectField<T extends string>({ label, value, onChange, options, hint }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-head"><label htmlFor={id}>{label}</label></div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} style={{ marginTop: 6 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function CheckboxField({
  label, checked, onChange, hint,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <div className="checkbox">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
