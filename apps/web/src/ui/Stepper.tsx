/** A big number with minus and plus buttons. */
export function Stepper({
  value,
  label,
  lowerLabel,
  raiseLabel,
  onLower,
  onRaise,
}: {
  value: string;
  label: string;
  lowerLabel: string;
  raiseLabel: string;
  onLower: () => void;
  onRaise: () => void;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={onLower} aria-label={lowerLabel}>
        −
      </button>
      <b aria-live="polite">{value}</b>
      <button type="button" onClick={onRaise} aria-label={raiseLabel}>
        +
      </button>
    </div>
  );
}
