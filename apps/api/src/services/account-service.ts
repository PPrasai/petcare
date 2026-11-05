import { DEFAULT_PREFERENCES, preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import type { HouseholdSummary, UnitOfWork } from '../repositories';
import { AppError, invalid } from './app-error';
import type { MembershipDirectory } from './membership-directory';
import type { HouseholdFiles } from './ports';

export interface Me {
  user: { id: string; email: string; name: string; image: string | null };
  preferences: Preferences;
  households: HouseholdSummary[];
  linkedProviders: string[];
  hasPassword: boolean;
}

export interface AccountServiceDeps {
  unitOfWork: UnitOfWork;
  newId: () => string;
  /** Needed to delete the account: stored files and the cached memberships. */
  files?: HouseholdFiles;
  directory?: MembershipDirectory;
}

/** "Parikshit Prasai" -> "Parikshit's pets". */
export function personalHouseholdName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  return `${first || 'My'}'s pets`.slice(0, 100);
}

export function createAccountService(deps: AccountServiceDeps) {
  const { unitOfWork, newId, files, directory } = deps;

  /**
   * On first sign-in the user gets a household named "<first name>'s pets" with them as owner,
   * and a default preferences row. Safe to call again: it does nothing for a user who already
   * belongs to a household.
   */
  async function ensurePersonalHousehold(user: { id: string; name: string }): Promise<void> {
    await unitOfWork.run(async (repos) => {
      if ((await repos.households.countMemberships(user.id)) > 0) return;
      const id = newId();
      await repos.households.insert({
        id,
        name: personalHouseholdName(user.name),
        createdBy: user.id,
      });
      await repos.households.insertMembership({ householdId: id, userId: user.id, role: 'owner' });
      await repos.preferences.save(user.id, DEFAULT_PREFERENCES);
    });
  }

  async function getMe(userId: string): Promise<Me> {
    const repos = unitOfWork.repositories;
    const user = await repos.accounts.findUser(userId);
    if (!user) throw new AppError('unauthenticated', 401);
    await ensurePersonalHousehold(user);
    const [preferences, households, linked] = await Promise.all([
      repos.preferences.get(userId),
      repos.households.listForUser(userId),
      repos.accounts.linkedAccounts(userId),
    ]);
    return {
      user,
      preferences,
      households,
      linkedProviders: linked.providers,
      hasPassword: linked.hasPassword,
    };
  }

  async function savePreferences(userId: string, input: unknown): Promise<Preferences> {
    const preferences = preferencesSchema.parse(input);
    return unitOfWork.repositories.preferences.save(userId, preferences);
  }

  /**
   * Deletes the account and what only the user owns (AS 4.8). Blocked with 409 `soleOwner` while
   * they are the only owner of a household that has other members. Households where they are the
   * only member are deleted with their records and files. In shared households their records stay,
   * with the id shown as "Former member".
   */
  async function deleteAccount(userId: string, input: unknown): Promise<void> {
    const confirm = (input as { confirm?: unknown } | null)?.confirm;
    if (confirm !== 'DELETE MY ACCOUNT') {
      throw invalid('confirm must be "DELETE MY ACCOUNT"', '/confirm');
    }
    const removed = await unitOfWork.run(async (repos) => {
      const gone: string[] = [];
      for (const { householdId, role } of await repos.households.membershipsOf(userId)) {
        const members = await repos.households.listMembers(householdId);
        const others = members.filter((m) => m.userId !== userId);
        if (others.length === 0) {
          await repos.households.delete(householdId);
          gone.push(householdId);
        } else if (role === 'owner' && !others.some((m) => m.role === 'owner')) {
          throw new AppError('soleOwner', 409, 'transfer ownership or remove the members first');
        } else {
          await repos.households.removeMember(householdId, userId);
        }
      }
      await repos.accounts.deleteUser(userId);
      return gone;
    });
    for (const householdId of removed) await files?.removeAll(householdId);
    await directory?.invalidate(userId);
  }

  return { ensurePersonalHousehold, getMe, savePreferences, deleteAccount };
}
export type AccountService = ReturnType<typeof createAccountService>;
