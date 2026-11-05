import type { ReactNode } from 'react';

/** A titled page body, used by the top-level routes that later slices fill in. */
export function SimplePage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
