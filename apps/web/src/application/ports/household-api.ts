export type MemberRole = 'owner' | 'caretaker' | 'viewer';
export type InviteRole = 'caretaker' | 'viewer';

export interface MemberInfo {
  userId: string;
  name: string;
  role: MemberRole;
  joinedAt: string;
}

export interface InviteInfo {
  id: string;
  role: InviteRole;
  createdAt: string;
  expiresAt: string;
  status: 'open' | 'used' | 'revoked' | 'expired';
}

/** Shown once, when the invite is created. */
export interface CreatedInvite extends InviteInfo {
  link: string;
  code: string;
}

export interface InvitePreview {
  householdName: string;
  role: InviteRole;
  expiresAt: string;
}

/** Either the long token from the link or the short code typed by hand. */
export type InviteSecret = { token: string } | { code: string };

export interface JoinedHousehold {
  id: string;
  name: string;
  role: MemberRole;
  memberCount: number;
}

export type HouseholdFailure =
  'offline' | 'forbidden' | 'notFound' | 'lastOwner' | 'rateLimited' | 'invalid' | 'other';

export class HouseholdError extends Error {
  constructor(readonly kind: HouseholdFailure) {
    super(kind);
    this.name = 'HouseholdError';
  }
}

/** Household management over the REST endpoints. Online only; failures throw HouseholdError. */
export interface HouseholdApi {
  members(householdId: string): Promise<MemberInfo[]>;
  changeRole(householdId: string, userId: string, role: InviteRole): Promise<void>;
  removeMember(householdId: string, userId: string): Promise<void>;
  leave(householdId: string): Promise<void>;
  transferOwnership(householdId: string, userId: string): Promise<void>;
  rename(householdId: string, name: string): Promise<void>;
  invites(householdId: string): Promise<InviteInfo[]>;
  createInvite(householdId: string, role: InviteRole): Promise<CreatedInvite>;
  revokeInvite(householdId: string, inviteId: string): Promise<void>;
  previewInvite(secret: InviteSecret): Promise<InvitePreview>;
  acceptInvite(secret: InviteSecret): Promise<JoinedHousehold>;
  resolveConflict(conflictId: string): Promise<void>;
}
