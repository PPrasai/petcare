import { Fragment, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { WIDE_QUERY } from './use-wide-screen';

/** The widths of the content column where the panel grid changes its number of columns. */
const MID_FROM = 600;
const WIDE_FROM = 960;

type Tier = 'flat' | 'mid' | 'wide';

/** The width of the content column (the `content` container of the desktop shell), 0 when unknown. */
function contentWidth(): number {
  const main = document.querySelector('.app[data-sidebar] .main');
  if (!(main instanceof HTMLElement)) return 0;
  const style = getComputedStyle(main);
  return main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

function tierNow(): Tier {
  if (!window.matchMedia(WIDE_QUERY).matches) return 'flat';
  const w = contentWidth();
  return w >= WIDE_FROM ? 'wide' : w >= MID_FROM ? 'mid' : 'flat';
}

function subscribe(notify: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', notify);
  const main = document.querySelector('.app[data-sidebar] .main');
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(notify);
  if (main && observer) observer.observe(main);
  return () => {
    query.removeEventListener('change', notify);
    observer?.disconnect();
  };
}

/** A column of the plan: its share of the width, then the panels in it from top to bottom. */
export type FlowColumn = [number, ...string[]];

export interface FlowPlan {
  /** From 960 px of content. */
  wide: FlowColumn[];
  /** From 600 to 959 px of content. */
  mid: FlowColumn[];
}

/**
 * A panel grid whose columns stack their panels on their own (SPEC-petcare-004 5.5, amended): a
 * short panel is never held apart from the one under it by a taller neighbour. From 860 px the
 * panels go into the columns of the plan for the width, in reading order (column by column, so
 * the keyboard follows the eye); under 600 px of content, and on a phone, the `children` are
 * rendered as they are, which keeps the phone's structure as it was.
 */
export function Flow({
  layout,
  panels,
  plan,
  children,
}: {
  layout: string | undefined;
  panels: Record<string, ReactNode>;
  plan: FlowPlan;
  children: ReactNode;
}) {
  const tier = useSyncExternalStore(subscribe, tierNow, () => 'flat' as Tier);
  if (tier === 'flat' || !layout) {
    return (
      <div className="two" data-layout={layout}>
        {children}
      </div>
    );
  }
  const columns = plan[tier]
    .map(([share, ...keys]) => ({
      share,
      nodes: keys.filter((key) => panels[key] != null),
      keys,
    }))
    .filter((column) => column.nodes.length > 0);
  return (
    <div
      className="two"
      data-layout={layout}
      data-flow=""
      style={{ gridTemplateColumns: columns.map((c) => `minmax(0, ${c.share}fr)`).join(' ') }}
    >
      {columns.map((column) => (
        <div className="col" key={column.keys.join('+')}>
          {column.nodes.map((key) => (
            <Fragment key={key}>{panels[key]}</Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
