import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DEMO_SEED } from '@petcare/domain';
import type { CreatedInvite } from '../../application/ports/household-api';
import { t } from '../../i18n/t';
import { activeHousehold, useSessionStore } from '../../state/session';
import {
  Banner,
  Button,
  Card,
  Dialog,
  Line,
  PageHeader,
  SectionHeader,
  SelectField,
  Sheet,
  SheetHead,
  TextField,
} from '../../ui';
import { useDemo } from '../shared/demo';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { InviteSheet, NewInviteCard, OpenInvitesCard } from './InvitesPanel';
import { MembersPanel, PeopleLines } from './MembersPanel';
import { useHouseholdAction } from './useHouseholdAction';

function RenameForm({
  householdId,
  name,
  onClose,
}: {
  householdId: string;
  name: string;
  onClose: () => void;
}) {
  const { households } = useServices();
  const showToast = useToastStore((s) => s.show);
  const { run, error, busy } = useHouseholdAction();
  const [value, setValue] = useState(name);
  return (
    <>
      <SheetHead title={t('household.rename')} onClose={onClose} />
      <form
        aria-label={t('household.rename')}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() === '') return;
          void run(async () => {
            await households.rename(householdId, value);
            showToast(t('household.renamed'));
            onClose();
          });
        }}
      >
        {error ? <Banner tone="warn">{error}</Banner> : null}
        <TextField
          label={t('household.newName')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {t('household.save')}
        </Button>
      </form>
    </>
  );
}

function LeaveDialog({
  householdId,
  name,
  open,
  onClose,
}: {
  householdId: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const { households } = useServices();
  const { run, error, busy } = useHouseholdAction();
  const leave = async () => {
    const left = await run(async () => {
      await households.leave(householdId);
      return true;
    });
    if (left) onClose();
  };
  return (
    <Dialog open={open} title={t('household.leaveConfirmTitle')} onClose={onClose}>
      <p>{t('household.leaveConfirmBody', { name })}</p>
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <div className="acts">
        <Button variant="danger" disabled={busy} onClick={() => void leave()}>
          {t('household.leaveConfirm')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('household.cancel')}
        </Button>
      </div>
    </Dialog>
  );
}

/** The household: name, who is in it, invites, switching and leaving (CAP-11). */
export function HouseholdPage() {
  const { households, pets } = useServices();
  const all = useSessionStore((s) => s.households);
  const current = useSessionStore(activeHousehold);
  const setActive = useSessionStore((s) => s.setActiveHousehold);
  const demo = useDemo();
  const [renaming, setRenaming] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveSerial, setLeaveSerial] = useState(0);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const householdId = current?.id ?? '';
  const members = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => households.members(householdId),
    enabled: householdId !== '' && !demo,
    retry: false,
  });
  const petList = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });

  if (!current) return null;
  const isOwner = current.role === 'owner' && !demo;
  const peopleCount = demo ? DEMO_SEED.members.length : members.data?.length;
  const petCount = (petList.data ?? []).filter((p) => !p.data.archivedAt).length;
  const lede =
    peopleCount === undefined
      ? current.name
      : t('household.lede', {
          name: current.name,
          people:
            peopleCount === 1
              ? t('household.peopleCount.one')
              : t('household.peopleCount.many', { count: peopleCount }),
          pets:
            petCount === 1
              ? t('household.petCount.one')
              : t('household.petCount.many', { count: petCount }),
        });

  const switcher = !demo && all.length > 1;
  const showActions = switcher || isOwner;
  return (
    <>
      <PageHeader
        title={t('household.title')}
        lede={lede}
        {...(showActions
          ? {
              actions: (
                <>
                  {switcher ? (
                    <SelectField
                      label={t('household.switch')}
                      value={current.id}
                      options={all.map((h) => ({ value: h.id, label: h.name }))}
                      onChange={(e) => setActive(e.target.value)}
                    />
                  ) : null}
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        className="linkbtn"
                        aria-label={t('household.rename')}
                        onClick={() => setRenaming(true)}
                      >
                        {t('household.renameShort')}
                      </button>
                      <Sheet
                        open={renaming}
                        label={t('household.rename')}
                        onClose={() => setRenaming(false)}
                      >
                        <RenameForm
                          householdId={current.id}
                          name={current.name}
                          onClose={() => setRenaming(false)}
                        />
                      </Sheet>
                    </>
                  ) : null}
                </>
              ),
            }
          : {})}
      />
      {demo ? (
        <div className="two">
          <div className="stack">
            <Card>
              <SectionHeader title={t('household.people')} />
              <Banner>{t('demo.householdDisabled')}</Banner>
              <ul>
                <PeopleLines
                  members={DEMO_SEED.members.map((m) => ({
                    userId: m.name,
                    name: m.name,
                    role: m.role,
                  }))}
                  me=""
                />
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <div className="two">
          <div className="stack">
            <MembersPanel
              householdId={current.id}
              isOwner={isOwner}
              members={members}
              onInvite={() => setInviting(true)}
            >
              {isOwner ? (
                <InviteSheet
                  householdId={current.id}
                  open={inviting}
                  onClose={() => setInviting(false)}
                  onCreated={setCreated}
                />
              ) : null}
            </MembersPanel>
            {isOwner ? <OpenInvitesCard householdId={current.id} /> : null}
          </div>
          <div className="stack">
            {created ? <NewInviteCard invite={created} onHide={() => setCreated(null)} /> : null}
            <Card>
              <SectionHeader title={t('household.joinTitle')} />
              <p className="muted">{t('household.joinBody')}</p>
              <div className="acts">
                <Link to="/join" className="btn">
                  {t('household.joinLink')}
                </Link>
              </div>
              <ul>
                <Line
                  title={
                    <Link to="/contacts" className="linkbtn">
                      {t('contacts.title')}
                    </Link>
                  }
                  sub={t('more.contactsHint')}
                />
              </ul>
            </Card>
            <Card className="danger-zone">
              <Line
                as="div"
                title={t('household.leave')}
                sub={t('household.leaveBody')}
                actions={
                  <Button
                    variant="danger"
                    onClick={() => {
                      setLeaveSerial((n) => n + 1);
                      setLeaving(true);
                    }}
                  >
                    {t('household.leave')}
                  </Button>
                }
              />
              <LeaveDialog
                key={leaveSerial}
                householdId={current.id}
                name={current.name}
                open={leaving}
                onClose={() => setLeaving(false)}
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
