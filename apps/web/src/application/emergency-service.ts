import { EMERGENCY_FIELDS } from '@petcare/domain';
import type { EmergencyApi, EmergencyLink, PublicEmergencyCard } from './ports/emergency-api';
import type { RecordStore, StoredRecord } from './ports/record-store';
import { checkRecord, withoutEmptyValues } from './record-checks';

export type EmergencyField = (typeof EMERGENCY_FIELDS)[number];

/** What a new card shows until the owner opts in to more: the pet's face, name and species. */
export const DEFAULT_VISIBLE: EmergencyField[] = ['photo', 'name', 'species'];

export interface EmergencyForm {
  visibleFields: EmergencyField[];
  ownerDisplayName: string;
  ownerPhone: string;
  notes: string;
}

/** The emergency card of a pet and its public link (CAP-14). */
export class EmergencyService {
  constructor(
    private readonly records: RecordStore,
    private readonly api: EmergencyApi,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The pet's live card, if it has one. */
  async get(householdId: string, petId: string): Promise<StoredRecord | null> {
    const cards = await this.records.list('emergencyCard', householdId);
    return cards.find((c) => c.deletedAt === null && c.data.petId === petId) ?? null;
  }

  /** Creates the card on first save, then updates it. Empty text clears the field. */
  async save(householdId: string, petId: string, form: EmergencyForm): Promise<StoredRecord> {
    const existing = await this.get(householdId, petId);
    const fields = {
      visibleFields: EMERGENCY_FIELDS.filter((f) => form.visibleFields.includes(f)),
      ownerDisplayName: form.ownerDisplayName.trim() || null,
      ownerPhone: form.ownerPhone.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (existing) {
      checkRecord('emergencyCard', { ...existing.data, ...fields });
      return this.records.update('emergencyCard', existing.id, fields);
    }
    const data = withoutEmptyValues({ petId, isLost: false, ...fields });
    checkRecord('emergencyCard', data);
    return this.records.create('emergencyCard', householdId, data);
  }

  /** Lost mode: shown prominently on the public page, with an optional message. */
  async markLost(householdId: string, petId: string, message: string): Promise<StoredRecord> {
    const fields = {
      isLost: true,
      lostSince: this.clock().toISOString(),
      lostMessage: message.trim() || null,
    };
    const existing = await this.get(householdId, petId);
    if (existing) return this.records.update('emergencyCard', existing.id, fields);
    const data = withoutEmptyValues({
      petId,
      visibleFields: DEFAULT_VISIBLE,
      ...fields,
    });
    checkRecord('emergencyCard', data);
    return this.records.create('emergencyCard', householdId, data);
  }

  async markFound(householdId: string, petId: string): Promise<StoredRecord | null> {
    const existing = await this.get(householdId, petId);
    if (!existing) return null;
    return this.records.update('emergencyCard', existing.id, {
      isLost: false,
      lostSince: null,
      lostMessage: null,
    });
  }

  /** Creates or regenerates the public link (the old one stops working). Needs a connection. */
  createLink(cardId: string): Promise<EmergencyLink> {
    return this.api.createLink(cardId);
  }

  revokeLink(cardId: string): Promise<void> {
    return this.api.revokeLink(cardId);
  }

  /** The public page for a token; null for an unknown or revoked link. */
  publicCard(token: string): Promise<PublicEmergencyCard | null> {
    return this.api.publicCard(token);
  }
}
