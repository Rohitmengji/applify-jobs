import type { InputHTMLAttributes, ReactNode } from 'react';
import type { Profile } from '@/core/profile.schema';

export interface SectionProps {
  draft: Profile;
  // Function-only updater so App can keep the `Profile | null` loading state to itself.
  setDraft: (updater: (prev: Profile) => Profile) => void;
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        {description && <p className="text-sm text-slate-400">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

type TextProps = { value: string; onChange: (v: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>;

export function TextInput({ value, onChange, ...rest }: TextProps) {
  return (
    <input
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      className={inputCls}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
      : variant === 'danger'
        ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
        : 'border border-slate-600 text-slate-300 hover:bg-slate-700';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

// Card wrapper for one row of a repeatable list (experience / education / answers).
export function RowCard({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="relative space-y-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <button
        onClick={onRemove}
        className="absolute right-2 top-2 text-xs text-slate-500 hover:text-red-400"
        title="Remove"
      >
        ✕
      </button>
      {children}
    </div>
  );
}
