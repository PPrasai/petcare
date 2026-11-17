/**
 * The screens converted to the desktop layout so far (SPEC-petcare-004 5.8). QA-42 (desktop fit)
 * walks these. The list may only grow: each slice adds its screens, and D5 asserts that it equals
 * every S-id in screens.ts except S-17.
 */
export const DESKTOP_SCOPE: string[] = [
  // D1: shell, sidebar, Home
  'S-05',
  'S-06',
  'S-07',
  'S-08',
  'S-10',
  // D2: pet profile and the Health dashboard
  'S-11',
  'S-12',
  'S-13',
  'S-14',
  'S-15',
  'S-37',
  'S-39',
  'S-40',
  'S-41',
  'S-42',
  'S-43',
  'S-44',
  'S-45',
  'S-48',
  // D3: Expenses, Household and Contacts
  'S-18',
  'S-20',
  'S-21',
  'S-23',
  'S-24',
  'S-49',
];

/** The S-id of a state id such as `S-06 collapsed`. */
export const sId = (id: string): string => id.split(' ')[0] ?? id;

/** Whether a screen state is in the desktop scope. */
export const inDesktopScope = (id: string): boolean => DESKTOP_SCOPE.includes(sId(id));
