import type { ReactNode } from 'react';

interface ToggleRowProps {
  title: string;
  hint: string;
  /** Prefix for the ids that tie the switch to its title and hint. */
  id: string;
  /** The `Switch`, which should use `describedBy={`${id}-h`}`. */
  control: ReactNode;
  /** A live line under the row: the state, or the result of the last action. */
  status?: ReactNode;
}

/** A setting with a title, a hint and a switch, and an optional status line below. */
export function ToggleRow({ title, hint, id, control, status }: ToggleRowProps) {
  return (
    <div className="togwrap">
      <div className="tog">
        <div className="l">
          <b id={`${id}-t`}>{title}</b>
          <span id={`${id}-h`}>{hint}</span>
        </div>
        {control}
      </div>
      {status}
    </div>
  );
}
