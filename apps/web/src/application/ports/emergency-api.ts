export type EmergencyErrorKind = 'offline' | 'forbidden' | 'notFound' | 'rateLimited' | 'other';

export class EmergencyError extends Error {
  constructor(readonly kind: EmergencyErrorKind) {
    super(kind);
    this.name = 'EmergencyError';
  }
}

/** Shown once, when the link is created. The address carries the secret token. */
export interface EmergencyLink {
  url: string;
  createdAt: string;
}

/** What a finder sees: `isLost` always, the rest only if the owner switched it on. */
export interface PublicEmergencyCard {
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

/** The emergency-link endpoints. The card itself is an ordinary synced record. */
export interface EmergencyApi {
  createLink(cardId: string): Promise<EmergencyLink>;
  revokeLink(cardId: string): Promise<void>;
  /** The public card behind a token, or null when the link is unknown or revoked. */
  publicCard(token: string): Promise<PublicEmergencyCard | null>;
}
