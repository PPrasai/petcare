/**
 * The desktop panel grids of SPEC-petcare-004 5.5: how many column tracks each `data-layout` has in
 * the wide (content >= 960 px) and mid (600 to 959 px) tiers. The narrow tier (< 600 px) is always
 * one track. QA-40 rule 4 and QA-43 read this table, so a template change shows up here and in the
 * spec together.
 */
export const DESKTOP_LAYOUTS: Record<string, { wide: number; mid: number }> = {
  home: { wide: 3, mid: 2 },
  overview: { wide: 3, mid: 2 },
  care: { wide: 3, mid: 2 },
  health: { wide: 4, mid: 3 },
  files: { wide: 2, mid: 2 },
  expenses: { wide: 2, mid: 2 },
  household: { wide: 3, mid: 2 },
  contacts: { wide: 2, mid: 2 },
  settings: { wide: 3, mid: 2 },
  sync: { wide: 2, mid: 2 },
  emergency: { wide: 3, mid: 2 },
  wizard: { wide: 2, mid: 2 },
  auth: { wide: 2, mid: 2 },
  public: { wide: 3, mid: 2 },
  single: { wide: 1, mid: 1 },
};

export type Tier = 'wide' | 'mid' | 'narrow';

/** The tier of a content container of this inline size (its content box, in px). */
export const tierOf = (contentWidth: number): Tier =>
  contentWidth >= 960 ? 'wide' : contentWidth >= 600 ? 'mid' : 'narrow';

/** The column tracks a layout has at a content width. */
export const expectedTracks = (layout: string, contentWidth: number): number => {
  const tier = tierOf(contentWidth);
  const entry = DESKTOP_LAYOUTS[layout];
  return tier === 'narrow' || !entry ? 1 : entry[tier];
};
