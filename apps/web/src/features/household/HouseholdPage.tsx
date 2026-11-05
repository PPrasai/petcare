import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { t } from '../../i18n/t';
import { activeHousehold, useSessionStore } from '../../state/session';
import { Banner, Button, Dialog, SelectField, TextField } from '../../ui';
import { DEMO_SEED } from '@petcare/domain';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';
import { InvitesPanel } from './InvitesPanel';
import { MembersPanel } from './MembersPanel';
import { useHouseholdAction } from './useHouseholdAction';

/** The household: name, who is in it, invites, switching and leaving (CAP-11). */
export function HouseholdPage() {
  const { households } = useServices();
  const all = useSessionStore((s) => s.households);
  const current = useSessionStore(activeHousehold);
  const setActive = useSessionStore((s) => s.setActiveHousehold);
  const { run, error, busy } = useHouseholdAction();
  const [name, setName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const demo = useDemo();

  if (!current) return null;
  if (demo) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('household.title')}</h1>
        <p>{t('household.current', { name: current.name })}</p>
        <Banner>{t('demo.householdDisabled')}</Banner>
        <ul className="flex flex-col gap-2">
          {DEMO_SEED.members.map((m) => (
            <li key={m.name} className="rounded-lg border border-line bg-card p-3">
              {m.name} · {t(`household.role.${m.role}`)}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const isOwner = current.role === 'owner';
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('household.title')}</h1>
      {all.length > 1 ? (
        <SelectField
          label={t('household.switch')}
          value={current.id}
          options={all.map((h) => ({ value: h.id, label: h.name }))}
          onChange={(e) => setActive(e.target.value)}
        />
      ) : null}
      <p>{t('household.current', { name: current.name })}</p>
      {error ? <Banner tone="warn">{error}</Banner> : null}

      {isOwner ? (
        <form
          aria-label={t('household.rename')}
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() === '') return;
            void run(async () => {
              await households.rename(current.id, name);
              setName('');
            });
          }}
        >
          <TextField
            label={t('household.newName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {t('household.rename')}
          </Button>
        </form>
      ) : null}

      <MembersPanel householdId={current.id} isOwner={isOwner} />
      {isOwner ? <InvitesPanel householdId={current.id} /> : null}

      <section className="flex flex-col gap-2" aria-labelledby="join-title">
        <h2 id="join-title" className="text-xl font-semibold">
          {t('household.joinTitle')}
        </h2>
        <Link to="/join" className="underline">
          {t('household.joinLink')}
        </Link>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="leave-title">
        <h2 id="leave-title" className="text-xl font-semibold">
          {t('household.leaveTitle')}
        </h2>
        <Button variant="danger" className="self-start" onClick={() => setConfirmLeave(true)}>
          {t('household.leave')}
        </Button>
      </section>
      <Dialog
        open={confirmLeave}
        title={t('household.leaveConfirmTitle')}
        onClose={() => setConfirmLeave(false)}
      >
        <p className="mb-3">{t('household.leaveConfirmBody', { name: current.name })}</p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() =>
              void run(async () => {
                await households.leave(current.id);
                setConfirmLeave(false);
              }).then(() => setConfirmLeave(false))
            }
          >
            {t('household.leaveConfirm')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
            {t('household.cancel')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
