/** What the app knows about a stored file when it shows it. */
export interface FileView {
  /** An object URL the browser can display or open. Revoke it with `release` when done. */
  url: string;
  mimeType: string;
  name: string | null;
}

export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

/**
 * The browser refused to keep the file on this device (WebKit private or ephemeral sessions do not
 * let IndexedDB store a Blob). Nothing was stored; the rest of a save can go ahead without it.
 */
export class FileStorageUnavailable extends Error {
  constructor() {
    super('files cannot be stored in this browser mode');
    this.name = 'FileStorageUnavailable';
  }
}

/** True for the errors browsers raise when IndexedDB refuses a Blob. */
export function isBlobStorageError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`;
  return /blob|DataCloneError/i.test(text);
}

/** The result of storing a file locally: the id records refer to until the upload happens. */
export interface AttachedFile {
  fileId: string;
}

/**
 * Files for documents, receipts and photos (CAP-12). A file chosen offline is kept on the
 * device and uploaded by the next sync; records refer to it through `fileId` straight away.
 */
export interface FileGateway {
  /** Keeps the file on this device for upload and returns the id to put in a record. */
  attach(householdId: string, file: File): Promise<AttachedFile>;
  /** The file's contents for display: from this device when held, else downloaded and kept. */
  open(fileId: string): Promise<FileView | null>;
  release(url: string): void;
  /**
   * Lets go of a file no record refers to any more (a replaced or removed pet photo): its copy
   * on this device goes, and so does an upload that has not happened yet. The server's copy is
   * left for its own clean-up.
   */
  discard(fileId: string): Promise<void>;
}
