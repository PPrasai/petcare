import { useState } from 'react';
import { HouseholdError } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';

const message: Record<string, MessageKey> = {
  offline: 'household.error.offline',
  forbidden: 'household.error.forbidden',
  notFound: 'household.error.notFound',
  lastOwner: 'household.error.lastOwner',
  rateLimited: 'household.error.rateLimited',
  invalid: 'household.error.invalid',
};

/** Runs a household action and keeps the explanation of a failure for display. */
export function useHouseholdAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    setError(null);
    setBusy(true);
    try {
      return await action();
    } catch (e) {
      if (!(e instanceof HouseholdError)) throw e;
      setError(t(message[e.kind] ?? 'household.error.other'));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}
