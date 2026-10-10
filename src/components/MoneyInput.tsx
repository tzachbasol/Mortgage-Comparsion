import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** Undefined or 0 shows the placeholder. */
  value: number | undefined;
  onChange: (n: number | undefined) => void;
};

/** A shekel amount field that shows thousands separators while typing (400000 → 400,000). */
export default function MoneyInput({ value, onChange, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={value ? value.toLocaleString('en-US') : ''}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '');
        onChange(digits === '' ? undefined : Number(digits));
      }}
    />
  );
}
