import type { MeasurementService } from './measurement-service';
import type { PetService } from './pet-service';
import type { SyncControl } from './ports/sync-control';

export type SignInResult = { ok: true } | { ok: false; reason: 'invalid' | 'exists' | 'other' };

/** Account and session actions. The app layer implements them (they open and wipe local data). */
export interface SessionControl {
  signInEmail(email: string, password: string): Promise<SignInResult>;
  signUpEmail(name: string, email: string, password: string): Promise<SignInResult>;
  /** Resolves with the URL to send the browser to. */
  signInSocial(provider: string): Promise<string>;
  /** Signs out and wipes this device's data. Unsynced changes are lost. */
  signOut(): Promise<void>;
}

/** Everything the features may call. Provided once by the app layer. */
export interface Services {
  session: SessionControl;
  sync: SyncControl;
  pets: PetService;
  measurements: MeasurementService;
}
