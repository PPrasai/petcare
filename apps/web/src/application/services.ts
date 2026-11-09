import type { ConflictService } from './conflict-service';
import type { ContactService } from './contact-service';
import type { DocumentService } from './document-service';
import type { EmergencyService } from './emergency-service';
import type { ExpenseService } from './expense-service';
import type { FileGateway } from './ports/file-gateway';
import type { HealthService } from './health-service';
import type { AccountService } from './account-service';
import type { HouseholdService } from './household-service';
import type { TodayService } from './today-service';
import type { LogService } from './log-service';
import type { MeasurementService } from './measurement-service';
import type { PetService } from './pet-service';
import type { PushControl } from './ports/push-control';
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
  /** Opens the on-device demo (CAP-03). Makes no network request. */
  startDemo(): Promise<void>;
  /** Throws away the demo's changes and starts again from the sample data. */
  resetDemo(): Promise<void>;
  /** Leaves the demo; its data stays on this device until reset. */
  exitDemo(): Promise<void>;
}

/** Everything the features may call. Provided once by the app layer. */
export interface Services {
  session: SessionControl;
  sync: SyncControl;
  pets: PetService;
  measurements: MeasurementService;
  health: HealthService;
  today: TodayService;
  push: PushControl;
  files: FileGateway;
  documents: DocumentService;
  expenses: ExpenseService;
  contacts: ContactService;
  households: HouseholdService;
  conflicts: ConflictService;
  emergency: EmergencyService;
  account: AccountService;
  log: LogService;
}
