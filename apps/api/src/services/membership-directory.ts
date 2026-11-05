import type { Role, UnitOfWork } from '../repositories';
import { forbidden, notFound } from './app-error';
import type { KeyValueCache } from './ports';

const TTL_SECONDS = 300;
type Memberships = Record<string, Role>;

/**
 * Who belongs to which household, with which role. Cached per user for 5 minutes
 * (`mem:<userId>`) and invalidated whenever a membership changes. Every cache failure falls
 * back to Postgres (QA-11).
 */
export function createMembershipDirectory(deps: { unitOfWork: UnitOfWork; cache: KeyValueCache }) {
  const { unitOfWork, cache } = deps;
  const key = (userId: string) => `mem:${userId}`;

  async function load(userId: string): Promise<Memberships> {
    const cached = await cache.get(key(userId));
    if (cached) {
      try {
        return JSON.parse(cached) as Memberships;
      } catch {
        // fall through to the database
      }
    }
    const rows = await unitOfWork.repositories.households.membershipsOf(userId);
    const memberships: Memberships = Object.fromEntries(rows.map((r) => [r.householdId, r.role]));
    await cache.set(key(userId), JSON.stringify(memberships), TTL_SECONDS);
    return memberships;
  }

  return {
    /** The user's role in the household, or null if they are not a member. */
    async roleOf(userId: string, householdId: string): Promise<Role | null> {
      return (await load(userId))[householdId] ?? null;
    },

    /** Non-members get 404, never 403: existence is not revealed (ADR-06). */
    async requireMember(userId: string, householdId: string): Promise<Role> {
      const role = await this.roleOf(userId, householdId);
      if (!role) throw notFound();
      return role;
    },

    /** Members without one of the roles get 403; non-members get 404. */
    async requireRole(userId: string, householdId: string, allowed: Role[]): Promise<Role> {
      const role = await this.requireMember(userId, householdId);
      if (!allowed.includes(role)) throw forbidden();
      return role;
    },

    async invalidate(...userIds: string[]): Promise<void> {
      await Promise.all(userIds.map((id) => cache.del(key(id))));
    },
  };
}
export type MembershipDirectory = ReturnType<typeof createMembershipDirectory>;
