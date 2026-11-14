interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name. */
  label: string;
  describedBy?: string;
  disabled?: boolean;
  /** True while the change is still being made; the switch announces it. */
  busy?: boolean;
}

/** An on/off control (role switch). Space and Enter toggle it, as for any native button. */
export function Switch({ checked, onChange, label, describedBy, disabled, busy }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className="sw"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={busy ? true : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
