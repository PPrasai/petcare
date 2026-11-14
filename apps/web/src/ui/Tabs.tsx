import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
}

export const tabId = (id: string) => `tab-${id}`;
export const panelId = (id: string) => `panel-${id}`;

/**
 * A WAI-ARIA tablist: roving tabindex, arrow keys, Home and End. Swiping is added by the page
 * that owns the panel; the buttons always work on their own.
 */
export function Tabs<Id extends string>({
  tabs,
  value,
  label,
  onChange,
  caption,
}: {
  tabs: TabItem<Id>[];
  value: Id;
  label: string;
  onChange: (id: Id) => void;
  /** Shown above the tabs by the stylesheet when a page collapses its header (PO-002 Q-04). */
  caption?: string;
}) {
  const refs = useRef(new Map<Id, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} data-caption={caption}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tabId(tab.id)}
          aria-selected={tab.id === value}
          aria-controls={panelId(tab.id)}
          tabIndex={tab.id === value ? 0 : -1}
          ref={(node) => {
            if (node) refs.current.set(tab.id, node);
            else refs.current.delete(tab.id);
          }}
          onClick={() => onChange(tab.id)}
          onKeyDown={onKeyDown}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
