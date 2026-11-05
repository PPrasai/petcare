import { z } from 'zod';
import type { HouseholdSummary, Member, UnitOfWork } from '../repositories';
import { AppError, invalid, notFound } from './app-error';
import type { MembershipDirectory } from './membership-directory';
import type { HouseholdFiles } from './ports';

const householdInput = z.strictObject({ name: z.string().trim().min(1).max(100) });
const roleChange = z.strictObject({ role: z.enum(['caretaker', 'viewer']) });
const transferInput = z.strictObject({ userId: z.string().min(1).max(64) });
const deleteInput = z.strictObject({ confirmName: z.string() });

export interface HouseholdServiceDeps {
  unitOfWork: UnitOfWork;
  directory: MembershipDirectory;
  files: HouseholdFiles;
  newId: () => string;
}

export function createHouseholdService(deps: HouseholdServiceDeps) {
  const { unitOfWork, directory, files, newId } = deps;
  const repos = unitOfWork.repositories;

  async function summary(householdId: string, userId: string): Promise<HouseholdSummary> {
    const found = await repos.households.summaryFor(householdId, userId);
    if (!found) throw notFound();
    return found;
  }

  return {
    list(userId: string): Promise<HouseholdSummary[]> {
      return repos.households.listForUser(userId);
    },

    async create(userId: string, input: unknown): Promise<HouseholdSummary> {
      const { name } = householdInput.parse(input);
      const id = newId();
      await unitOfWork.run(async (tx) => {
        await tx.households.insert({ id, name, createdBy: userId });
        await tx.households.insertMembership({ householdId: id, userId, role: 'owner' });
      });
      await directory.invalidate(userId);
      return summary(id, userId);
    },

    async rename(userId: string, householdId: string, input: unknown): Promise<HouseholdSummary> {
      await directory.requireRole(userId, householdId, ['owner']);
      const { name } = householdInput.parse(input);
      await repos.households.rename(householdId, name);
      return summary(householdId, userId);
    },

    /** Owner deletes the household, all its records and files. Needs the exact name typed back. */
    async remove(userId: string, householdId: string, input: unknown): Promise<void> {
      await directory.requireRole(userId, householdId, ['owner']);
      const { confirmName } = deleteInput.parse(input);
      const household = await repos.households.get(householdId);
      if (!household) throw notFound();
      if (confirmName !== household.name)
        throw invalid('does not match the household name', '/confirmName');
      const memberIds = (await repos.households.listMembers(householdId)).map((m) => m.userId);
      await repos.households.delete(householdId);
      await files.removeAll(householdId);
      await directory.invalidate(...memberIds);
    },

    async members(userId: string, householdId: string): Promise<Member[]> {
      await directory.requireMember(userId, householdId);
      return repos.households.listMembers(householdId);
    },

    async changeRole(
      userId: string,
      householdId: string,
      targetId: string,
      input: unknown,
    ): Promise<Member> {
      await directory.requireRole(userId, householdId, ['owner']);
      const { role } = roleChange.parse(input);
      if (targetId === userId) throw invalid('you cannot change your own role', '/userId');
      const target = await repos.households.findMember(householdId, targetId);
      if (!target) throw notFound();
      if (target.role === 'owner') throw invalid('transfer ownership instead', '/userId');
      await repos.households.setRole(householdId, targetId, role);
      await directory.invalidate(targetId);
      return this.memberOf(householdId, targetId);
    },

    async memberOf(householdId: string, userId: string): Promise<Member> {
      const found = (await repos.households.listMembers(householdId)).find(
        (m) => m.userId === userId,
      );
      if (!found) throw notFound();
      return found;
    },

    async removeMember(userId: string, householdId: string, targetId: string): Promise<void> {
      await directory.requireRole(userId, householdId, ['owner']);
      if (targetId === userId) throw new AppError('forbidden', 403, 'use leave to remove yourself');
      if (!(await repos.households.findMember(householdId, targetId))) throw notFound();
      await repos.households.removeMember(householdId, targetId);
      await directory.invalidate(targetId);
    },

    /**
     * Any member may leave. The last owner may not while other members exist (409 lastOwner);
     * a sole member may not either, because leaving would orphan the data: delete the
     * household instead.
     */
    async leave(userId: string, householdId: string): Promise<void> {
      const role = await directory.requireMember(userId, householdId);
      if (role === 'owner') {
        const members = await repos.households.listMembers(householdId);
        const otherOwners = members.filter((m) => m.role === 'owner' && m.userId !== userId);
        if (otherOwners.length === 0) {
          const detail =
            members.length > 1
              ? 'transfer ownership before leaving'
              : 'you are the only member; delete the household instead';
          throw new AppError('lastOwner', 409, detail);
        }
      }
      await repos.households.removeMember(householdId, userId);
      await directory.invalidate(userId);
    },

    /** Owner makes an existing member the owner; the caller becomes a caretaker. */
    async transferOwnership(
      userId: string,
      householdId: string,
      input: unknown,
    ): Promise<Member[]> {
      await directory.requireRole(userId, householdId, ['owner']);
      const { userId: newOwner } = transferInput.parse(input);
      if (newOwner === userId) throw invalid('you already own this household', '/userId');
      await unitOfWork.run(async (tx) => {
        if (!(await tx.households.findMember(householdId, newOwner))) throw notFound();
        await tx.households.setRole(householdId, newOwner, 'owner');
        await tx.households.setRole(householdId, userId, 'caretaker');
      });
      await directory.invalidate(userId, newOwner);
      return repos.households.listMembers(householdId);
    },
  };
}
export type HouseholdService = ReturnType<typeof createHouseholdService>;
