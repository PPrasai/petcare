import type { Repositories, UnitOfWork } from '../repositories';
import { toEnvelope } from '../repositories';
import { notFound } from './app-error';
import { hashToken, isLinkToken, newLinkToken } from './invite-codes';
import type { createMembershipDirectory } from './membership-directory';
import type { HouseholdFiles } from './ports';

export interface EmergencyServiceDeps {
  unitOfWork: UnitOfWork;
  directory: ReturnType<typeof createMembershipDirectory>;
  files: HouseholdFiles;
  clock: () => Date;
  appOrigin: string;
}

/** The public card: `isLost` always, everything else only if the owner switched it on. */
export interface PublicCard {
  isLost: boolean;
  lostSince?: string | null;
  lostMessage?: string | null;
  hasPhoto?: boolean;
  name?: string;
  species?: string;
  breed?: string | null;
  colour?: string | null;
  markings?: string | null;
  microchipId?: string | null;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  ownerDisplayName?: string | null;
  ownerPhone?: string | null;
  notes?: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The emergency card's public link and the minimal page behind it (CAP-14, AS I-08). */
export function createEmergencyService(deps: EmergencyServiceDeps) {
  const { unitOfWork, directory, files, clock, appOrigin } = deps;

  /** Owner-only access to a live card; non-members get 404, other members 403. */
  async function ownedCard(userId: string, cardId: string) {
    const row = await unitOfWork.repositories.records.find('emergencyCard', cardId);
    if (!row || row.deletedAt) throw notFound();
    await directory.requireRole(userId, row.householdId, ['owner']);
    return row;
  }

  /** The live card, its live pet, and the visible-field set behind a token. */
  async function resolve(repos: Repositories, token: string) {
    if (!isLinkToken(token)) throw notFound();
    const cardId = await repos.emergency.cardOfToken(hashToken(token));
    if (!cardId) throw notFound();
    const cardRow = await repos.records.find('emergencyCard', cardId);
    if (!cardRow || cardRow.deletedAt) throw notFound();
    const card = toEnvelope('emergencyCard', cardRow).data;
    const petRow = await repos.records.find('pet', String(card.petId));
    if (!petRow || petRow.deletedAt) throw notFound();
    const pet = toEnvelope('pet', petRow).data;
    const fields = Array.isArray(card.visibleFields) ? (card.visibleFields as string[]) : [];
    return {
      card,
      pet,
      petId: petRow.id,
      householdId: petRow.householdId,
      visible: new Set(fields),
    };
  }

  return {
    async createLink(userId: string, cardId: string): Promise<{ url: string; createdAt: Date }> {
      await ownedCard(userId, cardId);
      const token = newLinkToken();
      const createdAt = await unitOfWork.repositories.emergency.replaceToken(
        cardId,
        hashToken(token),
      );
      return { url: `${appOrigin}/e/${token}`, createdAt };
    },

    async revokeLink(userId: string, cardId: string): Promise<void> {
      await ownedCard(userId, cardId);
      await unitOfWork.repositories.emergency.deleteToken(cardId);
    },

    async publicCard(token: string): Promise<PublicCard> {
      const repos = unitOfWork.repositories;
      const { card, pet, petId, visible } = await resolve(repos, token);
      const out: PublicCard = { isLost: card.isLost === true };
      if (out.isLost) {
        out.lostSince = text(card.lostSince);
        out.lostMessage = text(card.lostMessage);
      }
      if (visible.has('photo')) out.hasPhoto = typeof pet.photoFileId === 'string';
      if (visible.has('name')) out.name = String(pet.name);
      if (visible.has('species')) out.species = String(pet.speciesOther ?? pet.species);
      for (const key of ['breed', 'colour', 'markings', 'microchipId'] as const) {
        if (visible.has(key)) out[key] = text(pet[key]);
      }
      if (visible.has('ownerDisplayName')) out.ownerDisplayName = text(card.ownerDisplayName);
      if (visible.has('ownerPhone')) out.ownerPhone = text(card.ownerPhone);
      if (visible.has('notes')) out.notes = text(card.notes);
      if (visible.has('allergies') || visible.has('conditions') || visible.has('medications')) {
        const health = await repos.emergency.healthNames(petId);
        const today = clock().toISOString().slice(0, 10);
        if (visible.has('allergies')) out.allergies = health.allergies;
        if (visible.has('conditions')) out.conditions = health.conditions;
        if (visible.has('medications')) {
          out.medications = health.medications
            .filter((m) => m.endOn === null || m.endOn >= today)
            .map((m) => m.name);
        }
      }
      return out;
    },

    /** The pet's photo, only while "photo" is switched on. */
    async publicPhoto(token: string): Promise<{ bytes: Buffer; mimeType: string }> {
      const repos = unitOfWork.repositories;
      const { pet, householdId, visible } = await resolve(repos, token);
      if (!visible.has('photo') || typeof pet.photoFileId !== 'string') throw notFound();
      const file = await repos.files.find(pet.photoFileId);
      if (!file || file.householdId !== householdId) throw notFound();
      if (!file.mimeType.startsWith('image/')) throw notFound();
      const bytes = await files.read(file.householdId, file.id);
      if (!bytes) throw notFound();
      return { bytes, mimeType: file.mimeType };
    },
  };
}
export type EmergencyService = ReturnType<typeof createEmergencyService>;
