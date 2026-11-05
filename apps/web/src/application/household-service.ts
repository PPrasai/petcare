import type {
  CreatedInvite,
  HouseholdApi,
  InviteInfo,
  InvitePreview,
  InviteRole,
  InviteSecret,
  JoinedHousehold,
  MemberInfo,
} from './ports/household-api';

/**
 * Household use cases: members, roles, invites, joining and leaving. They need the server;
 * `refresh` re-reads the user's households afterwards so the app and sync pick up the change.
 */
export class HouseholdService {
  constructor(
    private readonly api: HouseholdApi,
    private readonly refresh: () => Promise<void>,
  ) {}

  /** Members, owner first and then in the order they joined. */
  async members(householdId: string): Promise<MemberInfo[]> {
    const rank = { owner: 0, caretaker: 1, viewer: 2 } as const;
    return (await this.api.members(householdId)).sort(
      (a, b) => rank[a.role] - rank[b.role] || a.joinedAt.localeCompare(b.joinedAt),
    );
  }

  changeRole(householdId: string, userId: string, role: InviteRole): Promise<void> {
    return this.api.changeRole(householdId, userId, role);
  }

  removeMember(householdId: string, userId: string): Promise<void> {
    return this.api.removeMember(householdId, userId);
  }

  async transferOwnership(householdId: string, userId: string): Promise<void> {
    await this.api.transferOwnership(householdId, userId);
    await this.refresh();
  }

  async rename(householdId: string, name: string): Promise<void> {
    await this.api.rename(householdId, name.trim());
    await this.refresh();
  }

  async leave(householdId: string): Promise<void> {
    await this.api.leave(householdId);
    await this.refresh();
  }

  /** Open invites only; the link and code of an invite are never shown again. */
  async invites(householdId: string): Promise<InviteInfo[]> {
    return (await this.api.invites(householdId)).filter((i) => i.status === 'open');
  }

  createInvite(householdId: string, role: InviteRole): Promise<CreatedInvite> {
    return this.api.createInvite(householdId, role);
  }

  revokeInvite(householdId: string, inviteId: string): Promise<void> {
    return this.api.revokeInvite(householdId, inviteId);
  }

  preview(secret: InviteSecret): Promise<InvitePreview> {
    return this.api.previewInvite(secret);
  }

  async join(secret: InviteSecret): Promise<JoinedHousehold> {
    const joined = await this.api.acceptInvite(secret);
    await this.refresh();
    return joined;
  }
}
