import { useRef } from 'react';

export interface SegmentedOption<T extends string> { value: T; label: string; icon?: React.ReactNode }

/** One accessible two-way switch (radiogroup): roving tabindex, arrow keys, Home/End. */
export function Segmented<T extends string>({ label, value, onChange, options, size = 'family' }: {
  label: string; value: T; onChange: (v: T) => void; options: SegmentedOption<T>[]; size?: 'senior' | 'family';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (to: number) => {
    const i = (to + options.length) % options.length;
    onChange(options[i].value);
    refs.current[i]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); move(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); move(i - 1); break;
      case 'Home': e.preventDefault(); move(0); break;
      case 'End': e.preventDefault(); move(options.length - 1); break;
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className={'seg' + (size === 'senior' ? ' seg-senior' : '')}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked}
            tabIndex={checked ? 0 : -1} onClick={() => onChange(o.value)} onKeyDown={e => onKeyDown(e, i)}>
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}
