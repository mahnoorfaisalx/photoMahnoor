import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-head" onClick={() => setOpen(!open)}>
        <span className={'caret' + (open ? ' open' : '')}>▸</span>
        <span className="section-title">{title}</span>
        <span className="section-right" onClick={(e) => e.stopPropagation()}>
          {right}
        </span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="row">
      {label && <label className="row-label">{label}</label>}
      <div className="row-ctl">{children}</div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  suffix,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  suffix?: string;
  testId?: string;
}) {
  return (
    <div className="slider">
      <div className="slider-top">
        <span>{label}</span>
        <input
          type="number"
          className="num small"
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(v);
            onCommit?.(v);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onDoubleClick={() => {
          const d = min < 0 ? 0 : min;
          onChange(d);
          onCommit?.(d);
        }}
      />
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  width,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  width?: number;
  testId?: string;
}) {
  const [txt, setTxt] = useState(String(round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(String(round(value)));
  }, [value]);
  const commit = () => {
    const v = Number(txt);
    if (Number.isFinite(v)) onChange(clamp(v, min, max));
    else setTxt(String(round(value)));
  };
  return (
    <span className="numwrap" style={width ? { width } : undefined}>
      {label && <span className="numlabel">{label}</span>}
      <input
        className="num"
        data-testid={testId}
        type="number"
        value={txt}
        step={step}
        min={min}
        max={max}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </span>
  );
}

function round(v: number) {
  return Math.round((v ?? 0) * 100) / 100;
}
function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

export function toHex(c: unknown): string {
  if (typeof c !== 'string' || !c) return '#000000';
  if (c.startsWith('#')) {
    if (c.length === 4) return '#' + c.slice(1).split('').map((x) => x + x).join('');
    return c.slice(0, 7);
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}

export function ColorInput({ value, onChange, testId, title }: { value: string; onChange: (v: string) => void; testId?: string; title?: string }) {
  const hex = toHex(value);
  const [txt, setTxt] = useState(hex);
  useEffect(() => setTxt(hex), [hex]);
  return (
    <span className="color" title={title}>
      <input type="color" data-testid={testId} value={hex} onChange={(e) => onChange(e.target.value)} />
      <input
        className="hex"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => /^#[0-9a-f]{6}$/i.test(txt) && onChange(txt)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(txt)) onChange(txt);
        }}
      />
    </span>
  );
}

export const SWATCHES = ['#000000', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#8e8e93'];

export function Swatches({ onPick }: { onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {SWATCHES.map((c) => (
        <button key={c} className="swatch" style={{ background: c }} title={c} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
