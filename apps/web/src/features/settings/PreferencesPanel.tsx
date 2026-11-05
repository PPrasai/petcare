import { PUSH_TYPES, isKnownTimeZone, preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AccountError } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Button, SelectField, TextField } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';

const opts = (keys: string[], prefix: string) =>
  keys.map((k) => ({ value: k, label: t(`${prefix}.${k}` as MessageKey) }));

/** Units, time zone, date format, currency, theme and reminder lead times (CAP-19). */
export function PreferencesPanel() {
  const { account } = useServices();
  const demo = useDemo();
  const saved = useSessionStore((s) => s.preferences);
  const [draft, setDraft] = useState<Preferences>(saved);
  const [note, setNote] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Preferences>) => setDraft({ ...draft, ...patch });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNote(null);
    if (!isKnownTimeZone(draft.timeZone) || !preferencesSchema.safeParse(draft).success) {
      setNote({ tone: 'warn', text: t('settings.prefs.invalid') });
      return;
    }
    setBusy(true);
    try {
      await account.savePreferences(draft);
      setNote({ tone: 'info', text: t('settings.prefs.saved') });
    } catch (error) {
      const offline = error instanceof AccountError && error.kind === 'offline';
      setNote({ tone: 'warn', text: t(offline ? 'settings.offline' : 'settings.prefs.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="prefs-title" className="flex flex-col gap-3">
      <h2 id="prefs-title" className="text-xl font-semibold">
        {t('settings.prefs.title')}
      </h2>
      {demo ? <Banner tone="info">{t('settings.demo')}</Banner> : null}
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <SelectField
          label={t('settings.prefs.weight')}
          value={draft.weightUnit}
          options={opts(['kg', 'lb'], 'unit')}
          onChange={(e) => set({ weightUnit: e.target.value === 'lb' ? 'lb' : 'kg' })}
        />
        <SelectField
          label={t('settings.prefs.length')}
          value={draft.lengthUnit}
          options={opts(['cm', 'in'], 'unit')}
          onChange={(e) => set({ lengthUnit: e.target.value === 'in' ? 'in' : 'cm' })}
        />
        <SelectField
          label={t('settings.prefs.temperature')}
          value={draft.temperatureUnit}
          options={opts(['c', 'f'], 'unit')}
          onChange={(e) => set({ temperatureUnit: e.target.value === 'f' ? 'f' : 'c' })}
        />
        <TextField
          label={t('settings.prefs.timeZone')}
          value={draft.timeZone}
          onChange={(e) => set({ timeZone: e.target.value.trim() })}
        />
        <SelectField
          label={t('settings.prefs.dateFormat')}
          value={draft.dateFormat}
          options={opts(['iso', 'dmy', 'mdy'], 'dateFormat')}
          onChange={(e) => {
            const v = e.target.value;
            set({ dateFormat: v === 'dmy' || v === 'mdy' ? v : 'iso' });
          }}
        />
        <TextField
          label={t('settings.prefs.currency')}
          value={draft.currency}
          maxLength={3}
          onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
        />
        <SelectField
          label={t('settings.prefs.theme')}
          value={draft.theme}
          options={opts(['system', 'light', 'dark'], 'theme')}
          onChange={(e) => {
            const v = e.target.value;
            set({ theme: v === 'light' || v === 'dark' ? v : 'system' });
          }}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('settings.prefs.lead')}</legend>
          {PUSH_TYPES.map((type) => (
            <TextField
              key={type}
              type="number"
              min={0}
              label={t('settings.prefs.leadFor', { type: t(`pushType.${type}` as MessageKey) })}
              value={draft.leadMinutes[type]}
              onChange={(e) =>
                set({ leadMinutes: { ...draft.leadMinutes, [type]: Number(e.target.value) } })
              }
            />
          ))}
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={draft.pushEnabled}
            onChange={(e) => set({ pushEnabled: e.target.checked })}
          />
          {t('settings.prefs.pushEnabled')}
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">{t('settings.prefs.pushTypes')}</legend>
          {PUSH_TYPES.map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={draft.pushTypes.includes(type)}
                onChange={(e) =>
                  set({
                    pushTypes: e.target.checked
                      ? [...draft.pushTypes, type]
                      : draft.pushTypes.filter((p) => p !== type),
                  })
                }
              />
              {t(`pushType.${type}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={busy || demo}>
          {t('settings.prefs.save')}
        </Button>
      </form>
    </section>
  );
}
