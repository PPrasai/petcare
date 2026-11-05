import { en } from './en';
import type { MessageKey } from './en';

/** Looks up a message and fills `{name}` placeholders. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
