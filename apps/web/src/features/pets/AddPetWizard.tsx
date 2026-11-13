import { useNavigate, useSearch } from '@tanstack/react-router';
import { careSuggestions } from '@petcare/domain';
import type { CareSuggestion } from '@petcare/domain';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { PhotoUnusable } from '../../application/ports/image-reducer';
import {
  WIZARD_SLICE,
  WIZARD_SPECIES,
  emptyWizard,
  initialChoices,
  reminderFromSuggestion,
  wizardToPetForm,
} from '../../application/pet-wizard';
import type { SuggestionChoice, WizardValues } from '../../application/pet-wizard';
import type { MessageKey } from '../../i18n/en';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Avatar, Button, Card, Chip, Icon, SegmentedControl, Switch, TextField } from '../../ui';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToday } from '../health/hooks';
import { useFocusInvalid } from '../shared/use-focus-invalid';
import { useToastStore } from '../shared/toast';

export type WizardStep = 1 | 2 | 3;

const SEXES = [
  ['female', 'wizard.sex.female'],
  ['male', 'wizard.sex.male'],
  ['unknown', 'wizard.sex.unknown'],
] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const NOUN = {
  dog: 'wizard.species.dogNoun',
  cat: 'wizard.species.catNoun',
  other: 'wizard.species.otherNoun',
} as const;
const PET_ID_PREVIEW = 'new';

function scheduleText(s: CareSuggestion, choice: SuggestionChoice): string {
  if (s.kind === 'weekly') {
    return t('wizard.sched.weekly', {
      day: t(`schedule.day.${choice.day}` as MessageKey),
      time: choice.time,
    });
  }
  return t(s.kind === 'monthly' ? 'wizard.sched.monthly' : 'wizard.sched.daily', {
    time: choice.time,
  });
}

