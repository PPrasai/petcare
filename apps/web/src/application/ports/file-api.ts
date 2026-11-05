export interface UploadedFile {
  id: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
}

/** The server's file endpoints as the sync engine and viewer see them. */
export interface FileApi {
  /** Throws NetworkError when offline and RemoteError for a refusal (413, 415, 409, ...). */
  upload(householdId: string, blob: Blob, name: string): Promise<UploadedFile>;
  /** The stored file, or null when the server does not have it. */
  download(fileId: string): Promise<Blob | null>;
}
