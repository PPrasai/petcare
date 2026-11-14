import { PUSH_TYPES, isKnownTimeZone, preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AccountError } from '../../application/ports/account-api';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Button, Card, Disclosure, SectionHeader, SelectField, TextField } from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

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
    <Card>
      <SectionHeader title={t('settings.prefs.title')} />
      <form
        className="fstack"
        onSubmit={(e) => void submit(e)}
        aria-label={t('settings.prefs.title')}
      >
        <div className="row2 prefgrid">
          <SelectField
            label={t('settings.prefs.weight')}
            value={draft.weightUnit}
            options={opts([
              ['kg', t('unit.kg')],
              ['lb', t('unit.lb')],
            ])}
            onChange={(e) => set({ weightUnit: e.target.value === 'lb' ? 'lb' : 'kg' })}
          />
          <SelectField
            label={t('settings.prefs.length')}
            value={draft.lengthUnit}
            options={opts([
              ['cm', t('unit.cm')],
              ['in', t('unit.in')],
            ])}
            onChange={(e) => set({ lengthUnit: e.target.value === 'in' ? 'in' : 'cm' })}
          />
        </div>
        <div className="row2 prefgrid">
          <SelectField
            label={t('settings.prefs.temperature')}
            value={draft.temperatureUnit}
            options={opts([
              ['c', t('unit.c')],
              ['f', t('unit.f')],
            ])}
            onChange={(e) => set({ temperatureUnit: e.target.value === 'f' ? 'f' : 'c' })}
          />
          <SelectField
            label={t('settings.prefs.dateFormat')}
            value={draft.dateFormat}
            options={opts([
              ['iso', t('dateFormat.iso')],
              ['dmy', t('dateFormat.dmy')],
              ['mdy', t('dateFormat.mdy')],
            ])}
            onChange={(e) => {
              const v = e.target.value;
              set({ dateFormat: v === 'dmy' || v === 'mdy' ? v : 'iso' });
            }}
          />
        </div>
        <div className="row2 prefgrid">
          <TextField
            label={t('settings.prefs.timeZone')}
            value={draft.timeZone}
            onChange={(e) => set({ timeZone: e.target.value.trim() })}
          />
          <TextField
            label={t('settings.prefs.currency')}
            value={draft.currency}
            maxLength={3}
            onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
          />
        </div>
        <SelectField
          label={t('settings.prefs.theme')}
          value={draft.theme}
          options={opts([
            ['system', t('theme.system')],
            ['light', t('theme.light')],
            ['dark', t('theme.dark')],
          ])}
          onChange={(e) => {
            const v = e.target.value;
            set({ theme: v === 'light' || v === 'dark' ? v : 'system' });
          }}
        />
        <Disclosure title={t('settings.prefs.timing')} hint={t('settings.prefs.timingHint')}>
          <fieldset className="checks">
            <legend>{t('settings.prefs.lead')}</legend>
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
          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={draft.pushEnabled}
                onChange={(e) => set({ pushEnabled: e.target.checked })}
              />
              {t('settings.prefs.pushEnabled')}
            </label>
          </div>
          <fieldset className="checks">
            <legend>{t('settings.prefs.pushTypes')}</legend>
            {PUSH_TYPES.map((type) => (
              <label key={type}>
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
        </Disclosure>
        <Button type="submit" disabled={busy || demo}>
          {t('settings.prefs.save')}
        </Button>
        {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      </form>
    </Card>
  );
}
