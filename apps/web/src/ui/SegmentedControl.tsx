import type { KeyboardEvent } from 'react';

interface SegmentedControlProps {
  /** The group's accessible name, for example "Period". */
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

/** A row of mutually exclusive buttons. Arrow keys move focus within the group (SPEC-petcare-003). */
export function SegmentedControl({ label, options, value, onChange }: SegmentedControlProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
    event.preventDefault();
  };
  return (
    // The group handles the arrow keys for the buttons inside it; it is not itself interactive.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="seg" role="group" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
