import type { ReactNode } from 'react';

export type Tone = 'overdue' | 'today' | 'soon' | 'ok';

/** A small status label tinted by its tone. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
