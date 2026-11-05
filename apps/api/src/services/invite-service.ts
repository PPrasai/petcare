import { INVITE_EXPIRY_DAYS } from '@petcare/domain';
import { z } from 'zod';
import type { HouseholdSummary, InviteRow, UnitOfWork } from '../repositories';
import { AppError, notFound } from './app-error';
import {
  displayCode,
  hashCode,
  hashToken,
  isLinkToken,
  newInviteCode,
  newLinkToken,
  normalizeCode,
} from './invite-codes';
import type { MembershipDirectory } from './membership-directory';
import type { Limiter, Metrics } from './ports';

const USER_LIMIT = { max: 10, windowSeconds: 3600 };
const IP_LIMIT = { max: 30, windowSeconds: 3600 };

export type InviteStatus = 'open' | 'used' | 'revoked' | 'expired';

export interface Invite {
  id: string;
  role: 'caretaker' | 'viewer';
  createdAt: Date;
  expiresAt: Date;
  status: InviteStatus;
}

export interface InviteServiceDeps {
  unitOfWork: UnitOfWork;
  directory: MembershipDirectory;
  limiter: Limiter;
  metrics: Metrics;
  newId: () => string;
  clock: () => Date;
  /** Base URL used to build the invite link, e.g. https://petcare.pprasai.io */
  appOrigin: string;
}

const createInput = z.strictObject({ role: z.enum(['caretaker', 'viewer']) });

export function statusOf(invite: InviteRow, now: Date): InviteStatus {
  if (invite.usedAt) return 'used';
  if (invite.revokedAt) return 'revoked';
  return invite.expiresAt <= now ? 'expired' : 'open';
}

export function createInviteService(deps: InviteServiceDeps) {
  const { unitOfWork, directory, limiter, metrics, newId, clock } = deps;
  const repos = unitOfWork.repositories;

  const present = (row: InviteRow): Invite => ({
    id: row.id,
    role: row.role,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: statusOf(row, clock()),
  });

  /**
   * Every preview and accept attempt counts against 10 per hour per user and 30 per hour per IP,
   * in one shared bucket (CON-petcare-001 section 2.1, AS ISS-AS-02).
   */
  async function countAttempt(userId: string, ip: string): Promise<void> {
    const [byUser, byIp] = await Promise.all([
      limiter.hit(`invite:user:${userId}`, USER_LIMIT.windowSeconds),
      limiter.hit(`invite:ip:${ip}`, IP_LIMIT.windowSeconds),
    ]);
    const over = byUser.count > USER_LIMIT.max || byIp.count > IP_LIMIT.max;
    if (over) {
      metrics.inviteAttempt('rateLimited');
      const retry =
        byUser.count > USER_LIMIT.max ? byUser.retryAfterSeconds : byIp.retryAfterSeconds;
      throw new AppError('rateLimited', 429, undefined, undefined, retry);
    }
  }

  /** Finds a usable (open) invite from a link token or a typed code; anything else is 404. */
  async function findOpen(input: unknown) {
    const secret = z
      .object({ token: z.string().optional(), code: z.string().optional() })
      .safeParse(input);
    if (!secret.success) return null;
    const { token, code } = secret.data;
    if ((token === undefined) === (code === undefined)) return null;

    let found: Awaited<ReturnType<typeof repos.invites.findBySecret>> = null;
    if (token !== undefined) {
      if (isLinkToken(token))
        found = await repos.invites.findBySecret({ tokenHash: hashToken(token) });
    } else if (code !== undefined) {
      const normalized = normalizeCode(code);
      if (normalized) found = await repos.invites.findBySecret({ codeHash: hashCode(normalized) });
    }
    return found && statusOf(found, clock()) === 'open' ? found : null;
  }

  return {
    async create(userId: string, householdId: string, input: unknown) {
      await directory.requireRole(userId, householdId, ['owner']);
      const { role } = createInput.parse(input);
      const token = newLinkToken();
      const code = newInviteCode();
      const expiresAt = new Date(clock().getTime() + INVITE_EXPIRY_DAYS * 86_400_000);
      const row = await repos.invites.insert({
        id: newId(),
        householdId,
        role,
        tokenHash: hashToken(token),
        codeHash: hashCode(code),
        createdBy: userId,
        expiresAt,
      });
      return {
        ...present(row),
        link: `${deps.appOrigin}/join#${token}`,
        code: displayCode(code),
      };
    },

    /** Open invites only. Secrets are never returned again. */
    async list(userId: string, householdId: string): Promise<Invite[]> {
      await directory.requireRole(userId, householdId, ['owner']);
      const rows = await repos.invites.listForHousehold(householdId);
      return rows.map(present).filter((i) => i.status === 'open');
    },

    async revoke(userId: string, householdId: string, inviteId: string): Promise<void> {
      await directory.requireRole(userId, householdId, ['owner']);
      if (!(await repos.invites.findInHousehold(householdId, inviteId))) throw notFound();
      await repos.invites.revoke(inviteId, clock());
    },

    async preview(userId: string, ip: string, input: unknown) {
      await countAttempt(userId, ip);
      const invite = await findOpen(input);
      if (!invite) {
        metrics.inviteAttempt('notFound');
        throw notFound();
      }
      metrics.inviteAttempt('ok');
      return {
        householdName: invite.householdName,
        role: invite.role,
        expiresAt: invite.expiresAt,
      };
    },

    /** Joins the household. Already a member: succeeds, role unchanged, invite stays open. */
    async accept(userId: string, ip: string, input: unknown): Promise<HouseholdSummary> {
      await countAttempt(userId, ip);
      const invite = await findOpen(input);
      if (!invite) {
        metrics.inviteAttempt('notFound');
        throw notFound();
      }
      await unitOfWork.run(async (tx) => {
        if (await tx.households.findMember(invite.householdId, userId)) return;
        if (!(await tx.invites.markUsed(invite.id, userId, clock()))) throw notFound();
        await tx.households.insertMembership({
          householdId: invite.householdId,
          userId,
          role: invite.role,
        });
      });
      await directory.invalidate(userId);
      metrics.inviteAttempt('ok');
      const summary = await repos.households.summaryFor(invite.householdId, userId);
      if (!summary) throw notFound();
      return summary;
    },
  };
}
export type InviteService = ReturnType<typeof createInviteService>;
