import { DEMO_SEED } from '@petcare/domain';
import { HouseholdError } from '../../application/ports/household-api';
import type {
  CreatedInvite,
  HouseholdApi,
  InviteInfo,
  InviteRole,
  MemberInfo,
} from '../../application/ports/household-api';
import { DEMO_USER_ID } from './demo-data';

/** Where the demo keeps its people and invites: a small setting in the demo database. */
export const DEMO_HOUSEHOLD_KEY = 'demoHousehold';

interface DemoHouseholdState {
  members: MemberInfo[];
  invites: InviteInfo[];
}

export interface DemoHouseholdDeps {
  read(): Promise<string | undefined>;
  write(value: string): Promise<void>;
  /** Renames the household row of the demo database. */
  rename(householdId: string, name: string): Promise<void>;
  now(): Date;
  /** A fresh unguessable-looking id for an invite. */
  id(): string;
  /** The address the demo is served from, for the (unusable) demo invite link. */
  origin(): string;
}

const DAY_MS = 86_400_000;
const INVITE_DAYS = 7;

/** The people the demo starts with: the demo user as owner, then the seed's other members. */
function seedState(): DemoHouseholdState {
  return {
    members: DEMO_SEED.members.map((m, i) => ({
      userId: m.role === 'owner' ? DEMO_USER_ID : `demo-member-${i}`,
      name: m.name,
      role: m.role,
      joinedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    })),
    invites: [],
  };
}

/**
 * The household, member and invite actions answered from this device, for the demo. Nothing goes
 * over the network and nothing is real: an invite made here cannot be used by anyone, and joining
 * or leaving a household needs an account.
 */
export function createDemoHousehold(deps: DemoHouseholdDeps): HouseholdApi {
  async function load(): Promise<DemoHouseholdState> {
    const stored = await deps.read();
    if (stored) {
      try {
        return JSON.parse(stored) as DemoHouseholdState;
      } catch {
        // A damaged copy starts again from the sample people.
      }
    }
    return seedState();
  }
  const save = (state: DemoHouseholdState) => deps.write(JSON.stringify(state));
  const refuse = () => Promise.reject(new HouseholdError('forbidden'));

  return {
    async members() {
      return (await load()).members;
    },
    async changeRole(_householdId, userId, role) {
      const state = await load();
      const member = state.members.find((m) => m.userId === userId);
      if (!member || member.role === 'owner') throw new HouseholdError('notFound');
      member.role = role;
      await save(state);
    },
    async removeMember(_householdId, userId) {
      const state = await load();
      const member = state.members.find((m) => m.userId === userId);
      if (!member) throw new HouseholdError('notFound');
      if (member.role === 'owner') throw new HouseholdError('lastOwner');
      state.members = state.members.filter((m) => m.userId !== userId);
      await save(state);
    },
    async rename(householdId, name) {
      await deps.rename(householdId, name);
    },
    async invites() {
      return (await load()).invites;
    },
    async createInvite(_householdId, role: InviteRole): Promise<CreatedInvite> {
      const state = await load();
      const now = deps.now();
      const secret = deps.id();
      const invite: CreatedInvite = {
        id: deps.id(),
        role,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY_MS).toISOString(),
        status: 'open',
        link: `${deps.origin()}/join#demo-${secret}`,
        code: `DEMO-${secret.slice(0, 6).toUpperCase()}`,
      };
      // The link and the code are shown once; only the plain invite is kept.
      state.invites.push({
        id: invite.id,
        role: invite.role,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        status: 'open',
      });
      await save(state);
      return invite;
    },
    async revokeInvite(_householdId, inviteId) {
      const state = await load();
      const invite = state.invites.find((i) => i.id === inviteId);
      if (!invite) throw new HouseholdError('notFound');
      invite.status = 'revoked';
      await save(state);
    },
    // Joining, leaving and handing over ownership need real accounts.
    leave: refuse,
    transferOwnership: refuse,
    previewInvite: refuse,
    acceptInvite: refuse,
    resolveConflict: refuse,
  };
}
