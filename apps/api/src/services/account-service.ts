import { DEFAULT_PREFERENCES, preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import type { HouseholdSummary, UnitOfWork } from '../repositories';
import { AppError } from './app-error';

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
}

/** "Parikshit Prasai" -> "Parikshit's pets". */
export function personalHouseholdName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  return `${first || 'My'}'s pets`.slice(0, 100);
}

export function createAccountService(deps: AccountServiceDeps) {
  const { unitOfWork, newId } = deps;

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

  return { ensurePersonalHousehold, getMe, savePreferences };
}
export type AccountService = ReturnType<typeof createAccountService>;