/** One suggested reminder: a switch, a summary of when, and a "Change" disclosure for time and day. */
function SuggestionRow({
  suggestion,
  choice,
  onChange,
}: {
  suggestion: CareSuggestion;
  choice: SuggestionChoice;
  onChange: (next: SuggestionChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const title = t(`wizard.sug.${suggestion.id}` as MessageKey);
  return (
    <div className="sugrow">
      <div className="tog">
        <div className="l">
          <b>{title}</b>
          <button
            type="button"
            className="wizsched"
            aria-expanded={open}
            aria-controls={`${id}-edit`}
            aria-label={t('wizard.sched.changeLabel', { title })}
            onClick={() => setOpen(!open)}
          >
            {scheduleText(suggestion, choice)} ·{' '}
            <u>{t(open ? 'wizard.sched.done' : 'wizard.sched.change')}</u>
          </button>
        </div>
        <Switch checked={choice.on} label={title} onChange={(on) => onChange({ ...choice, on })} />
      </div>
      {open ? (
        <div className="sugedit" id={`${id}-edit`}>
          <TextField
            label={t('wizard.sched.time')}
            type="time"
            value={choice.time}
            onChange={(e) => e.target.value && onChange({ ...choice, time: e.target.value })}
          />
          {suggestion.kind === 'weekly' ? (
            <div className="fld">
              <span className="label">{t('wizard.sched.day')}</span>
              <div className="tags days" role="group" aria-label={t('wizard.sched.day')}>
                {DAYS.map((d) => (
                  <Chip
                    key={d}
                    pressed={choice.day === d}
                    onClick={() => onChange({ ...choice, day: d })}
                  >
                    {t(`schedule.day.${d}` as MessageKey)}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The add-pet wizard (CAP-25): three steps at `/pets/new?step=1..3`. Only the name is required, and
 * "Save pet" is there on every step. The suggestions are all unticked (PO-petcare-002 Q-10) and
 * limited to the shapes that exist before slice P6.
 */
export function AddPetWizard() {
  const search = useSearch({ strict: false }) as { step?: number };
  const step: WizardStep = search.step === 2 || search.step === 3 ? search.step : 1;
  const { pets, photos, health } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const [values, setValues] = useState<WizardValues>(emptyWizard);
  const [choices, setChoices] = useState<Record<string, SuggestionChoice>>({});
  const [chosen, setChosen] = useState<{ file: File; url: string } | null>(null);
  const photo = chosen?.file ?? null;
  const preview = chosen?.url ?? null;
  const [nameError, setNameError] = useState('');
  const [failed, setFailed] = useState('');
  const [saving, setSaving] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const stepSeen = useRef(step);
  const today = useToday();
  const errors = useMemo(() => (nameError ? { name: nameError } : {}), [nameError]);
  useFocusInvalid(formRef, errors);

  const set = <K extends keyof WizardValues>(key: K, value: WizardValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const name = values.name.trim();
  const list = useMemo(() => careSuggestions(values.species, WIZARD_SLICE), [values.species]);
  const shown = useMemo(() => ({ ...initialChoices(list), ...choices }), [list, choices]);

  // The step is in the address, so a reload or a shared link can land past step 1 with no name.
  const needsName = step > 1 && name === '';
  useEffect(() => {
    if (needsName) void navigate({ to: '/pets/new', search: { step: 1 }, replace: true });
  }, [needsName, navigate]);
  // Move focus to the heading when the step changes, so a screen reader hears where it is.
  useEffect(() => {
    if (stepSeen.current !== step) title.current?.focus();
    stepSeen.current = step;
  }, [step]);
  // The preview is an object URL; it is released when it is replaced and when the wizard closes.
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const go = (next: WizardStep) => {
    window.scrollTo(0, 0);
    void navigate({ to: '/pets/new', search: { step: next } });
  };
  const requireName = (): boolean => {
    if (name !== '') return true;
    setNameError(t('wizard.name.error'));
    if (step !== 1) go(1);
    return false;
  };
  const next = (event?: FormEvent) => {
    event?.preventDefault();
    if (step === 3) return void save();
    if (requireName()) go((step + 1) as WizardStep);
  };
  const skip = () => {
    if (step === 3) return void save(false);
    if (!requireName()) return;
    // Skipping step 2 leaves its details out.
    setValues((v) => ({
      ...emptyWizard,
      name: v.name,
      species: v.species,
      speciesOther: v.speciesOther,
    }));
    go(3);
  };

  const save = async (withReminders = true) => {
    if (!requireName() || saving) return;
    setSaving(true);
    setFailed('');
    try {
      const now = new Date();
      const pet = await pets.create(householdId, wizardToPetForm(values, today));
      if (withReminders) {
        for (const s of list) {
          const choice = shown[s.id];
          if (!choice?.on) continue;
          await health.add(
            'reminder',
            householdId,
            reminderFromSuggestion(
              s,
              t(`wizard.sug.${s.id}` as MessageKey),
              choice,
              pet.id,
              tz,
              now,
            ),
          );
        }
      }
      if (photo) {
        try {
          await photos.set(householdId, pet.id, photo);
        } catch (e) {
          showToast(t(e instanceof PhotoUnusable ? 'photo.unusable' : 'photo.failed'));
        }
      }
      showToast(t('wizard.saved', { name }));
      await navigate({
        to: '/pets/$petId',
        params: { petId: pet.id },
        search: { tab: 'overview' },
      });
    } catch {
      setFailed(t('wizard.saveFailed', { name }));
      setSaving(false);
    }
  };

  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setChosen({ file, url: previewUrl.current });
  };

  const shownName = name || t('wizard.name');
  const headings: Record<WizardStep, [string, string]> = {
    1: [t('wizard.step1.title'), t('wizard.step1.lede')],
    2: [t('wizard.step2.title'), t('wizard.step2.lede', { name: name || shownName })],
    3: [
      t('wizard.step3.title', { name: name || shownName }),
      t('wizard.step3.lede', { species: t(NOUN[values.species]) }),
    ],
  };
  const [heading, lede] = headings[step];

  return (
    <form ref={formRef} className="wiz" onSubmit={next} noValidate>
      <div className="wizhead">
        <button
          type="button"
          className="xbtn"
          aria-label={t('wizard.cancel')}
          onClick={() => void navigate({ to: '/' })}
        >
          <Icon name="x" />
        </button>
        <span className="label">{t('wizard.stepOf', { n: step })}</span>
        {step > 1 ? (
          <button type="button" className="linkbtn" onClick={() => go((step - 1) as WizardStep)}>
            {t('wizard.back')}
          </button>
        ) : (
          <span className="wizgap" aria-hidden="true" />
        )}
      </div>
      <div
        className="prog"
        role="progressbar"
        aria-label={t('wizard.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <div className="greet">
        <h1 ref={title} tabIndex={-1}>
          {heading}
        </h1>
        <p className="lede">{lede}</p>
      </div>

      {step === 1 ? (
        <>
          <div className="npphoto">
            <Avatar
              petId={PET_ID_PREVIEW}
              species={values.species}
              size={120}
              photoUrl={preview}
              photoAlt=""
              badge={
                <span className="camslot">
                  <button
                    type="button"
                    className="camb"
                    aria-label={t('wizard.photo.choose')}
                    onClick={() => photoInput.current?.click()}
                  >
                    <Icon name="camera" />
                  </button>
                </span>
              }
            />
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              data-testid="wizard-photo-input"
              onChange={pickPhoto}
            />
            <span className="muted">{t(photo ? 'wizard.photo.chosen' : 'wizard.photo.add')}</span>
          </div>
          <TextField
            label={t('wizard.name')}
            autoComplete="off"
            placeholder={t('wizard.name.placeholder')}
            value={values.name}
            error={nameError || undefined}
            onChange={(e) => {
              set('name', e.target.value);
              setNameError('');
            }}
          />
          <div className="fld">
            <span className="label">{t('wizard.species')}</span>
            <div className="tags" role="group" aria-label={t('wizard.species')}>
              {WIZARD_SPECIES.map((s) => (
                <Chip
                  key={s}
                  pressed={values.species === s}
                  onClick={() => {
                    set('species', s);
                    setChoices({});
                  }}
                >
                  {t(s === 'other' ? 'wizard.species.other' : (`pets.species.${s}` as MessageKey))}
                </Chip>
              ))}
            </div>
          </div>
          {values.species === 'other' ? (
            <TextField
              label={t('petForm.speciesOther')}
              autoComplete="off"
              value={values.speciesOther}
              onChange={(e) => set('speciesOther', e.target.value)}
            />
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <TextField
            label={t('wizard.breed')}
            autoComplete="off"
            placeholder={t(
              values.species === 'other'
                ? 'wizard.breed.placeholderOther'
                : 'wizard.breed.placeholder',
            )}
            value={values.breed}
            onChange={(e) => set('breed', e.target.value)}
          />
          <div className="fld">
            <span className="label">{t('wizard.age')}</span>
            <SegmentedControl
              label={t('wizard.age.modeLabel')}
              value={values.ageMode}
              onChange={(v) => set('ageMode', v === 'age' ? 'age' : 'date')}
              options={[
                { value: 'date', label: t('wizard.age.birthday') },
                { value: 'age', label: t('wizard.age.approx') },
              ]}
            />
            {values.ageMode === 'date' ? (
              <input
                type="date"
                max={today}
                aria-label={t('wizard.age.birthday')}
                value={values.birthDate}
                onChange={(e) => set('birthDate', e.target.value)}
              />
            ) : (
              <div className="row2">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="3"
                  aria-label={t('wizard.age.value')}
                  value={values.age}
                  onChange={(e) => set('age', e.target.value)}
                />
                <select
                  aria-label={t('wizard.age.unit')}
                  value={values.ageUnit}
                  onChange={(e) => set('ageUnit', e.target.value === 'months' ? 'months' : 'years')}
                >
                  <option value="years">{t('wizard.age.years')}</option>
                  <option value="months">{t('wizard.age.months')}</option>
                </select>
              </div>
            )}
          </div>
          <div className="fld">
            <span className="label">{t('wizard.sex')}</span>
            <div className="tags" role="group" aria-label={t('wizard.sex')}>
              {SEXES.map(([value, label]) => (
                <Chip
                  key={value}
                  pressed={values.sex === value}
                  onClick={() => set('sex', values.sex === value ? '' : value)}
                >
                  {t(label)}
                </Chip>
              ))}
              <Chip pressed={values.neutered} onClick={() => set('neutered', !values.neutered)}>
                {t('wizard.neutered')}
              </Chip>
            </div>
          </div>
          <TextField
            label={t('wizard.colour')}
            autoComplete="off"
            value={values.colour}
            onChange={(e) => set('colour', e.target.value)}
          />
          <TextField
            label={t('wizard.microchip')}
            autoComplete="off"
            placeholder={t('wizard.microchip.placeholder')}
            value={values.microchipId}
            onChange={(e) => set('microchipId', e.target.value)}
          />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card className="sugs">
            {list.map((s) => (
              <SuggestionRow
                key={s.id}
                suggestion={s}
                choice={shown[s.id] ?? { on: false, time: s.time, day: 7 }}
                onChange={(next) => setChoices({ ...choices, [s.id]: next })}
              />
            ))}
          </Card>
          <p className="muted">{t('wizard.step3.note')}</p>
        </>
      ) : null}

      {failed ? (
        <p className="err" role="alert">
          {failed}
        </p>
      ) : null}
      <div className="wizbar">
        {step > 1 ? (
          <Button variant="secondary" onClick={skip} disabled={saving}>
            {t('wizard.skip')}
          </Button>
        ) : null}
        {step < 3 ? (
          <Button type="submit" variant="secondary" disabled={saving}>
            {t('wizard.continue')}
          </Button>
        ) : null}
        <Button onClick={() => void save()} disabled={saving}>
          {t(saving ? 'wizard.saving' : 'wizard.save')}
        </Button>
      </div>
    </form>
  );
}
