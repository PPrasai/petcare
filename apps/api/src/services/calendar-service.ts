import { createEvents } from 'ics';
import type { EventAttributes } from 'ics';
import { dueOccurrences } from '@petcare/domain';
import type { SourceType } from '@petcare/domain';
import { toEnvelope } from '../repositories';
import type { UnitOfWork } from '../repositories';
import { AppError, notFound } from './app-error';
import { hashToken, isLinkToken, newLinkToken } from './invite-codes';
import { SOURCE_TYPES } from './notification-derivation';
import type { KeyValueCache, Limiter } from './ports';

export const CALENDAR_PAST_DAYS = 30;
export const CALENDAR_FUTURE_DAYS = 365;
const FEED_CACHE_SECONDS = 300;
const FEED_LIMIT = { max: 60, windowSeconds: 3600 };
const DAY_MS = 86_400_000;

export interface CalendarServiceDeps {
  unitOfWork: UnitOfWork;
  cache: KeyValueCache;
  limiter: Limiter;
  clock: () => Date;
  appOrigin: string;
}

const label: Record<SourceType, string> = {
  vaccination: 'Vaccination due',
  medication: 'Medication',
  careRoutine: 'Care',
  reminder: 'Reminder',
  vetVisit: 'Vet follow-up',
};

/** The user's calendar feed link and the iCalendar feed itself (CAP-08). */
export function createCalendarService(deps: CalendarServiceDeps) {
  const { unitOfWork, cache, limiter, clock, appOrigin } = deps;

  /** Builds the feed: one event per occurrence, with an alarm at the user's lead time. */
  async function buildFeed(userId: string): Promise<string> {
    const repos = unitOfWork.repositories;
    const prefs = await repos.preferences.get(userId);
    const households = (await repos.households.membershipsOf(userId)).map((m) => m.householdId);
    const now = clock();
    const window = {
      from: new Date(now.getTime() - CALENDAR_PAST_DAYS * DAY_MS),
      to: new Date(now.getTime() + CALENDAR_FUTURE_DAYS * DAY_MS),
    };
    const events: EventAttributes[] = [];
    for (const type of SOURCE_TYPES) {
      const records = (await repos.notifications.liveRecords(type, households)).map((r) =>
        toEnvelope(type, r),
      );
      const pets = new Map<string, string>();
      for (const record of records) {
        const petId = typeof record.data.petId === 'string' ? record.data.petId : null;
        if (petId && !pets.has(petId)) {
          const pet = await repos.records.find('pet', petId);
          pets.set(petId, pet ? String(toEnvelope('pet', pet).data.name) : '');
        }
      }
      const byId = new Map(records.map((r) => [r.id, r]));
      for (const o of dueOccurrences(records, window, prefs.timeZone)) {
        const source = byId.get(o.sourceId);
        if (!source || source.data.active === false) continue;
        const name = String(
          source.data.title ?? source.data.name ?? source.data.vaccineName ?? label[type],
        );
        const pet = o.petId ? pets.get(o.petId) : '';
        const at = new Date(o.occurrenceAt);
        events.push({
          uid: `${type}-${o.sourceId}-${at.getTime()}@petcare`,
          start: [
            at.getUTCFullYear(),
            at.getUTCMonth() + 1,
            at.getUTCDate(),
            at.getUTCHours(),
            at.getUTCMinutes(),
          ],
          startInputType: 'utc',
          startOutputType: 'utc',
          duration: { minutes: 15 },
          title: pet ? `${name} (${pet})` : name,
          description: label[type],
          alarms: [
            {
              action: 'display',
              description: name,
              trigger: { before: true, minutes: prefs.leadMinutes[type] },
            },
          ],
        });
      }
    }
    const { error, value } = createEvents(events, { calName: 'PetCare', productId: 'petcare' });
    if (error || !value) throw new AppError('internal', 500);
    return value;
  }

  return {
    async linkExists(userId: string): Promise<{ exists: boolean; createdAt: Date | null }> {
      const found = await unitOfWork.repositories.notifications.calendarOf(userId);
      return { exists: found !== null, createdAt: found?.createdAt ?? null };
    },

    /** Creates a feed link, or replaces the old one (which stops working). Shown once. */
    async createLink(userId: string): Promise<{ url: string; createdAt: Date }> {
      const token = newLinkToken();
      const createdAt = await unitOfWork.repositories.notifications.replaceCalendarToken(
        userId,
        hashToken(token),
      );
      return { url: `${appOrigin}/cal/${token}.ics`, createdAt };
    },

    async revokeLink(userId: string): Promise<void> {
      await unitOfWork.repositories.notifications.deleteCalendarToken(userId);
    },

    /** The iCalendar text for a token. 404 for an unknown or revoked token; 60 requests an hour. */
    async feed(token: string): Promise<string> {
      if (!isLinkToken(token)) throw notFound();
      const hash = hashToken(token);
      const userId = await unitOfWork.repositories.notifications.userOfCalendarToken(hash);
      if (!userId) throw notFound();
      const { count, retryAfterSeconds } = await limiter.hit(
        `cal:${hash.toString('hex')}`,
        FEED_LIMIT.windowSeconds,
      );
      if (count > FEED_LIMIT.max) {
        throw new AppError('rateLimited', 429, undefined, undefined, retryAfterSeconds);
      }
      const key = `ics:${hash.toString('hex')}`;
      const cached = await cache.get(key);
      if (cached !== null) return cached;
      const feed = await buildFeed(userId);
      await cache.set(key, feed, FEED_CACHE_SECONDS);
      return feed;
    },
  };
}
export type CalendarService = ReturnType<typeof createCalendarService>;
